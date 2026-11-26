import type {
  CreatureScene,
  CreatureSummary,
  CreatureWorksite,
  SessionRow,
  SteadPlace,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, waitFor, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaneId } from "../../../layout/index.ts";
import type { OutsidePanes } from "../../../shell/outside-panes.ts";
import { createPlacePanes, settingPlaceOf } from "../../../shell/place-panes.ts";
import type { Tiler } from "../../../shell/tiler.ts";
import type { PaneSpec } from "../../index.ts";
import { definitionOf } from "../../index.ts";
import { mountPane, overviewShell } from "../../overview/testing.tsx";
import type { ShellSeams } from "../../registry.ts";
import type { SteadHomeScope } from "../home-scope.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const steadPane = definitionOf("stead");

describe("pressing a project in the stead", () => {
  it("sets out its kept scene, or else its folder, latest conversation and changes, and a second press brings them forward", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const desk = deskOfPanes();
    const scenesSetOut: string[] = [];
    const placePanes = createPlacePanes({
      tiler: desk.tiler,
      outside: desk.outside,
      onPage: () => undefined,
      settingPlaceOf: (pane) => settingPlaceOf(desk.settings, desk.tiler.spec(pane)),
      slotOf: () => undefined,
      openInside: () => undefined,
      keptInside: () => false,
      motion: () => ({ reducedMotion: true, tier: "interact" }),
      act: () => undefined,
    });
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
        creatureWorksites: async () => [barn, hay],
        creatureScenes: async () => [hayAtDawn],
        setOutScene: async (_creature: string, name: string) => {
          scenesSetOut.push(name);
          desk.creatureSetsOut(hayAtDawn);
          return { out: 2, missing: [], asking: [], stopped: null };
        },
        session: async (id: string) => ({ id, cwd: id === "talk" ? "C:/work/barn" : "C:/work" }),
        changes: async (id: string) => ({
          baseline: "b",
          files: id === "talk" ? [{ path: "notes/hay.md", added: 2, deleted: 0 }] : [],
        }),
      } as unknown as ShellSeams["client"],
      host: {
        ...base.host,
        trackedFiles: async (directory: string) => {
          counted.push(directory);
          return undefined;
        },
      },
      setOutTogether: (specs, place) =>
        placePanes.setOutTogether(specs as readonly PaneSpec[], place),
      bringForward: (place) => placePanes.bringForward(place),
    };
    const { container, act } = mountPane(steadPane.component, { kind: "stead" }, shell);
    const page = within(container);
    const pressTheBuilding = async (): Promise<void> => {
      fireEvent.click(await page.findByRole("button", { name: "Files" }));
    };
    await waitFor(() => expect(counted).toHaveLength(2));

    act("stead.down");
    act("stead.down");
    expect(container.querySelector(".kw-stead-place-name")?.textContent).toBe(
      "barn · Wren's project",
    );
    await pressTheBuilding();
    await waitFor(() => expect(desk.opened).toHaveLength(3));
    expect(desk.opened).toEqual([
      { spec: { kind: "file", path: "barn" }, focus: true, place: barnPlace },
      { spec: { kind: "conversation", sessionId: "talk" }, focus: false, place: barnPlace },
      { spec: { kind: "diff", sessionId: "talk" }, focus: false, place: barnPlace },
    ]);
    desk.focused.splice(0);
    await pressTheBuilding();
    await waitFor(() => expect(desk.focused).toHaveLength(3));
    expect(desk.opened).toHaveLength(3);
    expect(desk.focused.at(-1)).toBe(desk.paneOf({ kind: "file", path: "barn" }));

    act("stead.down");
    expect(container.querySelector(".kw-stead-place-name")?.textContent).toBe(
      "hay · Wren's project",
    );
    await pressTheBuilding();
    await waitFor(() => expect(scenesSetOut).toEqual(["hay at dawn"]));
    expect(desk.opened).toHaveLength(3);
    expect(container.querySelector(".kw-stead > .kw-ov-line")?.textContent).toBe(
      "hay at dawn set out",
    );
    desk.focused.splice(0);
    await pressTheBuilding();
    await waitFor(() => expect(desk.focused).toHaveLength(2));
    expect(scenesSetOut).toEqual(["hay at dawn"]);
  });
});

describe("pressing a bound project's building", () => {
  it("sets out its folder, the creature's latest conversation there and what changed, served by the open project, and a second press opens nothing more", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const desk = deskOfPanes();
    const placePanes = createPlacePanes({
      tiler: desk.tiler,
      outside: desk.outside,
      onPage: () => undefined,
      settingPlaceOf: (pane) => settingPlaceOf(desk.settings, desk.tiler.spec(pane)),
      slotOf: () => undefined,
      openInside: () => undefined,
      keptInside: () => false,
      motion: () => ({ reducedMotion: true, tier: "interact" }),
      act: () => undefined,
    });
    const counted: string[] = [];
    const base = overviewShell({ summaries: [] }).shell;
    const home: ShellSeams = {
      ...base,
      store: {
        ...base.store,
        surfaces: { state: { bots: [], ordinals: {} } },
      } as unknown as ShellSeams["store"],
      client: {
        ...base.client,
        creatures: async () => [wren],
        routines: async () => [],
        creatureHandoffs: async () => [],
        creatureWorksites: async () => [orchardNotes],
        creatureScenes: async () => [],
      } as unknown as ShellSeams["client"],
      host: {
        ...base.host,
        trackedFiles: async (directory: string) => {
          counted.push(directory);
          return undefined;
        },
      },
    };
    const orchard: ShellSeams = {
      ...base,
      workspace: "C:/work/orchard",
      store: {
        ...base.store,
        state: { ...base.store.state, summaries: [orchardThread] },
      } as unknown as ShellSeams["store"],
      client: {
        ...base.client,
        session: async (id: string) => ({ id, cwd: "C:/work/orchard" }),
        changes: async () => ({
          baseline: "b",
          files: [{ path: "notes/hello.md", added: 1, deleted: 0 }],
        }),
      } as unknown as ShellSeams["client"],
      setOutTogether: (specs, place) =>
        placePanes.setOutTogether(specs as readonly PaneSpec[], place),
      bringForward: (place) => placePanes.bringForward(place),
    };
    const scope: SteadHomeScope = {
      shell: home,
      workspace: "home-identity",
      activeProject: () => ({ workspace: orchardId, label: "orchard", shell: orchard }),
      openSession: () => undefined,
      projects: {
        list: async () => [
          {
            project: orchardId,
            threads: [{ requestId: "r1", session: { workspace: orchardId, session: "p1" } }],
            discussions: [],
          },
        ],
        bind: async () => undefined,
        unbind: async () => undefined,
        start: async () => ({ workspace: orchardId, session: "unused" }),
        discuss: async () => ({ workspace: "home-identity", session: "unused" }),
      },
    };
    const { container, act } = mountPane(
      steadPane.component,
      { kind: "stead" },
      { ...home, steadHome: scope },
    );
    const page = within(container);
    const pressTheBuilding = async (): Promise<void> => {
      fireEvent.click(await page.findByRole("button", { name: "Files" }));
    };
    await waitFor(() => expect(counted).toEqual(["C:/work/orchard/notes"]));
    act("stead.down");
    act("stead.down");
    expect(container.querySelector(".kw-stead-place-name")?.textContent).toBe(
      "notes · Wren's project",
    );

    await pressTheBuilding();
    await waitFor(() => expect(desk.opened).toHaveLength(3));
    expect(desk.opened).toEqual([
      { spec: { kind: "file", path: "notes" }, focus: true, place: notesPlace },
      { spec: { kind: "conversation", sessionId: "p1" }, focus: false, place: notesPlace },
      { spec: { kind: "diff", sessionId: "p1" }, focus: false, place: notesPlace },
    ]);
    expect(container.querySelector(".kw-stead > .kw-ov-line")).toBeNull();

    desk.focused.splice(0);
    await pressTheBuilding();
    await waitFor(() => expect(desk.focused).toHaveLength(3));
    expect(desk.opened).toHaveLength(3);
  });
});

interface Opened {
  readonly spec: PaneSpec;
  readonly focus: boolean;
  readonly place: SteadPlace | undefined;
}

function deskOfPanes() {
  const panes = new Map<PaneId, PaneSpec>();
  const opened: Opened[] = [];
  const focused: PaneId[] = [];
  const settings: { id: string; place: SteadPlace }[] = [];
  const open = (spec: PaneSpec): PaneId => {
    const pane = `pane-${panes.size + 1}`;
    panes.set(pane, spec);
    return pane;
  };
  const tiler = {
    findPane: (wanted: (spec: PaneSpec) => boolean) =>
      [...panes].find(([, spec]) => wanted(spec))?.[0],
    panes: () => [...panes.keys()],
    spec: (pane: PaneId) => panes.get(pane),
    isOutside: () => true,
    focus: (pane: PaneId) => {
      focused.push(pane);
      return { ok: true };
    },
  } as unknown as Tiler;
  const outside = {
    reachesOutside: true,
    standOutside: async (spec: PaneSpec, sending: { focus: boolean; place?: SteadPlace }) => {
      opened.push({ spec, focus: sending.focus, place: sending.place });
      return open(spec);
    },
  } as unknown as OutsidePanes;
  return {
    tiler,
    outside,
    opened,
    focused,
    settings,
    paneOf: (spec: PaneSpec) =>
      [...panes].find(([, held]) => JSON.stringify(held) === JSON.stringify(spec))?.[0],
    creatureSetsOut: (scene: CreatureScene) => {
      for (const [at, held] of scene.holds.entries()) {
        const id = `${scene.name} ${at}`;
        settings.push({ id, place: scene.place ?? barnPlace });
        open({
          kind: "setting",
          setting: {
            id,
            creature: scene.creature,
            sessionId: "talk",
            what: { kind: "note", ref: held.title },
          },
        });
      }
    },
  };
}

const at = new Date(Date.now() - 600_000).toISOString();
const later = new Date(Date.now() - 60_000).toISOString();
const barnPlace: SteadPlace = { kind: "project", creature: "wren", directory: "C:/work/barn" };
const hayPlace: SteadPlace = { kind: "project", creature: "wren", directory: "C:/work/hay" };

const rows: SessionRow[] = [
  { id: "talk", title: "barn", createdAt: at, lastActivityAt: later, messageCount: 4, bot: "wren" },
  { id: "chat", title: "hello", createdAt: at, lastActivityAt: at, messageCount: 2, bot: "wren" },
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
  conversation: "chat",
  threads: 2,
};

const worksite = (directory: string, since: string): CreatureWorksite => ({
  creature: "wren",
  directory,
  root: directory,
  project: null,
  conversations: 3,
  since,
  latest: later,
  active: false,
});

const barn = worksite("C:/work/barn", at);
const hay = worksite("C:/work/hay", later);

const orchardId = "4e1c0d9a7b23";
const notesPlace: SteadPlace = {
  kind: "project",
  creature: "wren",
  directory: "C:/work/orchard/notes",
};
const orchardNotes: CreatureWorksite = {
  ...worksite("C:/work/orchard/notes", later),
  root: "C:/work/orchard",
  project: orchardId,
  conversations: 1,
};
const orchardThread: SessionRow = {
  id: "p1",
  title: "a hello note",
  createdAt: at,
  lastActivityAt: later,
  messageCount: 4,
};

const hayAtDawn: CreatureScene = {
  creature: "wren",
  name: "hay at dawn",
  place: hayPlace,
  holds: [
    { kind: "file", title: "bales.md" },
    { kind: "thread", title: "the hay" },
  ],
  keptAt: later,
};
