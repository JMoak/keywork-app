import type {
  BusEnvelope,
  CreatureSummary,
  CreatureWorksite,
  SessionRow,
} from "@keywork-app/protocol";
import { cleanup } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { definitionOf } from "../../index.ts";
import { mountPane, overviewShell } from "../../overview/testing.tsx";
import type { ShellSeams } from "../../registry.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const steadPane = definitionOf("stead");

describe("the stead at start-up", () => {
  it("opens on the block world, stores each creature's address and each building's spot, and reads where its creatures worked", async () => {
    quietCanvas();
    let read = 0;
    const counted: string[] = [];
    const saved: unknown[] = [];
    const base = overviewShell({ summaries: rows }).shell;
    const shell: ShellSeams = {
      ...base,
      rebind: (_pane, spec) => void saved.push(spec),
      store: {
        ...base.store,
        state: { ...base.store.state, summaries: rows },
        surfaces: { state: { bots: [], ordinals: {} } },
      } as unknown as ShellSeams["store"],
      client: {
        ...base.client,
        creatures: async () => [creature("ada")],
        routines: async () => [],
        creatureWorksites: async (): Promise<CreatureWorksite[]> => {
          read += 1;
          return [worksite];
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
    const town = container.querySelector<HTMLElement>(".kw-stead-block");
    expect(town?.dataset.side).toBe("front");
    expect(town?.querySelector("canvas")).not.toBeNull();
    expect(saved.at(-1)).toEqual({
      kind: "stead",
      courtOrder: ["ada"],
      lotOrder: { ada: ["c:/work/lamps"] },
    });
    expect(read).toBe(1);
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

const worksite: CreatureWorksite = {
  creature: "ada",
  directory: "C:/work/lamps",
  root: "C:/work/lamps",
  project: null,
  conversations: 1,
  since: at,
  latest: at,
  active: false,
};

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
  const until = Date.now() + 4000;
  while (!done() && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20));
}
