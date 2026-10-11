import { createSignal } from "solid-js";
import type {
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
import { definitionOf, type PaneKind, type PaneSpec, parsePaneSpec } from "../panes/index.ts";

export type { PaneKind, PaneSpec } from "../panes/index.ts";

export interface PaneSlot {
  readonly id: PaneId;
  readonly spec: PaneSpec;
  readonly rect: Rect;
  readonly focused: boolean;
  readonly spawnRank: number;
}

export interface Tiler {
  readonly version: () => number;
  readonly layout: Layout;
  panes(): readonly PaneId[];
  spec(id: PaneId): PaneSpec | undefined;
  findPane(matches: (spec: PaneSpec) => boolean): PaneId | undefined;
  slots(screen: Screen): PaneSlot[];
  scene(screen: Screen): Scene;
  emptyMain(screen: Screen): Rect | undefined;
  focused(): PaneId | undefined;
  focusedSpec(): PaneSpec | undefined;
  open(spec: PaneSpec, screen: Screen): Verdict;
  summon(spec: PaneSpec, screen: Screen): Verdict;
  bind(id: PaneId, spec: PaneSpec): void;
  close(id: PaneId): Verdict;
  closeFocused(): Verdict;
  focus(id: PaneId): Verdict;
  focusOrdinal(ordinal: number): Verdict;
  focusToward(direction: Direction, screen: Screen): Verdict;
  move(direction: Direction, screen: Screen): Verdict;
  zoom(): Verdict;
  rotate(): Verdict;
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

export function createTiler(restored?: TilerState): Tiler {
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

  const place = (id: PaneId, spec: PaneSpec, screen: Screen): Verdict => {
    const home = definitionOf(spec.kind).home;
    if (home !== "main") return layout.openInDock(id, home, screen);
    const beside = mainAnchor(layout);
    return beside === undefined ? layout.openInMain(id, screen) : layout.open(id, screen, beside);
  };

  const open = (spec: PaneSpec, screen: Screen): Verdict => {
    const id = ids.mint(spec.kind);
    const verdict = place(id, spec, screen);
    if (!verdict.ok) return explained(verdict, refusalNotices.noRoomForPane);
    ids.adopt(id);
    specs.set(id, spec);
    return touched(verdict);
  };

  const close = (id: PaneId): Verdict => {
    const verdict = layout.close(id);
    if (verdict.ok) specs.delete(id);
    return touched(verdict);
  };

  return {
    version,
    layout,
    panes: () => layout.panes(),
    spec: (id) => specs.get(id),
    findPane: (matches) =>
      layout.panes().find((id) => {
        const spec = specs.get(id);
        return spec !== undefined && matches(spec);
      }),
    slots: (screen) => {
      version();
      const focused = layout.focused();
      return [...layout.rects(screen)].flatMap(([id, rect]) => {
        const spec = specs.get(id);
        if (spec === undefined) return [];
        return [{ id, spec, rect, focused: id === focused, spawnRank: layout.spawnRank(id) }];
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
    open,
    summon: (spec, screen) => {
      if (definitionOf(spec.kind).home === "main") return open(spec, screen);
      const existing = layout.panes().find((id) => specs.get(id)?.kind === spec.kind);
      return existing === undefined ? open(spec, screen) : touched(layout.focus(existing));
    },
    bind: (id, spec) => {
      if (specs.get(id)?.kind !== spec.kind) return;
      specs.set(id, spec);
      setVersion((at) => at + 1);
    },
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
    move: (direction, screen) => touched(layout.move(direction, screen)),
    zoom: () => touched(layout.zoomToggle()),
    rotate: () => touched(layout.rotate()),
    cycle: (screen) =>
      touched(layout.cycleFocused(screen), refusalNotices.noRoomIn("this pane's next home")),
    dock: (side, screen) =>
      touched(layout.dockFocused(side, screen), refusalNotices.noRoomIn(`the ${side} dock`)),
    resizeDock: (delta, screen) => {
      const id = layout.focused();
      const side = id === undefined ? undefined : layout.dockSideOf(id);
      if (side === undefined) return { ok: false, refused: "nothing-to-do" };
      return touched(layout.resizeDock(side, delta, screen));
    },
    resizePane: (delta, screen) => touched(layout.resizeFocused(delta, screen)),
    resizeSeam: (handle, ratio, screen) => touched(layout.resizeSeam(handle, ratio, screen)),
    send: (id, zone, screen) =>
      touched(layout.send(id, zone, screen), refusalNotices.noRoomIn(placeName(zone))),
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
  noRoomForPane: "no room for another pane · close or resize one",
  noRoomIn: (where: string) => `no room in ${where} · close or resize a pane`,
  noRoomHere: "no room for that here",
  nothingToClose: "no pane is focused · nothing to close",
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

function explained(verdict: Verdict, noRoom: string): Verdict {
  if (verdict.ok || verdict.refused !== "no-room" || verdict.notice !== undefined) return verdict;
  return { ...verdict, notice: noRoom };
}

function placeName(zone: DropZone): string {
  return zone === "main" ? "the main area" : `the ${zone} dock`;
}

function mainAnchor(layout: Layout): PaneId | undefined {
  const inMain = (id: PaneId): boolean => layout.dockSideOf(id) === undefined;
  const focused = layout.focused();
  if (focused !== undefined && inMain(focused)) return focused;
  return layout.recentlyFocused().find(inMain);
}
