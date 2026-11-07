import { describe, expect, it, vi } from "vitest";
import { screenChannels } from "./channels.ts";
import type { ScreenHost } from "./host.ts";
import { type IpcEvent, type IpcMainSeam, registerScreenHandlers } from "./ipc.ts";

function fakeIpc() {
  const handlers = new Map<string, (event: IpcEvent, ...args: unknown[]) => unknown>();
  const listeners = new Map<string, (event: IpcEvent, ...args: unknown[]) => void>();
  const ipc: IpcMainSeam = {
    handle: (channel, listener) => handlers.set(channel, listener),
    removeHandler: (channel) => handlers.delete(channel),
    on: (channel, listener) => listeners.set(channel, listener),
    removeListener: (channel) => listeners.delete(channel),
  };
  return { ipc, handlers, listeners };
}

function fakeHost() {
  return {
    viewer: {
      view: vi.fn(async () => ({ ok: true, sessionId: "session-0001" })),
      stop: vi.fn(async () => {}),
      cycleDisplay: vi.fn(async () => {}),
      signal: vi.fn(async () => {}),
      state: vi.fn(async () => {}),
    },
    sharer: {
      senderSignal: vi.fn(async () => {}),
      senderState: vi.fn(async () => {}),
      senderPath: vi.fn(async () => {}),
    },
    history: vi.fn(async () => []),
    frameArrived: vi.fn(),
  };
}

describe("the screen IPC handlers", () => {
  it("routes viewer calls with the caller's own webContents id and validates their shape", async () => {
    const { ipc, handlers, listeners } = fakeIpc();
    const host = fakeHost();
    registerScreenHandlers(ipc, host as unknown as ScreenHost, {
      sessionOf: () => undefined,
      ready: () => {},
    });
    const from = { sender: { id: 11 } };
    await handlers.get(screenChannels.view)?.(from, { peer: "nSpark" });
    expect(host.viewer.view).toHaveBeenCalledWith(11, { peer: "nSpark" });
    expect(await handlers.get(screenChannels.view)?.(from, { peer: 3 })).toEqual({
      ok: false,
      problem: "a view request names one peer",
    });
    await handlers.get(screenChannels.stop)?.(from, "session-0001");
    expect(host.viewer.stop).toHaveBeenCalledWith(11, "session-0001");
    listeners.get(screenChannels.viewerSignal)?.(from, "session-0001", {
      type: "answer",
      sdp: "x",
    });
    expect(host.viewer.signal).toHaveBeenCalledWith(11, "session-0001", {
      type: "answer",
      sdp: "x",
    });
    listeners.get(screenChannels.viewerSignal)?.(from, 5, "nonsense");
    expect(host.viewer.signal).toHaveBeenCalledTimes(1);
  });

  it("only takes sender messages from a window it opened for a session", () => {
    const { ipc, listeners } = fakeIpc();
    const host = fakeHost();
    const ready = vi.fn();
    registerScreenHandlers(ipc, host as unknown as ScreenHost, {
      sessionOf: (id) => (id === 21 ? "session-0001" : undefined),
      ready,
    });
    listeners.get(screenChannels.senderSignal)?.(
      { sender: { id: 21 } },
      { type: "offer", sdp: "o" },
    );
    listeners.get(screenChannels.senderSignal)?.(
      { sender: { id: 99 } },
      { type: "offer", sdp: "o" },
    );
    expect(host.sharer.senderSignal).toHaveBeenCalledTimes(1);
    expect(host.sharer.senderSignal).toHaveBeenCalledWith("session-0001", {
      type: "offer",
      sdp: "o",
    });
    listeners.get(screenChannels.senderFrame)?.(
      { sender: { id: 21 } },
      { requestId: 4, jpeg: new Uint8Array([1]) },
    );
    listeners.get(screenChannels.senderFrame)?.({ sender: { id: 21 } }, { requestId: "4" });
    expect(host.frameArrived).toHaveBeenCalledTimes(1);
    listeners.get(screenChannels.senderReady)?.({ sender: { id: 21 } });
    expect(ready).toHaveBeenCalledWith(21);
    listeners.get(screenChannels.senderPath)?.({ sender: { id: 21 } }, "direct");
    listeners.get(screenChannels.senderPath)?.({ sender: { id: 21 } }, "teleported");
    listeners.get(screenChannels.senderPath)?.({ sender: { id: 99 } }, "relayed");
    expect(host.sharer.senderPath).toHaveBeenCalledTimes(1);
    expect(host.sharer.senderPath).toHaveBeenCalledWith("session-0001", "direct");
  });

  it("unregisters everything it registered", () => {
    const { ipc, handlers, listeners } = fakeIpc();
    const unregister = registerScreenHandlers(ipc, fakeHost() as unknown as ScreenHost, {
      sessionOf: () => undefined,
      ready: () => {},
    });
    expect(handlers.size).toBe(4);
    expect(listeners.size).toBe(7);
    unregister();
    expect(handlers.size + listeners.size).toBe(0);
  });
});
