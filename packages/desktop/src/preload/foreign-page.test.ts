import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadedOn } from "./page-testing.ts";

const exposed = new Map<string, unknown>();

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => exposed.set(name, api),
  },
  ipcRenderer: { on: () => {}, removeListener: () => {}, send: () => {}, invoke: async () => {} },
}));

beforeAll(async () => {
  await loadedOn("https://example.com/rig-test", async () => {
    await import("./index.ts");
    await import("./companion.ts");
  });
});

describe("a page the app window was navigated to", () => {
  it("gets neither the host port nor the companion port", () => {
    expect([...exposed.keys()]).toEqual([]);
  });
});
