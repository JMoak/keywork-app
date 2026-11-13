import { beforeAll, describe, expect, it, vi } from "vitest";
import { companionChannels, companionGlobal } from "../main/companion/channels.ts";
import { appPage, loadedOn } from "./page-testing.ts";

const exposed = new Map<string, unknown>();
const sent: Array<[string, unknown[]]> = [];
const listening = new Map<string, (event: unknown, payload: unknown) => void>();

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => exposed.set(name, api),
  },
  ipcRenderer: {
    on: (channel: string, listener: (event: unknown, payload: unknown) => void) =>
      listening.set(channel, listener),
    removeListener: (channel: string) => listening.delete(channel),
    send: (channel: string, ...payload: unknown[]) => sent.push([channel, payload]),
    invoke: async () => undefined,
  },
}));

beforeAll(async () => {
  await loadedOn(`${appPage}?companion=1`, () => import("./companion.ts"));
});

describe("the companion preload", () => {
  it("exposes exactly one companion port and nothing else", () => {
    expect([...exposed.keys()]).toEqual([companionGlobal]);
  });

  it("sends input as one-way messages and never asks for a reply", () => {
    const port = exposed.get(companionGlobal) as Record<string, (...args: unknown[]) => unknown>;
    port.setInteractive?.(true);
    port.drag?.({ dx: 3, dy: -1 });
    port.dragEnd?.();
    port.answer?.({ callId: "c1", pick: "deny" });
    port.reportWakeups?.({ count: 4, tier: "ambient" });
    expect(sent).toEqual([
      [companionChannels.interactive, [true]],
      [companionChannels.drag, [{ dx: 3, dy: -1 }]],
      [companionChannels.dragEnd, []],
      [companionChannels.answer, [{ callId: "c1", pick: "deny" }]],
      [companionChannels.wakeups, [{ count: 4, tier: "ambient" }]],
    ]);
  });

  it("relays snapshots and conditions until unsubscribed", () => {
    const port = exposed.get(companionGlobal) as {
      onSnapshot(listener: (snapshot: unknown) => void): () => void;
    };
    const seen: unknown[] = [];
    const stop = port.onSnapshot((snapshot) => seen.push(snapshot));
    listening.get(companionChannels.snapshot)?.({}, { state: "idle" });
    stop();
    expect(seen).toEqual([{ state: "idle" }]);
    expect(listening.has(companionChannels.snapshot)).toBe(false);
  });
});
