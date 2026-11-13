import { describe, expect, it } from "vitest";
import { type FramedEvent, guardedIpc, type IpcSeam, sentFrom } from "./trusted-ipc.ts";

const app = "file:///C:/keywork/out/renderer/index.html";
const fromApp = sentFrom((url) => url.startsWith(app));

describe("an IPC sender", () => {
  it("is trusted only from a frame showing a trusted page", () => {
    expect(fromApp(framed(`${app}?companion=1`))).toBe(true);
    expect(fromApp(framed("https://example.com/rig-test"))).toBe(false);
    expect(fromApp({ senderFrame: null })).toBe(false);
  });

  it("is distrusted when its frame is already gone", () => {
    const disposed: FramedEvent = {
      get senderFrame(): { url: string } {
        throw new Error("Render frame was disposed before WebFrameMain could be accessed");
      },
    };
    expect(fromApp(disposed)).toBe(false);
  });
});

describe("guarded IPC", () => {
  it("answers an invoke from the app and rejects one from anywhere else", async () => {
    const ipc = fakeIpc();
    guardedIpc(ipc, fromApp).handle("host:about", (_event, extra: string) => `about ${extra}`);
    await expect(ipc.invoke("host:about", framed(app), "us")).resolves.toBe("about us");
    await expect(ipc.invoke("host:about", framed("https://example.com/"), "us")).rejects.toThrow(
      "host:about answers only the app's own page",
    );
  });

  it("drops a message from anywhere but the app, and can stop listening", () => {
    const ipc = fakeIpc();
    const guarded = guardedIpc(ipc, fromApp);
    const written: string[] = [];
    const listener = (_event: FramedEvent, data: string) => void written.push(data);
    guarded.on("pty:write", listener);
    ipc.send("pty:write", framed("https://example.com/"), "del /q *");
    ipc.send("pty:write", framed(app), "dir");
    guarded.removeListener("pty:write", listener);
    ipc.send("pty:write", framed(app), "late");
    expect(written).toEqual(["dir"]);
  });
});

function framed(url: string): FramedEvent {
  return { senderFrame: { url } };
}

function fakeIpc() {
  const handlers = new Map<string, (event: FramedEvent, ...args: unknown[]) => unknown>();
  const listeners = new Map<string, Set<(event: FramedEvent, ...args: unknown[]) => void>>();
  const seam: IpcSeam = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    on: (channel, listener) => {
      const set = listeners.get(channel) ?? new Set();
      set.add(listener);
      listeners.set(channel, set);
    },
    removeListener: (channel, listener) => void listeners.get(channel)?.delete(listener),
  };
  return {
    ...seam,
    invoke: async (channel: string, event: FramedEvent, ...args: unknown[]) =>
      handlers.get(channel)?.(event, ...args),
    send: (channel: string, event: FramedEvent, ...args: unknown[]) => {
      for (const listener of listeners.get(channel) ?? []) listener(event, ...args);
    },
  };
}
