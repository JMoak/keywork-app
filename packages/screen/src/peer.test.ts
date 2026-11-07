import { describe, expect, it } from "vitest";
import { presetFor, relayPreset } from "./media.ts";
import {
  type PeerSignal,
  peerConfiguration,
  presetParameters,
  type RtcEnvironment,
  senderPeer,
  viewerPeer,
} from "./peer.ts";
import { tailnetCandidate } from "./testing.ts";

type Listener = (event: unknown) => void;

function fakeConnection() {
  const listeners = new Map<string, Listener[]>();
  const calls: string[] = [];
  let parameters: Record<string, unknown> = { transactionId: "t1", encodings: [{ active: true }] };
  const sender = {
    getParameters: () => {
      calls.push("getParameters");
      return structuredClone(parameters);
    },
    setParameters: async (next: Record<string, unknown>) => {
      calls.push("setParameters");
      parameters = next;
    },
    replaceTrack: async (track: { id: string }) => {
      calls.push(`replaceTrack ${track.id}`);
    },
  };
  const transceiver = {
    sender,
    preferences: [] as Array<{ mimeType: string }>,
    setCodecPreferences(codecs: Array<{ mimeType: string }>) {
      this.preferences = codecs;
    },
  };
  const connection = {
    configuration: undefined as unknown,
    localDescription: undefined as { sdp: string } | undefined,
    connectionState: "new",
    candidates: [] as unknown[],
    remote: undefined as unknown,
    addTransceiver: (_track: unknown, init: unknown) => {
      calls.push(`addTransceiver ${JSON.stringify(init).includes("sendonly") ? "sendonly" : "?"}`);
      return transceiver;
    },
    createOffer: async () => ({ type: "offer", sdp: "offer-sdp" }),
    createAnswer: async () => ({ type: "answer", sdp: "answer-sdp" }),
    setLocalDescription: async (description: { sdp: string }) => {
      calls.push("setLocalDescription");
      connection.localDescription = description;
    },
    setRemoteDescription: async (description: unknown) => {
      calls.push("setRemoteDescription");
      connection.remote = description;
    },
    addIceCandidate: async (candidate: unknown) => {
      connection.candidates.push(candidate);
    },
    getStats: async () => new Map([["T1", { type: "transport", id: "T1" }]]),
    close: () => calls.push("close"),
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    emit: (type: string, event: unknown) => {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
  return { connection, transceiver, calls, parameters: () => parameters };
}

function environment(fake: ReturnType<typeof fakeConnection>): RtcEnvironment {
  return {
    connection: (configuration) => {
      fake.connection.configuration = configuration;
      return fake.connection as unknown as RTCPeerConnection;
    },
    videoCodecs: () =>
      [
        { mimeType: "video/VP8", clockRate: 90000 },
        { mimeType: "video/VP9", clockRate: 90000 },
      ] as RTCRtpCodec[],
    efficiency: async (mimeTypes) =>
      mimeTypes.map((mimeType) => ({ mimeType, supported: true, powerEfficient: false })),
  };
}

function track(id: string) {
  return {
    id,
    contentHint: "",
    getSettings: () => ({ width: 2560, height: 1440, frameRate: 30 }),
  };
}

describe("the sender peer", () => {
  it("offers a sendonly stream with no ICE servers, preferred codecs and the preset applied first", async () => {
    const fake = fakeConnection();
    const signals: PeerSignal[] = [];
    const screen = track("screen-1");
    const peer = senderPeer({
      rtc: environment(fake),
      stream: {} as MediaStream,
      track: screen as unknown as MediaStreamTrack,
      preset: presetFor("direct", 1440),
      events: { signal: (signal) => signals.push(signal), state: () => {} },
    });
    await peer.start();
    expect(fake.connection.configuration).toEqual({ iceServers: [] });
    expect(peerConfiguration.iceServers).toEqual([]);
    expect(fake.transceiver.preferences.map((codec) => codec.mimeType)).toEqual([
      "video/VP9",
      "video/VP8",
    ]);
    expect(screen.contentHint).toBe("detail");
    expect(fake.parameters()).toMatchObject({
      degradationPreference: "maintain-resolution",
      encodings: [
        { active: true, maxBitrate: 8_000_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
      ],
    });
    expect(fake.calls).toEqual([
      "addTransceiver sendonly",
      "getParameters",
      "setParameters",
      "setLocalDescription",
    ]);
    expect(signals).toEqual([{ type: "offer", sdp: "offer-sdp" }]);
  });

  it("re-reads parameters for every preset change and swaps tracks without renegotiating", async () => {
    const fake = fakeConnection();
    const peer = senderPeer({
      rtc: environment(fake),
      stream: {} as MediaStream,
      track: track("screen-1") as unknown as MediaStreamTrack,
      preset: presetFor("direct", 1440),
      events: { signal: () => {}, state: () => {} },
    });
    await peer.applyPreset(relayPreset);
    const next = track("screen-2");
    await peer.replaceTrack(next as unknown as MediaStreamTrack);
    expect(next.contentHint).toBe("detail");
    expect(fake.calls).toEqual([
      "addTransceiver sendonly",
      "getParameters",
      "setParameters",
      "replaceTrack screen-2",
    ]);
    expect(fake.parameters()).toMatchObject({
      encodings: [{ maxBitrate: 1_500_000, scaleResolutionDownBy: 2 }],
    });
  });

  it("holds candidates gathered before the offer is signaled and sends them right after it", async () => {
    const fake = fakeConnection();
    const signals: PeerSignal[] = [];
    const states: string[] = [];
    const peer = senderPeer({
      rtc: environment(fake),
      stream: {} as MediaStream,
      track: track("screen-1") as unknown as MediaStreamTrack,
      preset: presetFor("direct", 1440),
      events: { signal: (signal) => signals.push(signal), state: (state) => states.push(state) },
    });
    fake.connection.emit("icecandidate", {
      candidate: {
        candidate: tailnetCandidate,
        sdpMid: "0",
        sdpMLineIndex: 0,
        usernameFragment: "u",
      },
    });
    fake.connection.emit("icecandidate", {
      candidate: { candidate: "", sdpMid: "0", sdpMLineIndex: 0 },
    });
    fake.connection.emit("icecandidate", { candidate: null });
    fake.connection.connectionState = "connected";
    fake.connection.emit("connectionstatechange", {});
    expect(signals).toEqual([]);
    await peer.start();
    const later = {
      candidate: tailnetCandidate.replace("47123", "47124"),
      sdpMid: "0",
      sdpMLineIndex: 0,
    };
    fake.connection.emit("icecandidate", { candidate: later });
    expect(signals).toEqual([
      { type: "offer", sdp: "offer-sdp" },
      {
        type: "candidate",
        candidate: {
          candidate: tailnetCandidate,
          sdpMid: "0",
          sdpMLineIndex: 0,
          usernameFragment: "u",
        },
      },
      { type: "candidate", candidate: later },
    ]);
    expect(states).toEqual(["connected"]);
    await peer.accept("answer-sdp");
    expect(fake.connection.remote).toEqual({ type: "answer", sdp: "answer-sdp" });
    expect(await peer.stats()).toEqual([{ type: "transport", id: "T1" }]);
    peer.close();
    expect(fake.calls.at(-1)).toBe("close");
  });

  it("fills an empty encodings list rather than leaving the cap unset", () => {
    const parameters = presetParameters(
      {
        transactionId: "t",
        encodings: [],
        codecs: [],
        headerExtensions: [],
        rtcp: {},
      } as RTCRtpSendParameters,
      relayPreset,
    );
    expect(parameters.encodings).toEqual([
      { maxBitrate: 1_500_000, maxFramerate: 15, scaleResolutionDownBy: 2 },
    ]);
  });
});

describe("the viewer peer", () => {
  it("answers the offer and sets the jitter buffer target for the session kind on the receiver", async () => {
    const fake = fakeConnection();
    const signals: PeerSignal[] = [];
    const streams: unknown[] = [];
    const peer = viewerPeer({
      rtc: environment(fake),
      kind: "control",
      events: { signal: (signal) => signals.push(signal), state: () => {} },
      stream: (stream) => streams.push(stream),
    });
    await peer.accept("offer-sdp");
    expect(fake.connection.remote).toEqual({ type: "offer", sdp: "offer-sdp" });
    expect(signals).toEqual([{ type: "answer", sdp: "answer-sdp" }]);
    const receiver = { jitterBufferTarget: 500 as number | null };
    const stream = { id: "remote" };
    fake.connection.emit("track", { receiver, streams: [stream], track: {} });
    expect(receiver.jitterBufferTarget).toBe(0);
    expect(streams).toEqual([stream]);
    await peer.addCandidate({ candidate: tailnetCandidate, sdpMid: "0", sdpMLineIndex: 0 });
    expect(fake.connection.candidates).toHaveLength(1);
  });
});

describe("the selected candidate pair's path class", () => {
  it("reports the path before connected, and again whenever the selected pair changes", async () => {
    const fake = fakeConnection();
    const listeners: Listener[] = [];
    const iceTransport = {
      addEventListener: (_type: string, listener: Listener) => listeners.push(listener),
    };
    let remoteType = "host";
    Object.assign(fake.connection, {
      getStats: async () => pairStats("host", remoteType),
      getTransceivers: () => [{ sender: { transport: { iceTransport } } }],
    });
    const heard: string[] = [];
    senderPeer({
      rtc: environment(fake),
      stream: {} as MediaStream,
      track: track("screen-1") as unknown as MediaStreamTrack,
      preset: presetFor("direct", 1440),
      events: {
        signal: () => {},
        state: (state) => heard.push(`state ${state}`),
        path: (path) => heard.push(`path ${path}`),
      },
    });
    fake.connection.connectionState = "connected";
    fake.connection.emit("connectionstatechange", {});
    await settled();
    expect(heard).toEqual(["path direct", "state connected"]);

    remoteType = "relay";
    for (const listener of [...listeners]) listener({});
    await settled();
    for (const listener of [...listeners]) listener({});
    await settled();
    expect(listeners).toHaveLength(1);
    expect(heard).toEqual(["path direct", "state connected", "path relayed"]);
  });
});

function pairStats(local: string, remote: string): Map<string, Record<string, unknown>> {
  return new Map([
    ["T1", { id: "T1", type: "transport", selectedCandidatePairId: "CP1" }],
    ["CP1", { id: "CP1", type: "candidate-pair", localCandidateId: "L", remoteCandidateId: "R" }],
    ["L", { id: "L", type: "local-candidate", candidateType: local, address: "100.64.0.1" }],
    ["R", { id: "R", type: "remote-candidate", candidateType: remote, address: "100.64.0.2" }],
  ]);
}

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
