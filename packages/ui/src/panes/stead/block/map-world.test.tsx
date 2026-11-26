import { journeyFrame, journeyMs, levelEye } from "@keywork-app/habitat/block";
import type { CreatureSummary, MeshCensus } from "@keywork-app/protocol";
import { cleanup, fireEvent, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { definitionOf } from "../../index.ts";
import { mountPane, overviewShell } from "../../overview/testing.tsx";
import type { ShellSeams } from "../../registry.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const steadPane = definitionOf("stead");

describe("stepping back to the map", () => {
  it("returns to the same town view, by key and by press, through whole camera steps", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    const base = overviewShell().shell;
    const shell: ShellSeams = {
      ...base,
      store: {
        ...base.store,
        surfaces: { state: { bots: [], ordinals: {} } },
      } as unknown as ShellSeams["store"],
      client: {
        ...base.client,
        creatures: async () => [ada],
        routines: async () => [],
        creatureHandoffs: async () => [],
        creatureWorksites: async () => [],
        meshPeers: async () => census,
      } as unknown as ShellSeams["client"],
    };
    const { container, act } = mountPane(steadPane.component, { kind: "stead" }, shell);
    const town = container.querySelector<HTMLElement>(".kw-stead-block");
    const map = (): HTMLElement | null => container.querySelector(".kw-stead-map");
    if (town === null) throw new Error("no town");
    await waitFor(() =>
      expect(container.querySelector(".kw-ov-head-lead")?.textContent).toMatch(/1 creature/),
    );

    act("stead.turn-right");
    expect(town.dataset.side).toBe("right");

    act("stead.map");
    await waitFor(() => expect(map()?.dataset.lands).toBe("2"));
    expect(town.hidden).toBe(true);
    expect(map()?.dataset.side).toBe("right");
    act("stead.map");
    expect(map()).toBeNull();
    expect(container.querySelector(".kw-stead-block")).toBe(town);
    expect(town.hidden).toBe(false);
    expect(town.dataset.side).toBe("right");

    const button = [
      ...container.querySelectorAll<HTMLButtonElement>(".kw-stead-looks button"),
    ].find((each) => each.textContent?.includes("the map"));
    if (button === undefined) throw new Error("no way to the map by pointer");
    fireEvent.click(button);
    await waitFor(() => expect(map()?.dataset.lands).toBe("2"));
    act("stead.down");
    const cursor = await waitFor(() => {
      const held = map()?.querySelector<HTMLElement>(".kw-stead-cursor");
      if (held === null || held === undefined) throw new Error("no cursor on the map");
      return held;
    });
    expect(cursor.dataset.land).toBe("home-machine");
    const canvas = map()?.querySelector("canvas");
    if (canvas === null || canvas === undefined) throw new Error("no map canvas");
    fireEvent.click(canvas, {
      clientX: Number.parseFloat(cursor.style.left) + Number.parseFloat(cursor.style.width) / 2,
      clientY: Number.parseFloat(cursor.style.top) + Number.parseFloat(cursor.style.height) / 2,
    });
    await waitFor(() => expect(map()).toBeNull());
    expect(container.querySelector(".kw-stead-block")).toBe(town);
    expect(town.hidden).toBe(false);
    expect(town.dataset.side).toBe("right");

    const back = { way: "back", townScale: 4, mapScale: 2, townEye: levelEye } as const;
    const frames = [0, 0.25, 0.5, 0.75, 1].map((share) => journeyFrame(back, share * journeyMs));
    expect(frames[0]).toEqual({ scale: 4, eye: levelEye, shift: 0, over: false });
    expect(frames.every((frame) => Number.isInteger(frame.scale))).toBe(true);
    expect(frames.at(-1)).toMatchObject({ scale: 2, shift: 1, over: true });
    expect(journeyFrame({ ...back, way: "in" }, journeyMs)).toEqual({
      scale: 4,
      eye: levelEye,
      shift: 0,
      over: true,
    });
  });
});

const at = new Date(Date.now() - 60_000).toISOString();

const ada: CreatureSummary = {
  slug: "ada",
  name: "ada",
  sigil: "◆",
  created: at,
  skin: "kid",
  seed: 3,
  workshop: "host",
  models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
  conversation: "talk",
  threads: 1,
};

const peer = (stableId: string, machine: string, path: { kind: string; endpoint?: string }) => ({
  stableId,
  machine,
  dnsName: `${machine}.example.ts.net.`,
  os: "linux",
  addresses: ["100.64.0.9"],
  tags: [],
  user: null,
  online: true,
  active: true,
  candidate: true,
  path,
  node: null,
});

const census: MeshCensus = {
  self: peer("home-machine", "moak-main", { kind: "unknown" }),
  peers: [peer("spark", "spark-ad4d", { kind: "direct", endpoint: "192.168.4.58:41641" })],
};
