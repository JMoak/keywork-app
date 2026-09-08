import { createSignal } from "solid-js";
import type { Direction, DockSide, PaneId, Rect, Screen } from "../layout/index.ts";
import { Layout, parseLayoutState, type Verdict } from "../layout/index.ts";

export type PaneSpec =
  | { readonly kind: "conversation"; readonly sessionId: string | undefined }
  | { readonly kind: "sessions" };

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
  slots(screen: Screen): PaneSlot[];
  emptyMain(screen: Screen): Rect | undefined;
  focused(): PaneId | undefined;
  focusedSpec(): PaneSpec | undefined;
  openConversation(sessionId: string | undefined, screen: Screen): Verdict;
  bindSession(id: PaneId, sessionId: string): void;
  summonSessions(screen: Screen): Verdict;
  close(id: PaneId): Verdict;
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
  snapshot(): TilerState;
}

export interface TilerState {
  readonly layout: ReturnType<Layout["toJSON"]>;
  readonly specs: Readonly<Record<PaneId, PaneSpec>>;
}

export const sessionsPaneId = "sessions";

export function createTiler(restored?: TilerState): Tiler {
  const layout = new Layout();
  const specs = new Map<PaneId, PaneSpec>();
  const [version, setVersion] = createSignal(0);
  let nextConversation = 1;
  if (restored !== undefined) revive(layout, specs, restored);
  for (const id of specs.keys()) nextConversation = Math.max(nextConversation, ordinalOf(id) + 1);

  const touched = (verdict: Verdict): Verdict => {
    if (verdict.ok) setVersion((at) => at + 1);
    return verdict;
  };

  const forget = (id: PaneId): void => {
    specs.delete(id);
  };

  return {
    version,
    layout,
    panes: () => layout.panes(),
    spec: (id) => specs.get(id),
    slots: (screen) => {
      version();
      const focused = layout.focused();
      return [...layout.rects(screen)].flatMap(([id, rect]) => {
        const spec = specs.get(id);
        if (spec === undefined) return [];
        return [{ id, spec, rect, focused: id === focused, spawnRank: layout.spawnRank(id) }];
      });
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
    openConversation: (sessionId, screen) => {
      const id = `conversation-${nextConversation}`;
      const beside = mainAnchor(layout, specs);
      const verdict =
        beside === undefined ? layout.openInMain(id, screen) : layout.open(id, screen, beside);
      if (!verdict.ok) return verdict;
      nextConversation += 1;
      specs.set(id, { kind: "conversation", sessionId });
      return touched(verdict);
    },
    bindSession: (id, sessionId) => {
      if (specs.get(id)?.kind !== "conversation") return;
      specs.set(id, { kind: "conversation", sessionId });
      setVersion((at) => at + 1);
    },
    summonSessions: (screen) => {
      if (layout.panes().includes(sessionsPaneId)) return touched(layout.focus(sessionsPaneId));
      const verdict = layout.openInDock(sessionsPaneId, "left", screen);
      if (verdict.ok) specs.set(sessionsPaneId, { kind: "sessions" });
      return touched(verdict);
    },
    close: (id) => {
      const verdict = layout.close(id);
      if (verdict.ok) forget(id);
      return touched(verdict);
    },
    focus: (id) => touched(layout.focus(id)),
    focusOrdinal: (ordinal) => touched(layout.focusOrdinal(ordinal)),
    focusToward: (direction, screen) => touched(layout.moveFocus(direction, screen)),
    move: (direction, screen) => touched(layout.move(direction, screen)),
    zoom: () => touched(layout.zoomToggle()),
    rotate: () => touched(layout.rotate()),
    cycle: (screen) => touched(layout.cycleFocused(screen)),
    dock: (side, screen) => touched(layout.dockFocused(side, screen)),
    resizeDock: (delta, screen) => {
      const id = layout.focused();
      const side = id === undefined ? undefined : layout.dockSideOf(id);
      if (side === undefined) return { ok: false, refused: "nothing-to-do" };
      return touched(layout.resizeDock(side, delta, screen));
    },
    resizePane: (delta, screen) => touched(layout.resizeFocused(delta, screen)),
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
    const parsed = parseSpec(spec);
    if (parsed === undefined) return undefined;
    specs[id] = parsed;
  }
  return { layout: layoutState, specs };
}

function revive(layout: Layout, specs: Map<PaneId, PaneSpec>, state: TilerState): void {
  layout.load(state.layout);
  for (const id of layout.panes()) {
    const spec = state.specs[id];
    if (spec !== undefined) specs.set(id, spec);
    else layout.close(id);
  }
}

function parseSpec(value: unknown): PaneSpec | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const spec = value as { kind?: unknown; sessionId?: unknown };
  if (spec.kind === "sessions") return { kind: "sessions" };
  if (spec.kind !== "conversation") return undefined;
  return {
    kind: "conversation",
    sessionId: typeof spec.sessionId === "string" ? spec.sessionId : undefined,
  };
}

function mainAnchor(layout: Layout, specs: Map<PaneId, PaneSpec>): PaneId | undefined {
  const focused = layout.focused();
  if (focused !== undefined && specs.get(focused)?.kind === "conversation") return focused;
  return layout.recentlyFocused().find((id) => specs.get(id)?.kind === "conversation");
}

function ordinalOf(id: PaneId): number {
  const match = id.match(/^conversation-(\d+)$/);
  return match?.[1] === undefined ? 0 : Number(match[1]);
}
