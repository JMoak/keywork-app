import type {
  CreatureSummary,
  CreatureWorksite,
  SessionRow,
  SteadPlace,
} from "@keywork-app/protocol";
import { cleanup, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { definitionOf } from "../../index.ts";
import { mountPane, overviewShell } from "../../overview/testing.tsx";
import type { ShellSeams } from "../../registry.ts";
import { createSteadPlaceBoard } from "./board.ts";
import { keeperHoldMs } from "./facing.ts";
import { turnMs } from "./motion.ts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const steadPane = definitionOf("stead");

describe("a creature turns the stead to what it shows", () => {
  it("turns the fewest quarters to face the place, and never just after the keeper turned it", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
      new DOMRect(0, 0, 800, 600),
    ] as unknown as DOMRectList);
    vi.useFakeTimers({ toFake: ["Date"] });
    const board = createSteadPlaceBoard();
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
        creatures: async () => [wren],
        routines: async () => [],
        creatureHandoffs: async () => [],
        creatureWorksites: async () => lot,
      } as unknown as ShellSeams["client"],
      host: {
        ...base.host,
        trackedFiles: async (directory: string) => {
          counted.push(directory);
          return undefined;
        },
      },
      steadPlaces: board,
    };
    const { container, act } = mountPane(steadPane.component, { kind: "stead" }, shell);
    const side = (): string | null | undefined =>
      container.querySelector(".kw-stead-side")?.textContent;
    const line = (): string | null | undefined =>
      container.querySelector(".kw-stead > .kw-ov-line")?.textContent;
    const later = (ms: number): void => void vi.setSystemTime(Date.now() + ms);
    await waitFor(() => expect(counted).toHaveLength(lot.length));
    later(keeperHoldMs);
    const front = side();

    expect(board.face(workshop, "wren")).toBeUndefined();
    expect(board.face(barn, "wren")).toBeDefined();
    const turned = side();
    expect(turned).not.toBe(front);
    expect(line()).toBe("Wren turned the stead to its barn");
    expect(board.face(barn, "wren")).toBeDefined();
    expect(side()).toBe(turned);

    later(turnMs);
    act("stead.turn-right");
    expect(side()).toBe(front);
    later(turnMs);
    expect(board.face(barn, "wren")).toBeUndefined();
    expect(side()).toBe(front);

    later(keeperHoldMs);
    expect(board.face(barn, "wren")).toBeDefined();
    expect(side()).toBe(turned);
  });
});

const at = new Date(Date.now() - 600_000).toISOString();
const workshop: SteadPlace = { kind: "workshop", creature: "wren" };
const barn: SteadPlace = { kind: "project", creature: "wren", directory: "C:/work/barn" };

const rows: SessionRow[] = [
  { id: "talk", title: "barn", createdAt: at, lastActivityAt: at, messageCount: 2, bot: "wren" },
];

const wren: CreatureSummary = {
  slug: "wren",
  name: "Wren",
  sigil: "◆",
  created: at,
  skin: "kid",
  seed: 3,
  workshop: "host",
  models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
  conversation: "talk",
  threads: 1,
};

const lot: CreatureWorksite[] = ["barn", "byre", "mill-race", "orchard", "shed", "hut"].map(
  (name, founded) => ({
    creature: "wren",
    directory: `C:/work/${name}`,
    root: `C:/work/${name}`,
    project: null,
    conversations: founded < 4 ? 120 : 1,
    since: new Date(Date.parse(at) + founded * 1000).toISOString(),
    latest: at,
    active: false,
  }),
);
