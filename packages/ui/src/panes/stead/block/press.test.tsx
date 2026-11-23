import { sketchTown } from "@keywork-app/habitat/block/testing";
import type { CreatureSummary, SessionDetail, SessionRow, SteadPlace } from "@keywork-app/protocol";
import { cleanup, fireEvent, waitFor, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { definitionOf } from "../../index.ts";
import { mountPane, overviewShell } from "../../overview/testing.tsx";
import type { PaneSpecBase, ShellSeams } from "../../registry.ts";
import { openingAt } from "./press.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const steadPane = definitionOf("stead");

describe("pressing a place in the stead", () => {
  it("sets out the pane each place opens, with that place as where it rises from", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const setOut: [PaneSpecBase, SteadPlace][] = [];
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
        creatures: async () => [ada],
        routines: async () => [],
        creatureHandoffs: async () => [],
        session: async (id: string) => detail(id),
      } as unknown as ShellSeams["client"],
      host: {
        ...base.host,
        trackedFiles: async (directory: string) => {
          counted.push(directory);
          return undefined;
        },
      },
      setOut: (spec, place) => void setOut.push([spec, place]),
    };
    const { container, act } = mountPane(steadPane.component, { kind: "stead" }, shell);
    const page = within(container);
    const press = async (label: string): Promise<void> => {
      fireEvent.click(await page.findByRole("button", { name: label }));
    };
    const workshop: SteadPlace = { kind: "workshop", creature: "ada" };
    const project: SteadPlace = { kind: "project", creature: "ada", directory: "C:/work/lamps" };

    await waitFor(() => expect(counted).toEqual(["C:/work/lamps"]));
    act("stead.down");
    await press("Conversation");
    await press("Running thread");
    await press("Delivered");
    await press("Chores");
    act("stead.down");
    expect(container.querySelector(".kw-stead-place-name")?.textContent).toBe(
      "lamps · ada's project",
    );
    await press("Files");
    act("stead.down");
    await press("What needs you");
    act("stead.down");
    await press("Parcels");

    expect(setOut).toEqual([
      [{ kind: "conversation", sessionId: "talk" }, workshop],
      [{ kind: "conversation", sessionId: "chore-run" }, workshop],
      [{ kind: "creature", slug: "ada" }, workshop],
      [{ kind: "chores", creature: "ada" }, workshop],
      [{ kind: "file", path: "lamps" }, project],
      [{ kind: "needs-you" }, { kind: "porch" }],
      [{ kind: "parcels" }, { kind: "store" }],
    ]);
    expect(
      openingAt({ place: { kind: "mill" }, face: undefined }, sketchTown(1), "C:/work"),
    ).toEqual({ kind: "pane", spec: { kind: "mills" } });
  });
});

const at = new Date(Date.now() - 60_000).toISOString();
const later = new Date(Date.now() - 30_000).toISOString();

const rows: SessionRow[] = [
  { id: "talk", title: "lamps", createdAt: at, lastActivityAt: at, messageCount: 2, bot: "ada" },
  {
    id: "chore-run",
    title: "nightly",
    createdAt: later,
    lastActivityAt: later,
    messageCount: 3,
    bot: "ada",
  },
];

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
