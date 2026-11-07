import { type InputChannel, inputChannels } from "./input.ts";
import {
  type CodecEfficiency,
  jitterBufferTargetFor,
  orderCodecs,
  type PathClass,
  prefersHardware,
  type SenderPreset,
  type SessionKind,
} from "./media.ts";
import type { IceCandidateInit } from "./messages.ts";
import { type StatsEntry, selectedPathOf } from "./stats.ts";

export const peerConfiguration: RTCConfiguration = { iceServers: [] };

export interface EncodingProbe {
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
  readonly bitrate: number;
}

export interface RtcEnvironment {
  connection(configuration: RTCConfiguration): RTCPeerConnection;
  videoCodecs(): readonly RTCRtpCodec[];
  efficiency(mimeTypes: readonly string[], probe: EncodingProbe): Promise<CodecEfficiency[]>;
}

export type PeerSignal =
  | { type: "offer" | "answer"; sdp: string }
  | { type: "candidate"; candidate: IceCandidateInit };

export interface PeerEvents {
  signal(signal: PeerSignal): void;
  state(state: RTCPeerConnectionState): void;
  path?(path: PathClass): void;
}

export interface Peer {
  addCandidate(candidate: IceCandidateInit): Promise<void>;
  stats(): Promise<StatsEntry[]>;
  close(): void;
}

export interface SenderPeer extends Peer {
  start(): Promise<void>;
  accept(answerSdp: string): Promise<void>;
  replaceTrack(track: MediaStreamTrack): Promise<void>;
  applyPreset(preset: SenderPreset): Promise<void>;
}

export interface ViewerPeer extends Peer {
  accept(offerSdp: string): Promise<void>;
  sendInput(channel: InputChannel, data: string): boolean;
}

export interface InputLink {
  send(channel: InputChannel, data: string): boolean;
}

export interface SenderOptions {
  readonly rtc: RtcEnvironment;
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  readonly preset: SenderPreset;
  readonly events: PeerEvents;
  readonly inputs?: ((channel: InputChannel, data: string) => void) | undefined;
}

export interface ViewerOptions {
  readonly rtc: RtcEnvironment;
  readonly kind: SessionKind;
  readonly events: PeerEvents;
  readonly control?: boolean | undefined;
  stream(stream: MediaStream): void;
}

export function senderPeer(options: SenderOptions): SenderPeer {
  const { rtc, events } = options;
  const connection = rtc.connection(peerConfiguration);
  const transceiver = connection.addTransceiver(options.track, {
    direction: "sendonly",
    streams: [options.stream],
  });
  let track = options.track;
  let preset = options.preset;
  if (options.inputs !== undefined) openInputChannels(connection, options.inputs);
  const described = wireEvents(connection, events);

  const applyPreset = async (next: SenderPreset): Promise<void> => {
    preset = next;
    track.contentHint = next.contentHint;
    await transceiver.sender.setParameters(
      presetParameters(transceiver.sender.getParameters(), next),
    );
  };

  return {
    start: async () => {
      await preferCodecs(rtc, transceiver, track, preset);
      await applyPreset(preset);
      await connection.setLocalDescription(await connection.createOffer());
      events.signal({ type: "offer", sdp: connection.localDescription?.sdp ?? "" });
      described();
    },
    accept: (answerSdp) => connection.setRemoteDescription({ type: "answer", sdp: answerSdp }),
    replaceTrack: async (next) => {
      next.contentHint = preset.contentHint;
      await transceiver.sender.replaceTrack(next);
      track = next;
    },
    applyPreset,
    ...peerBasics(connection),
  };
}

export function viewerPeer(options: ViewerOptions): ViewerPeer {
  const { events } = options;
  const connection = options.rtc.connection(peerConfiguration);
  const link = options.control === true ? openInputChannels(connection) : undefined;
  const described = wireEvents(connection, events);
  connection.addEventListener("track", (event) => {
    setJitterTarget(event.receiver, jitterBufferTargetFor(options.kind));
    options.stream(event.streams[0] ?? new MediaStream([event.track]));
  });
  return {
    accept: async (offerSdp) => {
      await connection.setRemoteDescription({ type: "offer", sdp: offerSdp });
      await connection.setLocalDescription(await connection.createAnswer());
      events.signal({ type: "answer", sdp: connection.localDescription?.sdp ?? "" });
      described();
    },
    sendInput: (channel, data) => link?.send(channel, data) ?? false,
    ...peerBasics(connection),
  };
}

export function presetParameters(
  parameters: RTCRtpSendParameters,
  preset: SenderPreset,
): RTCRtpSendParameters {
  const encodings = parameters.encodings.length === 0 ? [{}] : parameters.encodings;
  return {
    ...parameters,
    degradationPreference: preset.degradationPreference,
    encodings: encodings.map((encoding) => ({
      ...encoding,
      maxBitrate: preset.maxBitrate,
      maxFramerate: preset.maxFramerate,
      scaleResolutionDownBy: preset.scaleResolutionDownBy,
    })),
  } as RTCRtpSendParameters;
}

export function browserRtc(): RtcEnvironment {
  return {
    connection: (configuration) => new RTCPeerConnection(configuration),
    videoCodecs: () => RTCRtpSender.getCapabilities("video")?.codecs ?? [],
    efficiency: (mimeTypes, probe) =>
      Promise.all(
        mimeTypes.map(async (mimeType): Promise<CodecEfficiency> => {
          const info = await navigator.mediaCapabilities
            .encodingInfo({
              type: "webrtc",
              video: { contentType: mimeType, ...probe, framerate: probe.frameRate },
            })
            .catch(() => ({ supported: false, powerEfficient: false }));
          return { mimeType, supported: info.supported, powerEfficient: info.powerEfficient };
        }),
      ),
  };
}

async function preferCodecs(
  rtc: RtcEnvironment,
  transceiver: RTCRtpTransceiver,
  track: MediaStreamTrack,
  preset: SenderPreset,
): Promise<void> {
  const codecs = rtc.videoCodecs();
  if (codecs.length === 0) return;
  const settings = track.getSettings();
  const width = settings.width ?? 1920;
  const height = settings.height ?? 1080;
  const frameRate = settings.frameRate ?? preset.idealFrameRate;
  const mimeTypes = [...new Set(codecs.map((codec) => codec.mimeType))];
  const efficiency = await rtc.efficiency(mimeTypes, {
    width,
    height,
    frameRate,
    bitrate: preset.maxBitrate,
  });
  transceiver.setCodecPreferences(
    orderCodecs(
      codecs,
      efficiency,
      prefersHardware(preset, width, height, frameRate),
    ) as RTCRtpCodec[],
  );
}

export function openInputChannels(
  connection: Pick<RTCPeerConnection, "createDataChannel">,
  receive?: (channel: InputChannel, data: string) => void,
): InputLink {
  const open = (channel: InputChannel): RTCDataChannel => {
    const { label, ...init } = inputChannels[channel];
    const opened = connection.createDataChannel(label, { ...init, negotiated: true });
    if (receive !== undefined) {
      opened.addEventListener("message", (event) => {
        if (typeof event.data === "string") receive(channel, event.data);
      });
    }
    return opened;
  };
  const channels = { ctl: open("ctl"), ptr: open("ptr") };
  return {
    send: (channel, data) => {
      const target = channels[channel];
      if (target.readyState !== "open") return false;
      target.send(data);
      return true;
    },
  };
}

function peerBasics(connection: RTCPeerConnection): Peer {
  return {
    addCandidate: (candidate) =>
      connection.addIceCandidate({
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment ?? null,
      }),
    stats: async () => [...(await connection.getStats()).values()] as StatsEntry[],
    close: () => connection.close(),
  };
}

function wireEvents(connection: RTCPeerConnection, events: PeerEvents): () => void {
  const early: PeerSignal[] = [];
  let ready = false;
  connection.addEventListener("icecandidate", (event) => {
    const candidate = event.candidate;
    if (candidate === null || candidate.candidate === "") return;
    const signal: PeerSignal = {
      type: "candidate",
      candidate: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment,
      },
    };
    if (ready) events.signal(signal);
    else early.push(signal);
  });
  const observePath = pathObserver(connection, events);
  connection.addEventListener("connectionstatechange", () => {
    const state = connection.connectionState;
    if (state !== "connected" || events.path === undefined) return events.state(state);
    void observePath().finally(() => events.state(state));
  });
  return () => {
    ready = true;
    for (const signal of early.splice(0)) events.signal(signal);
  };
}

function pathObserver(connection: RTCPeerConnection, events: PeerEvents): () => Promise<void> {
  let reported: PathClass | undefined;
  let watched: RTCIceTransport | undefined;
  const observe = async (): Promise<void> => {
    watchPairChanges();
    const entries = await statsOf(connection);
    const path = entries === undefined ? undefined : selectedPathOf(entries);
    if (path === undefined || path === reported) return;
    reported = path;
    events.path?.(path);
  };
  const watchPairChanges = (): void => {
    const transport = iceTransportOf(connection);
    if (transport === undefined || transport === watched) return;
    watched = transport;
    transport.addEventListener("selectedcandidatepairchange", () => void observe());
  };
  return observe;
}

async function statsOf(connection: RTCPeerConnection): Promise<StatsEntry[] | undefined> {
  try {
    return [...(await connection.getStats()).values()] as StatsEntry[];
  } catch {
    return undefined;
  }
}

function iceTransportOf(connection: RTCPeerConnection): RTCIceTransport | undefined {
  const transceiver = connection.getTransceivers?.()[0];
  return (transceiver?.sender.transport ?? transceiver?.receiver.transport)?.iceTransport;
}

function setJitterTarget(receiver: RTCRtpReceiver, target: number | null): void {
  if ("jitterBufferTarget" in receiver) {
    (receiver as RTCRtpReceiver & { jitterBufferTarget: number | null }).jitterBufferTarget =
      target;
  }
}
