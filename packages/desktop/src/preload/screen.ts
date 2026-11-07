import {
  browserRtc,
  type InputDraft,
  type InputSequencer,
  inputSequencer,
  type PeerSignal,
  type RtcEnvironment,
  ratesBetween,
  type SenderPeer,
  type StreamRates,
  type StreamStats,
  senderPeer,
  summarizeStats,
  type ViewerPeer,
  viewerPeer,
} from "@keywork-app/screen";
import {
  type ScreenHistory,
  type SenderCommand,
  screenChannels,
  senderWindowFlag,
  type ViewerEvent,
  type ViewRequest,
  type ViewStart,
} from "../main/screen/channels.ts";

export interface IpcRendererSeam {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

export type ScreenViewEvent =
  | Exclude<ViewerEvent, { kind: "remote" }>
  | { kind: "connection"; sessionId: string; state: RTCPeerConnectionState }
  | { kind: "stats"; sessionId: string; stats: StreamStats; rates: StreamRates };

export interface ScreenPort {
  view(request: ViewRequest): Promise<ViewStart>;
  attach(sessionId: string, video: HTMLVideoElement): void;
  onEvent(sessionId: string, listener: (event: ScreenViewEvent) => void): () => void;
  stop(sessionId: string): Promise<void>;
  cycleDisplay(sessionId: string): Promise<void>;
  history(): Promise<ScreenHistory>;
  input(sessionId: string, input: InputDraft): boolean;
}

export interface ScreenPortOptions {
  readonly rtc?: RtcEnvironment;
  readonly statsEveryMs?: number;
}

export function screenPort(ipc: IpcRendererSeam, options: ScreenPortOptions = {}): ScreenPort {
  const rtc = options.rtc ?? browserRtc();
  const statsEveryMs = options.statsEveryMs ?? 1000;
  const sessions = new Map<string, ViewerSession>();

  const sessionFor = (sessionId: string): ViewerSession => {
    const known = sessions.get(sessionId);
    if (known !== undefined) return known;
    const created: ViewerSession = {
      listeners: new Set(),
      replay: [],
      peer: undefined,
      stream: undefined,
      sequence: inputSequencer(),
    };
    sessions.set(sessionId, created);
    return created;
  };

  const emit = (sessionId: string, event: ScreenViewEvent): void => {
    const session = sessionFor(sessionId);
    if (event.kind !== "stats") session.replay.push(event);
    for (const listener of session.listeners) listener(event);
  };

  const pollStats = (sessionId: string, session: ViewerSession): void => {
    let previous: StreamStats | undefined;
    session.statsTimer = setInterval(async () => {
      const entries = await session.peer?.stats().catch(() => undefined);
      if (entries === undefined) return;
      const stats = summarizeStats(entries, "inbound", Date.now());
      emit(sessionId, { kind: "stats", sessionId, stats, rates: ratesBetween(previous, stats) });
      previous = stats;
    }, statsEveryMs);
  };

  const close = (session: ViewerSession): void => {
    clearInterval(session.statsTimer);
    session.peer?.close();
    session.peer = undefined;
    if (session.video !== undefined) session.video.srcObject = null;
  };

  const startPeer = (sessionId: string, session: ViewerSession, control: boolean): void => {
    session.peer = viewerPeer({
      rtc,
      kind: "view",
      control,
      events: {
        signal: (signal) => ipc.send(screenChannels.viewerSignal, sessionId, signal),
        state: (state) => {
          ipc.send(screenChannels.viewerState, sessionId, state);
          emit(sessionId, { kind: "connection", sessionId, state });
        },
      },
      stream: (stream) => {
        session.stream = stream;
        if (session.video !== undefined) session.video.srcObject = stream;
      },
    });
    pollStats(sessionId, session);
  };

  ipc.on(screenChannels.viewerEvent, (_event, payload) => {
    const event = payload as ViewerEvent;
    const session = sessionFor(event.sessionId);
    if (event.kind === "remote") return void deliver(session.peer, event.signal);
    if (event.kind === "granted") startPeer(event.sessionId, session, event.control !== undefined);
    if (event.kind === "ended") close(session);
    emit(event.sessionId, event);
  });

  return {
    view: (request) => ipc.invoke(screenChannels.view, request) as Promise<ViewStart>,
    attach: (sessionId, video) => {
      const session = sessionFor(sessionId);
      session.video = video;
      if (session.stream !== undefined) video.srcObject = session.stream;
    },
    onEvent: (sessionId, listener) => {
      const session = sessionFor(sessionId);
      for (const event of session.replay) listener(event);
      session.listeners.add(listener);
      return () => session.listeners.delete(listener);
    },
    stop: async (sessionId) => {
      await ipc.invoke(screenChannels.stop, sessionId);
    },
    cycleDisplay: async (sessionId) => {
      await ipc.invoke(screenChannels.cycleDisplay, sessionId);
    },
    history: () => ipc.invoke(screenChannels.history) as Promise<ScreenHistory>,
    input: (sessionId, input) => {
      const session = sessions.get(sessionId);
      if (session?.peer === undefined) return false;
      const stamped = session.sequence.stamp(input);
      return session.peer.sendInput(stamped.channel, JSON.stringify(stamped.input));
    },
  };
}

export function isScreenSenderWindow(argv: readonly string[]): boolean {
  return argv.includes(senderWindowFlag);
}

export interface SenderMedia {
  capture(frameRate: number): Promise<MediaStream>;
  grab(track: MediaStreamTrack, maxWidth: number): Promise<Uint8Array | undefined>;
}

export function startScreenSender(
  ipc: IpcRendererSeam,
  media: SenderMedia = browserMedia(),
  rtc: RtcEnvironment = browserRtc(),
): void {
  let peer: SenderPeer | undefined;
  let stream: MediaStream | undefined;
  let frameRate = 30;

  const videoTrack = (): MediaStreamTrack | undefined => stream?.getVideoTracks()[0];

  const capture = async (): Promise<MediaStreamTrack> => {
    const next = await media.capture(frameRate);
    const track = next.getVideoTracks()[0];
    if (track === undefined) throw new Error("the capture produced no video track");
    const previous = stream;
    stream = next;
    track.addEventListener("ended", () => {
      if (stream === next) ipc.send(screenChannels.senderState, "closed");
    });
    for (const old of previous?.getTracks() ?? []) old.stop();
    return track;
  };

  const run = async (command: SenderCommand): Promise<void> => {
    switch (command.kind) {
      case "start": {
        frameRate = command.frameRate;
        const track = await capture();
        peer = senderPeer({
          rtc,
          stream: stream as MediaStream,
          track,
          preset: command.preset,
          events: {
            signal: (signal) => ipc.send(screenChannels.senderSignal, signal),
            state: (state) => ipc.send(screenChannels.senderState, state),
            path: (path) => ipc.send(screenChannels.senderPath, path),
          },
          inputs:
            command.control === true
              ? (channel, data) => ipc.send(screenChannels.senderInput, channel, data)
              : undefined,
        });
        return peer.start();
      }
      case "remote":
        return deliver(peer, command.signal);
      case "recapture": {
        const track = await capture();
        return peer?.replaceTrack(track);
      }
      case "preset":
        return peer?.applyPreset(command.preset);
      case "frame": {
        const track = videoTrack();
        const jpeg = track === undefined ? undefined : await media.grab(track, command.maxWidth);
        ipc.send(screenChannels.senderFrame, { requestId: command.requestId, jpeg });
        return;
      }
    }
  };

  ipc.on(screenChannels.senderCommand, (_event, command) => {
    run(command as SenderCommand).catch(() => ipc.send(screenChannels.senderState, "failed"));
  });
  ipc.send(screenChannels.senderReady);
}

export function browserMedia(): SenderMedia {
  return {
    capture: (frameRate) =>
      navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: frameRate } },
        audio: false,
      }),
    grab: async (track, maxWidth) => {
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = new MediaStream([track]);
      await video.play();
      const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      video.srcObject = null;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8),
      );
      return blob === null ? undefined : new Uint8Array(await blob.arrayBuffer());
    },
  };
}

function deliver(
  peer: SenderPeer | ViewerPeer | undefined,
  signal: PeerSignal,
): Promise<void> | undefined {
  if (peer === undefined) return undefined;
  if (signal.type === "candidate") return peer.addCandidate(signal.candidate);
  return peer.accept(signal.sdp);
}

interface ViewerSession {
  readonly listeners: Set<(event: ScreenViewEvent) => void>;
  readonly replay: ScreenViewEvent[];
  peer: ViewerPeer | undefined;
  stream: MediaStream | undefined;
  readonly sequence: InputSequencer;
  video?: HTMLVideoElement;
  statsTimer?: ReturnType<typeof setInterval>;
}
