import { beforeAll, describe, expect, it, vi } from "vitest";
import { hostChannels } from "../shared/channels.ts";
import { appPage, loadedOn } from "./page-testing.ts";

const exposed = new Map<string, unknown>();
const invoked: Array<[string, unknown[]]> = [];

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => exposed.set(name, api),
  },
  ipcRenderer: {
    on: () => {},
    removeListener: () => {},
    send: () => {},
    invoke: async (channel: string, ...payload: unknown[]) => {
      invoked.push([channel, payload]);
      return { saved: false, refused: "cancelled" };
    },
  },
}));

beforeAll(async () => {
  await loadedOn(appPage, () => import("./index.ts"));
});

describe("the preload bridge", () => {
  it("exposes exactly one host port and nothing else", () => {
    expect([...exposed.keys()]).toEqual(["keyworkHost"]);
  });

  it("relays a save as one typed request, the text never split from its name", async () => {
    const host = exposed.get("keyworkHost") as {
      saveAs(name: string, text: string): Promise<unknown>;
    };
    await expect(host.saveAs("lights.html", "<html>")).resolves.toEqual({
      saved: false,
      refused: "cancelled",
    });
    expect(invoked).toEqual([
      [hostChannels.saveAs, [{ suggestedName: "lights.html", text: "<html>" }]],
    ]);
  });

  it("asks main what surrounds the window on its own channel", async () => {
    const host = exposed.get("keyworkHost") as { surroundings: { read(): Promise<unknown> } };
    invoked.length = 0;
    await host.surroundings.read();
    expect(invoked).toEqual([[hostChannels.surroundings, []]]);
  });
});
