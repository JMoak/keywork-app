import {
  type Arrangement,
  type DockSide,
  dockedAt,
  emptyArrangement,
  lifted,
  mainPanes,
  otherSide,
  panesOf,
  reorderedInDock,
  sideOf,
  swapped,
  withDockRatio,
  withTree,
} from "./arrangement.ts";
import {
  area,
  type Direction,
  fullRect,
  isWide,
  nearestInDirection,
  type Rect,
  type Screen,
} from "./geometry.ts";
import { arrangementRects, holds, regionsOf } from "./scene.ts";
import { arrangementOf, type LayoutState, layoutStateOf, parseLayoutState } from "./state.ts";
import {
  attachAtEdge,
  type LayoutNode,
  leaf,
  type Orientation,
  type PaneId,
  removeLeaf,
  resizeAroundLeaf,
  rotateAroundLeaf,
  splitLeaf,
  swapLeaves,
} from "./tree.ts";

export type Verdict = { ok: true } | { ok: false; refused: Refusal };

export type Refusal = "no-room" | "no-focus" | "unknown-pane" | "already-open" | "nothing-to-do";

export class Layout {
  private arrangement: Arrangement = emptyArrangement();
  private focusedId: PaneId | undefined;
  private zoomedId: PaneId | undefined;
  private trail: PaneId[] = [];

  static parse(value: unknown): LayoutState | undefined {
    return parseLayoutState(value);
  }

  toJSON(): LayoutState {
    return layoutStateOf(this.arrangement, this.focusedId);
  }

  load(state: LayoutState): void {
    this.arrangement = arrangementOf(state);
    this.trail = [];
    this.zoomedId = undefined;
    this.focusOn(state.focused ?? panesOf(this.arrangement)[0]);
  }

  panes(): PaneId[] {
    return panesOf(this.arrangement);
  }

  focused(): PaneId | undefined {
    return this.focusedId;
  }

  zoomed(): PaneId | undefined {
    return this.zoomedId;
  }

  recentlyFocused(): PaneId[] {
    return [...this.trail];
  }

  dockSideOf(id: PaneId): DockSide | undefined {
    return sideOf(this.arrangement, id);
  }

  dockRatio(side: DockSide): number {
    return this.arrangement.docks[side].ratio;
  }

  spawnRank(id: PaneId): number {
    return this.panes().indexOf(id);
  }

  rects(screen: Screen): Map<PaneId, Rect> {
    if (this.zoomedId !== undefined) return new Map([[this.zoomedId, fullRect(screen)]]);
    return arrangementRects(this.arrangement, screen);
  }

  emptyMainRect(screen: Screen): Rect | undefined {
    if (this.zoomedId !== undefined || this.arrangement.tree !== undefined) return undefined;
    if (this.panes().length === 0) return undefined;
    return regionsOf(this.arrangement, screen).main;
  }

  open(id: PaneId, screen: Screen, beside: PaneId | undefined = this.focusedId): Verdict {
    if (this.panes().includes(id)) return refused("already-open");
    const anchor = beside !== undefined && this.panes().includes(beside) ? beside : this.focusedId;
    const tree = this.arrangement.tree;
    const anchorSide = anchor === undefined ? undefined : this.dockSideOf(anchor);
    if (anchor !== undefined && anchorSide !== undefined) {
      const index = this.arrangement.docks[anchorSide].panes.indexOf(anchor) + 1;
      return this.commitFocusing(dockedAt(this.arrangement, anchorSide, id, index), id, screen);
    }
    if (tree === undefined || anchor === undefined) {
      return this.commitFocusing(withTree(this.arrangement, leaf(id)), id, screen);
    }
    const orientation = splitOrientation(this.tiledRects(screen).get(anchor));
    const grown = splitLeaf(tree, anchor, leaf(id), orientation);
    return this.commitFocusing(withTree(this.arrangement, grown), id, screen);
  }

  openInMain(id: PaneId, screen: Screen): Verdict {
    if (this.panes().includes(id)) return refused("already-open");
    const tree = this.arrangement.tree;
    const target = tree === undefined ? undefined : this.largestMainLeaf(screen);
    const grown =
      tree === undefined || target === undefined
        ? leaf(id)
        : splitLeaf(tree, target.id, leaf(id), splitOrientation(target.rect));
    return this.commitFocusing(withTree(this.arrangement, grown), id, screen);
  }

  openInDock(id: PaneId, side: DockSide, screen: Screen): Verdict {
    if (this.panes().includes(id)) return refused("already-open");
    return this.commitFocusing(dockedAt(this.arrangement, side, id), id, screen);
  }

  close(id: PaneId): Verdict {
    if (!this.panes().includes(id)) return refused("unknown-pane");
    const side = this.dockSideOf(id);
    const slot = side === undefined ? -1 : this.arrangement.docks[side].panes.indexOf(id);
    this.arrangement = lifted(this.arrangement, id);
    this.trail = this.trail.filter((pane) => pane !== id);
    if (this.zoomedId === id) this.zoomedId = undefined;
    if (this.focusedId === id) this.focusOn(this.heir(side, slot));
    return ok;
  }

  focus(id: PaneId): Verdict {
    if (!this.panes().includes(id)) return refused("unknown-pane");
    if (this.zoomedId !== undefined && this.zoomedId !== id) this.zoomedId = undefined;
    this.focusOn(id);
    return ok;
  }

  focusOrdinal(ordinal: number): Verdict {
    const id = this.panes()[ordinal - 1];
    return id === undefined ? refused("unknown-pane") : this.focus(id);
  }

  moveFocus(direction: Direction, screen: Screen): Verdict {
    const neighbor = this.neighbor(direction, screen);
    if (neighbor === undefined) return refused("nothing-to-do");
    this.focusOn(neighbor);
    return ok;
  }

  zoomToggle(): Verdict {
    if (this.focusedId === undefined) return refused("no-focus");
    this.zoomedId = this.zoomedId === this.focusedId ? undefined : this.focusedId;
    return ok;
  }

  move(direction: Direction, screen: Screen): Verdict {
    const id = this.focusedId;
    if (id === undefined) return refused("no-focus");
    const side = this.dockSideOf(id);
    const verdict =
      side === undefined
        ? this.moveInMain(id, direction, screen)
        : this.moveDocked(id, side, direction, screen);
    if (verdict.ok) this.zoomedId = undefined;
    return verdict;
  }

  rotate(): Verdict {
    const id = this.focusedId;
    const tree = this.arrangement.tree;
    if (id === undefined) return refused("no-focus");
    if (tree === undefined || this.dockSideOf(id) !== undefined || tree.kind === "leaf") {
      return refused("nothing-to-do");
    }
    this.arrangement = withTree(this.arrangement, rotateAroundLeaf(tree, id));
    return ok;
  }

  swapWith(other: PaneId): Verdict {
    const id = this.focusedId;
    if (id === undefined) return refused("no-focus");
    if (id === other || !this.panes().includes(other)) return refused("unknown-pane");
    this.arrangement = swapped(this.arrangement, id, other);
    this.zoomedId = undefined;
    return ok;
  }

  dockFocused(side: DockSide, screen: Screen): Verdict {
    const id = this.focusedId;
    if (id === undefined) return refused("no-focus");
    if (this.dockSideOf(id) === side) return refused("nothing-to-do");
    return this.commit(dockedAt(lifted(this.arrangement, id), side, id), screen);
  }

  undockFocused(screen: Screen): Verdict {
    const id = this.focusedId;
    const from = id === undefined ? undefined : this.dockSideOf(id);
    if (id === undefined) return refused("no-focus");
    if (from === undefined) return refused("nothing-to-do");
    const remaining = lifted(this.arrangement, id);
    return this.commit(withTree(remaining, this.landing(id, remaining.tree, from, screen)), screen);
  }

  cycleFocused(screen: Screen): Verdict {
    if (this.focusedId === undefined) return refused("no-focus");
    const from = this.dockSideOf(this.focusedId);
    if (from === undefined) return this.dockFocused("left", screen);
    if (from === "left") return this.dockFocused("right", screen);
    return this.undockFocused(screen);
  }

  resizeDock(side: DockSide, delta: number, screen: Screen): Verdict {
    return this.commit(withDockRatio(this.arrangement, side, this.dockRatio(side) + delta), screen);
  }

  resizeFocused(delta: number, screen: Screen): Verdict {
    const tree = this.arrangement.tree;
    if (this.focusedId === undefined) return refused("no-focus");
    if (tree === undefined || this.dockSideOf(this.focusedId) !== undefined) {
      return refused("nothing-to-do");
    }
    return this.commit(
      withTree(this.arrangement, resizeAroundLeaf(tree, this.focusedId, delta)),
      screen,
    );
  }

  private tiledRects(screen: Screen): Map<PaneId, Rect> {
    return arrangementRects(this.arrangement, screen);
  }

  private commit(candidate: Arrangement, screen: Screen): Verdict {
    if (!holds(candidate, screen)) return refused("no-room");
    this.arrangement = candidate;
    this.zoomedId = undefined;
    return ok;
  }

  private commitFocusing(candidate: Arrangement, id: PaneId, screen: Screen): Verdict {
    const verdict = this.commit(candidate, screen);
    if (verdict.ok) this.focusOn(id);
    return verdict;
  }

  private focusOn(id: PaneId | undefined): void {
    this.focusedId = id;
    if (id === undefined) return;
    this.trail = [id, ...this.trail.filter((pane) => pane !== id)];
  }

  private heir(side: DockSide | undefined, slot: number): PaneId | undefined {
    const { docks } = this.arrangement;
    const main = mainPanes(this.arrangement);
    if (side === undefined) {
      const recentMain = this.trail.find((pane) => main.includes(pane));
      return recentMain ?? main[0] ?? docks.left.panes[0] ?? docks.right.panes[0];
    }
    const stack = docks[side].panes;
    return stack[Math.min(slot, stack.length - 1)] ?? main[0] ?? docks[otherSide(side)].panes[0];
  }

  private landing(
    id: PaneId,
    tree: LayoutNode | undefined,
    from: DockSide,
    screen: Screen,
  ): LayoutNode {
    if (tree === undefined) return leaf(id);
    const target = this.largestMainLeaf(screen);
    if (target === undefined) return attachAtEdge(tree, id, from);
    return splitLeaf(tree, target.id, leaf(id), splitOrientation(target.rect));
  }

  private largestMainLeaf(screen: Screen): { id: PaneId; rect: Rect } | undefined {
    const main = new Set(mainPanes(this.arrangement));
    let best: { id: PaneId; rect: Rect } | undefined;
    for (const [id, rect] of this.tiledRects(screen)) {
      if (!main.has(id)) continue;
      if (best === undefined || area(rect) > area(best.rect)) best = { id, rect };
    }
    return best;
  }

  private moveDocked(id: PaneId, side: DockSide, direction: Direction, screen: Screen): Verdict {
    if (direction === "up" || direction === "down") {
      const reordered = reorderedInDock(this.arrangement, side, id, direction === "down" ? 1 : -1);
      if (reordered === undefined) return refused("nothing-to-do");
      this.arrangement = reordered;
      return ok;
    }
    const inward = side === "left" ? direction === "right" : direction === "left";
    if (!inward) return refused("nothing-to-do");
    const landing = attachAtEdge(this.arrangement.tree, id, side);
    return this.commit(withTree(lifted(this.arrangement, id), landing), screen);
  }

  private moveInMain(id: PaneId, direction: Direction, screen: Screen): Verdict {
    const tree = this.arrangement.tree;
    if (tree === undefined) return refused("nothing-to-do");
    const main = mainPanes(this.arrangement);
    const neighbor = this.neighbor(direction, screen, (candidate) => main.includes(candidate));
    if (neighbor !== undefined) {
      this.arrangement = withTree(this.arrangement, swapLeaves(tree, id, neighbor));
      return ok;
    }
    if (
      (direction === "left" || direction === "right") &&
      this.arrangement.docks[direction].panes.length > 0
    ) {
      return this.commit(dockedAt(lifted(this.arrangement, id), direction, id), screen);
    }
    const remaining = removeLeaf(tree, id);
    if (remaining === undefined) return refused("nothing-to-do");
    return this.commit(withTree(this.arrangement, attachAtEdge(remaining, id, direction)), screen);
  }

  private neighbor(
    direction: Direction,
    screen: Screen,
    eligible: (id: PaneId) => boolean = () => true,
  ): PaneId | undefined {
    const focused = this.focusedId;
    if (focused === undefined) return undefined;
    const rects = this.rects(screen);
    const origin = rects.get(focused);
    if (origin === undefined) return undefined;
    const candidates = [...rects].filter(([id]) => id !== focused && eligible(id));
    return nearestInDirection(origin, candidates, direction);
  }
}

const ok: Verdict = { ok: true };

function refused(refusal: Refusal): Verdict {
  return { ok: false, refused: refusal };
}

function splitOrientation(rect: Rect | undefined): Orientation {
  return rect !== undefined && isWide(rect) ? "row" : "column";
}
