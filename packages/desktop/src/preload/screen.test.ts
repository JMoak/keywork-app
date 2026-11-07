import { presetFor, type RtcEnvironment } from "@keywork-app/screen";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screenChannels, senderWindowFlag } from "../main/screen/channels.ts";
import {
  type IpcRendererSeam,
  isScreenSenderWindow,
  type ScreenViewEvent,
  screenPort,
  startScreenSender,
} from "./screen.ts";

type Listener = (event: unknown, ...args: unknown[]) => void;

function fakeIpc() {
  const listeners = new Map<string, Listener>();
  const sent: Array<[string, ...unknown[]]> = [];
  const invoked: Array<[string, ...unknown[]]> = [];
  const ipc: IpcRendererSeam = {
    invoke: async (channel, ...args) => {
      invoked.push([channel, ...args]);
      return channel === screenChannels.view ? { ok: true, sessionId: "session-0001" } : [];
    },
    send: (channel, ...args) => {
      sent.push([channel, ...args]);
    },
    on: (channel, listener) => listeners.set(channel, listener),
  };
  const emit = (channel: string, payload: unknown) => listeners.get(channel)?.({}, payload);
  return { ipc, sent, invoked, emit };
}

function fakeRtc() {
  const connections: Array<Record<string, unknown> & { emit(type: string, event: unknown): void }> =
    [];
  const rtc: RtcEnvironment = {
    connection: (configuration) => {
      const listeners = new Map<string, Array<(event: unknown) => void>>();
      const connection = {
        configuration,
        remote: [] as unknown[],
        candidates: [] as unknown[],
        closed: false,
        connectionState: "new",
        localDescription: undefined as { sdp: string } | undefined,
        addTransceiver: () => ({
          sender: {
            getParameters: () => ({ encodings: [{}] }),
            setParameters: async () => {},
            replaceTrack: async () => {},
          },
          setCodecPreferences: () => {},
        }),
        createOffer: async () => ({ type: "offer", sdp: "offer" }),
        createAnswer: async () => ({ type: "answer", sdp: "answer" }),
        setLocalDescription: async (description: { sdp: string }) => {
          connection.localDescription = description;
        },
        setRemoteDescription: async (description: unknown) => {
          connection.remote.push(description);
        },
        addIceCandidate: async (candidate: unknown) => {
          connection.candidates.push(candidate);
        },
        getStats: async () =>
          new Map([
            [
              "IT",
              {
                type: "inbound-rtp",
                id: "IT",
                kind: "video",
                framesDecoded: 30,
                bytesReceived: 1000,
              },
            ],
          ]),
        close: () => {
          connection.closed = true;
        },
        addEventListener: (type: string, listener: (event: unknown) => void) => {
          listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
        emit: (type: string, event: unknown) => {
          for (const listener of listeners.get(type) ?? []) listener(event);
        },
      };
      connections.push(connection);
      return connection as unknown as RTCPeerConnection;
    },
    videoCodecs: () => [],
    efficiency: async () => [],
  };
  return { rtc, connections };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.useRealTimers());

describe("the viewer's screen port", () => {
  it("asks main to view, answers the offer in this world and hands the stream to the attached video", async () => {
    const { ipc, sent, invoked, emit } = fakeIpc();
    const { rtc, connections } = fakeRtc();
    const port = screenPort(ipc, { rtc, statsEveryMs: 60_000 });
    expect(await port.view({ peer: "nSpark" })).toEqual({ ok: true, sessionId: "session-0001" });
    expect(invoked).toEqual([[screenChannels.view, { peer: "nSpark" }]]);
    const seen: ScreenViewEvent[] = [];
    emit(screenChannels.viewerEvent, { kind: "asking", sessionId: "session-0001" });
    port.onEvent("session-0001", (event) => seen.push(event));
    expect(seen.map((event) => event.kind)).toEqual(["asking"]);
    const video = { srcObject: null as unknown };
    port.attach("session-0001", video as unknown as HTMLVideoElement);
    emit(screenChannels.viewerEvent, {
      kind: "granted",
      sessionId: "session-0001",
      displays: [],
      current: "1",
      expiresAt: "2026-11-05T10:00:00.000Z",
      path: "direct",
    });
    expect(connections[0]?.configuration).toEqual({ iceServers: [] });
    emit(screenChannels.viewerEvent, {
      kind: "remote",
      sessionId: "session-0001",
      signal: { type: "offer", sdp: "offer" },
    });
    await settle();
    expect(sent).toContainEqual([
      screenChannels.viewerSignal,
      "session-0001",
      { type: "answer", sdp: "answer" },
    ]);
    const candidate = {
      candidate: "candidate:1 1 udp 1 100.64.0.1 47100 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    };
    emit(screenChannels.viewerEvent, {
      kind: "remote",
      sessionId: "session-0001",
      signal: { type: "candidate", candidate },
    });
    await settle();
    expect(connections[0]?.candidates).toEqual([{ ...candidate, usernameFragment: null }]);
    const stream = { id: "remote-stream" };
    connections[0]?.emit("track", { receiver: {}, streams: [stream], track: {} });
    expect(video.srcObject).toBe(stream);
    (connections[0] as unknown as { connectionState: string }).connectionState = "connected";
    connections[0]?.emit("connectionstatechange", {});
    expect(sent).toContainEqual([screenChannels.viewerState, "session-0001", "connected"]);
    expect(seen.map((event) => event.kind)).toEqual(["asking", "granted", "connection"]);
    emit(screenChannels.viewerEvent, {
      kind: "ended",
      sessionId: "session-0001",
      reason: "kill-switch",
    });
    expect(connections[0]?.closed).toBe(true);
    expect(video.srcObject).toBeNull();
    expect(seen.at(-1)).toEqual({
      kind: "ended",
      sessionId: "session-0001",
      reason: "kill-switch",
    });
  });

  it("reports decoded frames and rates while the session runs", async () => {
    vi.useFakeTimers();
    const { ipc, emit } = fakeIpc();
    const { rtc } = fakeRtc();
    const port = screenPort(ipc, { rtc, statsEveryMs: 1000 });
    const stats: ScreenViewEvent[] = [];
    port.onEvent("session-0001", (event) => {
      if (event.kind === "stats") stats.push(event);
    });
    emit(screenChannels.viewerEvent, {
      kind: "granted",
      sessionId: "session-0001",
      displays: [],
      current: "1",
      expiresAt: "2026-11-05T10:00:00.000Z",
      path: "direct",
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(stats[0]).toMatchObject({ kind: "stats", stats: { frames: 30, bytes: 1000 } });
  });

  it("forwards stop, cycle and history to main", async () => {
    const { ipc, invoked } = fakeIpc();
    const port = screenPort(ipc, { rtc: fakeRtc().rtc });
    await port.stop("session-0001");
    await port.cycleDisplay("session-0001");
    await port.history();
    expect(invoked.map((call) => call[0])).toEqual([
      screenChannels.stop,
      screenChannels.cycleDisplay,
      screenChannels.history,
    ]);
  });
});

describe("the sender window", () => {
  it("is recognized by its launch flag only", () => {
    expect(isScreenSenderWindow(["electron", senderWindowFlag])).toBe(true);
    expect(isScreenSenderWindow(["electron", "--other"])).toBe(false);
  });

  it("captures what main grants, offers it, swaps tracks on recapture and answers frame requests", async () => {
    const { ipc, sent, emit } = fakeIpc();
    const { rtc, connections } = fakeRtc();
    const stopped: string[] = [];
    const track = (id: string) => ({
      id,
      contentHint: "",
      getSettings: () => ({ width: 2560, height: 1440, frameRate: 30 }),
      addEventListener: () => {},
      stop: () => stopped.push(id),
    });
    const streams = [track("first"), track("second")].map((video) => ({
      getVideoTracks: () => [video],
      getTracks: () => [video],
    }));
    const media = {
      capture: vi.fn(async () => streams.shift() as unknown as MediaStream),
      grab: vi.fn(async () => new Uint8Array([255, 216])),
    };
    startScreenSender(ipc, media, rtc);
    expect(sent).toEqual([[screenChannels.senderReady]]);
    emit(screenChannels.senderCommand, {
      kind: "start",
      preset: presetFor("direct", 1440),
      frameRate: 30,
    });
    await settle();
    expect(media.capture).toHaveBeenCalledWith(30);
    expect(sent).toContainEqual([screenChannels.senderSignal, { type: "offer", sdp: "offer" }]);
    emit(screenChannels.senderCommand, {
      kind: "remote",
      signal: { type: "answer", sdp: "answer" },
    });
    await settle();
    expect(connections[0]?.remote).toEqual([{ type: "answer", sdp: "answer" }]);
    emit(screenChannels.senderCommand, { kind: "recapture" });
    await settle();
    expect(stopped).toEqual(["first"]);
    emit(screenChannels.senderCommand, { kind: "frame", requestId: 9, maxWidth: 640 });
    await settle();
    expect(sent.at(-1)).toEqual([
      screenChannels.senderFrame,
      { requestId: 9, jpeg: new Uint8Array([255, 216]) },
    ]);
  });

  it("reports a failed capture to main instead of hanging", async () => {
    const { ipc, sent, emit } = fakeIpc();
    const media = {
      capture: async () => Promise.reject(new Error("NotAllowedError")),
      grab: async () => undefined,
    };
    startScreenSender(ipc, media, fakeRtc().rtc);
    emit(screenChannels.senderCommand, {
      kind: "start",
      preset: presetFor("direct", 1440),
      frameRate: 30,
    });
    await settle();
    expect(sent.at(-1)).toEqual([screenChannels.senderState, "failed"]);
  });
});
