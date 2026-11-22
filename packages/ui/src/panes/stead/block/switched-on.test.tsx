import type {
  BusEnvelope,
  CreatureSummary,
  SessionDetail,
  SessionRow,
} from "@keywork-app/protocol";
import { cleanup } from "@solidjs/testing-library";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { definitionOf } from "../../index.ts";
import { mountPane, overviewShell } from "../../overview/testing.tsx";
import type { ShellSeams } from "../../registry.ts";
import { placeSettleMs } from "./places.ts";
import { blockWorldShown, blockWorldVariable } from "./switch.ts";

vi.hoisted(() => {
  vi.stubEnv("VITE_STEAD_BLOCK_WORLD", "1");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const steadPane = definitionOf("stead");

describe("the stead with the block world switched on", () => {
  it("loads with the switch on and shows the block world in place of the strip", () => {
    expect(import.meta.env[blockWorldVariable]).toBe("1");
    expect(blockWorldShown).toBe(true);
    expect(Object.keys(steadPane.localActions ?? {})).toEqual(
      expect.arrayContaining(["stead.turn-left", "stead.turn-right"]),
    );
  });

  it("starts without throwing, hides the strip, and reads where each creature's conversations ran", async () => {
    quietCanvas();
    const read: string[] = [];
    const counted: string[] = [];
    const base = overviewShell({ summaries: rows }).shell;
    const shell: ShellSeams = {
      ...base,
      store: {
        ...base.store,
        state: { ...base.store.state, summaries: rows },
        surfaces: { state: { bots: [], ordinals: {} } },
      } as unknown as ShellSeams["store"],
      client: {
        ...base.client,
        creatures: async () => [creature("ada")],
        routines: async () => [],
        session: async (id: string): Promise<SessionDetail> => {
          read.push(id);
          return detail(id);
        },
      } as unknown as ShellSeams["client"],
      host: {
        ...base.host,
        trackedFiles: async (directory: string) => {
          counted.push(directory);
          return 1234;
        },
      },
    };
    const { container } = mountPane(
      steadPane.component,
      steadPane.spec.parse({ kind: "stead" }),
      shell,
    );
    await waitFor(() => counted.length > 0);
    expect(container.querySelector(".kw-stead-block")).not.toBeNull();
    expect(container.querySelector<HTMLElement>(".kw-stead-stage")?.hidden).toBe(true);
    expect(read).toEqual(["talk"]);
    expect(counted).toEqual(["C:/work/lamps"]);
  });

  it("reads the hand-off tally once for its roads and follows the stream after", async () => {
    quietCanvas();
    let reads = 0;
    const listeners = new Set<(batch: readonly BusEnvelope[]) => void>();
    const base = overviewShell({ summaries: rows }).shell;
    const shell: ShellSeams = {
      ...base,
      feed: {
        ...base.feed,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      client: {
        ...base.client,
        creatures: async () => [creature("ada"), creature("bea")],
        routines: async () => [],
        session: async (id: string) => detail(id),
        creatureHandoffs: async () => {
          reads += 1;
          return [{ from: "ada", to: "bea", count: 4, lastAt: at }];
        },
      } as unknown as ShellSeams["client"],
    };
    const { container } = mountPane(
      steadPane.component,
      steadPane.spec.parse({ kind: "stead" }),
      shell,
    );
    await waitFor(() => reads > 0);
    const lastAt = new Date().toISOString();
    for (const listener of listeners) {
      listener([
        {
          id: 1,
          ts: lastAt,
          sessionId: "",
          type: "creature.handoff",
          payload: { change: "counted", handoff: { from: "bea", to: "ada", count: 16, lastAt } },
        },
      ]);
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(reads).toBe(1);
    expect(container.querySelector(".kw-stead-block")).not.toBeNull();
  });
});

const at = new Date(Date.now() - 60_000).toISOString();

const rows: SessionRow[] = [
  {
    id: "talk",
    title: "lamps",
    createdAt: at,
    lastActivityAt: at,
    messageCount: 2,
    bot: "ada",
    live: false,
    working: false,
  },
  { id: "loose", title: "nobody's", createdAt: at, lastActivityAt: at, messageCount: 1 },
];

function detail(id: string): SessionDetail {
  return {
    id,
    title: id,
    createdAt: at,
    lastActivityAt: at,
    messageCount: 2,
    cwd: "C:/work/lamps",
    live: false,
    asOf: 0,
    messages: [],
  };
}

function creature(slug: string): CreatureSummary {
  return {
    slug,
    name: slug,
    sigil: "◆",
    created: at,
    skin: "kid",
    seed: 3,
    workshop: "host",
    models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
    conversation: "talk",
    threads: 1,
  };
}

function quietCanvas(): void {
  const context = {
    canvas: { width: 640, height: 400 },
    fillStyle: "",
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    setTransform: () => undefined,
    fillRect: () => undefined,
    clearRect: () => undefined,
    drawImage: () => undefined,
    createPattern: () => ({}),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as RenderingContext,
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
}

async function waitFor(done: () => boolean): Promise<void> {
  const until = Date.now() + placeSettleMs * 10;
  while (!done() && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20));
}
