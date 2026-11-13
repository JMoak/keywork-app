import { createSignal } from "solid-js";
import type {
  Absence,
  Direction,
  DockSide,
  DropZone,
  PaneId,
  Rect,
  Scene,
  Screen,
  SeamHandle,
} from "../layout/index.ts";
import { Layout, parseLayoutState, type Verdict } from "../layout/index.ts";
import {
  definitionOf,
  type PaneDefinition,
  type PaneKind,
  type PaneSpec,
  parsePaneSpec,
} from "../panes/index.ts";

export type { PaneKind, PaneSpec } from "../panes/index.ts";

export interface PaneSlot {
  readonly id: PaneId;
  readonly spec: PaneSpec;
  readonly rect: Rect;
  readonly focused: boolean;
  readonly spawnRank: number;
  readonly floating?: { readonly z: number } | undefined;
  readonly pinned?: true | undefined;
}

export interface ShelfEntry {
  readonly id: PaneId;
  readonly spec: PaneSpec;
  readonly why: Absence;
  readonly pinned: boolean;
  readonly spawnRank: number;
}

export interface Tiler {
  readonly version: () => number;
  readonly layout: Layout;
  panes(): readonly PaneId[];
  spec(id: PaneId): PaneSpec | undefined;
  findPane(matches: (spec: PaneSpec) => boolean): PaneId | undefined;
  slots(screen: Screen): PaneSlot[];
  shelf(screen: Screen): ShelfEntry[];
  scene(screen: Screen): Scene;
  emptyMain(screen: Screen): Rect | undefined;
  focused(): PaneId | undefined;
  focusedSpec(): PaneSpec | undefined;
  lastFocusedOf(kind: PaneKind): PaneId | undefined;
  zoomed(): PaneId | undefined;
  open(spec: PaneSpec, screen: Screen): Verdict;
  summon(spec: PaneSpec, screen: Screen, argument?: string): Verdict;
  crowds(spec: PaneSpec, screen: Screen, argument?: string): boolean;
  bind(id: PaneId, spec: PaneSpec): void;
  close(id: PaneId): Verdict;
  closeFocused(): Verdict;
  focus(id: PaneId): Verdict;
  focusOrdinal(ordinal: number): Verdict;
  focusToward(direction: Direction, screen: Screen): Verdict;
  focusShownToward(direction: Direction, screen: Screen, shown: ReadonlyMap<PaneId, Rect>): Verdict;
  move(direction: Direction, screen: Screen): Verdict;
  focusAcrossLayers(screen: Screen): Verdict;
  zoom(): Verdict;
  float(screen: Screen): Verdict;
  placeFloat(id: PaneId, rect: Rect, screen: Screen): Verdict;
  shelve(): Verdict;
  returnFromShelf(screen: Screen): Verdict;
  pin(): Verdict;
  rotate(screen: Screen): Verdict;
  cycle(screen: Screen): Verdict;
  dock(side: DockSide, screen: Screen): Verdict;
  resizeDock(delta: number, screen: Screen): Verdict;
  resizePane(delta: number, screen: Screen): Verdict;
  resizeSeam(handle: SeamHandle, ratio: number, screen: Screen): Verdict;
  send(id: PaneId, zone: DropZone, screen: Screen): Verdict;
  snapshot(): TilerState;
}

export interface TilerState {
  readonly layout: ReturnType<Layout["toJSON"]>;
  readonly specs: Readonly<Record<PaneId, PaneSpec>>;
}

export type PaneDefinitions = (kind: PaneKind) => PaneDefinition<PaneSpec>;

export function createTiler(
  restored?: TilerState,
  definitions: PaneDefinitions = definitionOf,
): Tiler {
  const layout = new Layout();
  const specs = new Map<PaneId, PaneSpec>();
  const ids = new PaneIds();
  const [version, setVersion] = createSignal(0);
  if (restored !== undefined) revive(layout, specs, restored);
  for (const id of specs.keys()) ids.adopt(id);

  const touched = (verdict: Verdict, noRoom = refusalNotices.noRoomHere): Verdict => {
    if (verdict.ok) setVersion((at) => at + 1);
    return explained(verdict, noRoom);
  };

  const tucked = (screen: Screen): PaneId[] =>
    layout.shelved(screen).flatMap((absent) => (absent.why === "tucked" ? [absent.id] : []));

  const seated = (screen: Screen, seat: () => Verdict): Verdict => {
    const waiting = new Set(tucked(screen));
    const verdict = touched(seat());
    const displaced = tucked(screen).filter((id) => !waiting.has(id)).length;
    return verdict.ok && displaced > 0
      ? { ok: true, notice: shelfNotices.tucked(displaced) }
      : verdict;
  };

  const place = (id: PaneId, spec: PaneSpec, screen: Screen): Verdict => {
    const home = definitions(spec.kind).home;
    if (home !== "main") return layout.openInDock(id, home);
    const beside = mainAnchor(layout);
    return beside === undefined ? layout.openInMain(id, screen) : layout.open(id, screen, beside);
  };

  const open = (spec: PaneSpec, screen: Screen): Verdict =>
    seated(screen, () => {
      const id = ids.mint(spec.kind);
      const verdict = place(id, spec, screen);
      if (!verdict.ok) return verdict;
      ids.adopt(id);
      specs.set(id, spec);
      return verdict;
    });

  const bind = (id: PaneId, spec: PaneSpec): void => {
    if (specs.get(id)?.kind !== spec.kind) return;
    specs.set(id, spec);
    setVersion((at) => at + 1);
  };

  const close = (id: PaneId): Verdict => {
    const verdict = layout.close(id);
    if (verdict.ok) specs.delete(id);
    return touched(verdict);
  };

  const showing = (wanted: PaneSpec): PaneId | undefined =>
    layout.panes().find((id) => summonFinds(definitions(wanted.kind), specs.get(id), wanted));

  const lastFocusedOf = (kind: PaneKind): PaneId | undefined =>
    [layout.focused(), ...layout.recentlyFocused(), ...layout.panes()].find(
      (id) => id !== undefined && specs.get(id)?.kind === kind,
    );

  const opensAnother = (spec: PaneSpec): boolean => {
    const focused = layout.focused();
    return (
      definitions(spec.kind).summon?.again === "opens-another" &&
      focused !== undefined &&
      specs.get(focused)?.kind === spec.kind
    );
  };

  const summoned = (spec: PaneSpec, argument: string | undefined): PaneId | undefined => {
    if (opensAnother(spec)) return undefined;
    const named = argument !== undefined && argument.trim() !== "";
    return showing(spec) ?? (named ? lastFocusedOf(spec.kind) : undefined);
  };

  const hasRoomFor = (spec: PaneSpec, screen: Screen): boolean => {
    const home = definitions(spec.kind).home;
    if (home !== "main") return layout.hasRoomInDock(home, screen);
    const beside = mainAnchor(layout);
    return beside === undefined
      ? layout.hasRoomInMain(screen)
      : layout.hasRoomBeside(screen, beside);
  };

  return {
    version,
    layout,
    panes: () => layout.panes(),
    spec: (id) => {
      version();
      return specs.get(id);
    },
    findPane: (matches) =>
      layout.panes().find((id) => {
        const spec = specs.get(id);
        return spec !== undefined && matches(spec);
      }),
    slots: (screen) => {
      version();
      const focused = layout.focused();
      const afloat = new Map(layout.floating(screen).map(({ id, z }) => [id, { z }] as const));
      return [...layout.rects(screen)].flatMap(([id, rect]) => {
        const spec = specs.get(id);
        if (spec === undefined) return [];
        return [
          {
            id,
            spec,
            rect,
            focused: id === focused,
            spawnRank: layout.spawnRank(id),
            ...(afloat.has(id) && { floating: afloat.get(id) }),
            ...(layout.isPinned(id) && { pinned: true as const }),
          },
        ];
      });
    },
    shelf: (screen) => {
      version();
      return layout.shelved(screen).flatMap(({ id, why }) => {
        const spec = specs.get(id);
        if (spec === undefined) return [];
        return [{ id, spec, why, pinned: layout.isPinned(id), spawnRank: layout.spawnRank(id) }];
      });
    },
    scene: (screen) => {
      version();
      return layout.scene(screen);
    },
    emptyMain: (screen) => {
      version();
      return layout.emptyMainRect(screen);
    },
    focused: () => {
      version();
      return layout.focused();
    },
    focusedSpec: () => {
      version();
      const id = layout.focused();
      return id === undefined ? undefined : specs.get(id);
    },
    zoomed: () => {
      version();
      return layout.zoomed();
    },
    lastFocusedOf: (kind) => {
      version();
      return lastFocusedOf(kind);
    },
    open,
    summon: (spec, screen, argument) => {
      const existing = summoned(spec, argument);
      if (existing === undefined) return open(spec, screen);
      const named = argument !== undefined && argument.trim() !== "";
      if (named || retargets(definitions(spec.kind), specs.get(existing), spec))
        bind(existing, spec);
      return touched(layout.focus(existing));
    },
    crowds: (spec, screen, argument) => {
      version();
      return summoned(spec, argument) === undefined && !hasRoomFor(spec, screen);
    },
    bind,
    close,
    closeFocused: () => {
      const id = layout.focused();
      if (id === undefined)
        return { ok: false, refused: "no-focus", notice: refusalNotices.nothingToClose };
      return close(id);
    },
    focus: (id) => touched(layout.focus(id)),
    focusOrdinal: (ordinal) => touched(layout.focusOrdinal(ordinal)),
    focusToward: (direction, screen) => touched(layout.moveFocus(direction, screen)),
    focusShownToward: (direction, screen, shown) => {
      const onScreen = layout.neighborToward(direction, shown);
      const offScreen = layout.tiledNeighborToward(direction, screen);
      const target =
        onScreen ?? (offScreen !== undefined && !shown.has(offScreen) ? offScreen : undefined);
      return target === undefined
        ? { ok: false, refused: "nothing-to-do" }
        : touched(layout.focus(target));
    },
    focusAcrossLayers: (screen) =>
      noted(touched(layout.focusAcrossLayers(screen)), shelfNotices.nothingFloats),
    move: (direction, screen) => seated(screen, () => layout.move(direction, screen)),
    zoom: () => touched(layout.zoomToggle()),
    float: (screen) => seated(screen, () => layout.floatToggle(screen)),
    placeFloat: (id, rect, screen) => touched(layout.placeFloat(id, rect, screen)),
    shelve: () => noted(touched(layout.shelveFocused()), shelfNotices.lastPaneStays),
    returnFromShelf: (screen) =>
      noted(
        seated(screen, () => layout.returnFromShelf(screen)),
        shelfNotices.empty,
      ),
    pin: () => {
      const verdict = touched(layout.pinToggle());
      const id = layout.focused();
      if (!verdict.ok || id === undefined) return verdict;
      return {
        ok: true,
        notice: layout.isPinned(id) ? shelfNotices.pinned : shelfNotices.unpinned,
      };
    },
    rotate: (screen) => touched(layout.rotate(screen)),
    cycle: (screen) => seated(screen, () => layout.cycleFocused(screen)),
    dock: (side, screen) => seated(screen, () => layout.dockFocused(side)),
    resizeDock: (delta, screen) => {
      const id = layout.focused();
      const side = id === undefined ? undefined : layout.dockSideOf(id);
      if (side === undefined) return { ok: false, refused: "nothing-to-do" };
      return touched(layout.resizeDock(side, delta, screen));
    },
    resizePane: (delta, screen) => touched(layout.resizeFocused(delta, screen)),
    resizeSeam: (handle, ratio, screen) => touched(layout.resizeSeam(handle, ratio, screen)),
    send: (id, zone, screen) => seated(screen, () => layout.send(id, zone, screen)),
    snapshot: () => ({ layout: layout.toJSON(), specs: Object.fromEntries(specs) }),
  };
}

export function parseTilerState(value: unknown): TilerState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as { layout?: unknown; specs?: unknown };
  const layoutState = parseLayoutState(candidate.layout);
  if (
    layoutState === undefined ||
    typeof candidate.specs !== "object" ||
    candidate.specs === null
  ) {
    return undefined;
  }
  const specs: Record<PaneId, PaneSpec> = {};
  for (const [id, spec] of Object.entries(candidate.specs as Record<string, unknown>)) {
    const parsed = parsePaneSpec(spec);
    if (parsed === undefined) return undefined;
    specs[id] = parsed;
  }
  return { layout: layoutState, specs };
}

export const refusalNotices = {
  noRoomHere: "no room for that here",
  nothingToClose: "no pane is focused · nothing to close",
  nothingFocused: "no pane is focused",
  nothingToward: (direction: Direction) => `no pane ${towardWords[direction]} this one`,
  cannotMove: (direction: Direction) => `this pane can't move ${movingWords[direction]}`,
  nothingToRotate: "nothing to rotate · this pane doesn't share a split with another",
  noPaneNumbered: (ordinal: number) => `no pane ${ordinal} is open`,
  alreadyDocked: (side: DockSide) => `this pane is already docked ${side}`,
  notDocked: (growChord: string | undefined) =>
    withChord("this pane isn't docked", growChord, "grows it instead"),
  fillsTheMain: "this pane is the only one in the main area · nothing to grow or shrink against",
  atItsLimit: (delta: number) =>
    delta > 0 ? "this pane is as large as it can grow" : "this pane is as small as it can shrink",
  resizesWithItsDock: (dockChord: string | undefined) =>
    withChord("this pane is docked", dockChord, "widens its dock"),
  yardArranges: (tilesChord: string | undefined) =>
    withChord("the yard arranges these panes itself", tilesChord, "returns to tiles"),
  shownInstead: (shown: string, previous: string, listChord: string | undefined) =>
    withChord(
      `no room for another pane · ${shown} took the place of ${previous}`,
      listChord,
      "lists every session",
    ),
  closeAgain: (reason: string, closeChord: string | undefined) =>
    withChord(reason, closeChord, "again closes it anyway"),
};

export const shelfNotices = {
  tucked: (count: number) =>
    `no room for every pane · ${count === 1 ? "one waits" : `${count} wait`} on the shelf`,
  lastPaneStays: "the last pane on the stage stays",
  empty: "the shelf is empty",
  nothingFloats: "no pane is floating",
  pinned: "pinned · the last to leave when room runs out",
  unpinned: "unpinned",
};

export function paneIdOf(kind: PaneKind, ordinal: number): PaneId {
  return `${kind}-${ordinal}`;
}

class PaneIds {
  private readonly next = new Map<string, number>();

  mint(kind: PaneKind): PaneId {
    return paneIdOf(kind, this.next.get(kind) ?? 1);
  }

  adopt(id: PaneId): void {
    const dash = id.lastIndexOf("-");
    const kind = id.slice(0, dash);
    const ordinal = Number(id.slice(dash + 1));
    if (dash === -1 || !Number.isInteger(ordinal)) return;
    this.next.set(kind, Math.max(this.next.get(kind) ?? 1, ordinal + 1));
  }
}

function revive(layout: Layout, specs: Map<PaneId, PaneSpec>, state: TilerState): void {
  layout.load(state.layout);
  for (const id of layout.panes()) {
    const spec = state.specs[id];
    if (spec !== undefined) specs.set(id, spec);
    else layout.close(id);
  }
}

function summonFinds(
  definition: PaneDefinition<PaneSpec>,
  shown: PaneSpec | undefined,
  wanted: PaneSpec,
): boolean {
  if (shown === undefined || shown.kind !== wanted.kind) return false;
  return definition.home !== "main" || sameSubject(definition, shown, wanted);
}

function retargets(
  definition: PaneDefinition<PaneSpec>,
  shown: PaneSpec | undefined,
  wanted: PaneSpec,
): boolean {
  return (
    definition.summon?.variants !== undefined ||
    definition.home === "main" ||
    followsAnotherSession(shown, wanted)
  );
}

function sameSubject(definition: PaneDefinition<PaneSpec>, a: PaneSpec, b: PaneSpec): boolean {
  const subjectOf = definition.subject ?? ((spec: PaneSpec) => spec);
  return sameValue(subjectOf(a), subjectOf(b));
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => [key, canonical(entry)]);
}

function followsAnotherSession(shown: PaneSpec | undefined, wanted: PaneSpec): boolean {
  const wantedSession = sessionNamed(wanted);
  return wantedSession !== undefined && sessionNamed(shown) !== wantedSession;
}

function sessionNamed(spec: PaneSpec | undefined): string | undefined {
  return spec !== undefined && "sessionId" in spec ? spec.sessionId : undefined;
}

const towardWords: Record<Direction, string> = {
  left: "to the left of",
  right: "to the right of",
  up: "above",
  down: "below",
};

const movingWords: Record<Direction, string> = {
  left: "further left",
  right: "further right",
  up: "any higher",
  down: "any lower",
};

function withChord(said: string, chord: string | undefined, does: string): string {
  return chord === undefined ? said : `${said} · ${chord} ${does}`;
}

function explained(verdict: Verdict, noRoom: string): Verdict {
  if (verdict.ok || verdict.refused !== "no-room" || verdict.notice !== undefined) return verdict;
  return { ...verdict, notice: noRoom };
}

function noted(verdict: Verdict, nothingToDo: string): Verdict {
  if (verdict.ok || verdict.refused !== "nothing-to-do" || verdict.notice !== undefined) {
    return verdict;
  }
  return { ...verdict, notice: nothingToDo };
}

function mainAnchor(layout: Layout): PaneId | undefined {
  const inMain = (id: PaneId): boolean => layout.dockSideOf(id) === undefined;
  const focused = layout.focused();
  if (focused !== undefined && inMain(focused)) return focused;
  return layout.recentlyFocused().find(inMain);
}
