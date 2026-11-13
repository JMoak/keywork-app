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
  without,
  withTree,
} from "./arrangement.ts";
import {
  area,
  type Direction,
  fullRect,
  isWide,
  nearestInDirection,
  nearestTowards,
  type Rect,
  type Screen,
} from "./geometry.ts";
import type { DropZone, Scene, Seam, SeamHandle } from "./hit.ts";
import { arrangementRects, holds, type Regions, regionsOf } from "./scene.ts";
import {
  floatRectOn,
  liftedInPlace,
  nudged,
  sameUnitRect,
  scaled,
  tuckedFor,
  type UnitRect,
  unitRectOn,
} from "./standing.ts";
import {
  arrangementOf,
  type LayoutState,
  layoutStateOf,
  openingOrderOf,
  parseLayoutState,
  standingOf,
} from "./state.ts";
import {
  attachAtEdge,
  collectSeams,
  type LayoutNode,
  leaf,
  type Orientation,
  type PaneId,
  ratioAt,
  removeLeaf,
  resizeAroundLeaf,
  rotateAroundLeaf,
  splitLeaf,
  steppedRatio,
  survivingSplitPaths,
  swapLeaves,
  withRatioAt,
} from "./tree.ts";

export type Verdict =
  | { ok: true; notice?: string | undefined }
  | { ok: false; refused: Refusal; notice?: string | undefined };

export type Refusal = "no-room" | "no-focus" | "unknown-pane" | "already-open" | "nothing-to-do";

export type Absence = "shelved" | "tucked";

export interface Shelved {
  readonly id: PaneId;
  readonly why: Absence;
}

export interface Floating {
  readonly id: PaneId;
  readonly rect: Rect;
  readonly z: number;
}

export class Layout {
  private arrangement: Arrangement = emptyArrangement();
  private focusedId: PaneId | undefined;
  private zoomedId: PaneId | undefined;
  private trail: PaneId[] = [];
  private opened: PaneId[] = [];
  private floats = new Map<PaneId, UnitRect>();
  private shelf: PaneId[] = [];
  private pins = new Set<PaneId>();

  static parse(value: unknown): LayoutState | undefined {
    return parseLayoutState(value);
  }

  toJSON(): LayoutState {
    return layoutStateOf(this.arrangement, this.focusedId, this.opened, {
      floats: this.floats,
      shelved: this.shelf,
      pinned: this.pins,
    });
  }

  load(state: LayoutState): void {
    const standing = standingOf(state);
    this.arrangement = arrangementOf(state);
    this.opened = openingOrderOf(state);
    this.floats = new Map(standing.floats);
    this.shelf = [...standing.shelved];
    this.pins = new Set(standing.pinned);
    this.trail = [];
    this.zoomedId = undefined;
    this.focusOn(state.focused ?? this.present()[0]);
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

  openingOrder(): PaneId[] {
    return [...this.opened];
  }

  mainCount(): number {
    return mainPanes(this.arrangement).length;
  }

  dockSideOf(id: PaneId): DockSide | undefined {
    return sideOf(this.arrangement, id);
  }

  dockRatio(side: DockSide): number {
    return this.arrangement.docks[side].ratio;
  }

  spawnRank(id: PaneId): number {
    return this.opened.indexOf(id);
  }

  isFloating(id: PaneId): boolean {
    return this.floats.has(id);
  }

  isShelved(id: PaneId): boolean {
    return this.shelf.includes(id);
  }

  isPinned(id: PaneId): boolean {
    return this.pins.has(id);
  }

  rects(screen: Screen): Map<PaneId, Rect> {
    const floating = this.floating(screen).map(({ id, rect }) => [id, rect] as const);
    if (this.zoomedId === undefined) return new Map([...this.tiledRects(screen), ...floating]);
    const zoomed = this.zoomedId;
    return new Map([[zoomed, fullRect(screen)], ...floating.filter(([id]) => id !== zoomed)]);
  }

  floating(screen: Screen): Floating[] {
    return this.floatingBottomUp().map((id, index) => ({
      id,
      rect: floatRectOn(screen, this.floats.get(id) as UnitRect),
      z: index + 1,
    }));
  }

  shelved(screen: Screen): Shelved[] {
    const tucked = this.tucked(screen).reverse();
    return [
      ...this.shelf.map((id) => ({ id, why: "shelved" as const })),
      ...tucked.map((id) => ({ id, why: "tucked" as const })),
    ];
  }

  regions(screen: Screen): Regions {
    return regionsOf(this.showing(screen), screen);
  }

  scene(screen: Screen): Scene {
    const homes = new Map(this.panes().map((id) => [id, this.dockSideOf(id) ?? "main"] as const));
    return {
      screen,
      rects: this.rects(screen),
      homes,
      seams: this.seams(screen),
      regions: this.regions(screen),
      floating: this.floatingBottomUp().reverse(),
    };
  }

  seams(screen: Screen): Seam[] {
    if (this.zoomedId !== undefined) return [];
    const showing = this.showing(screen);
    const regions = regionsOf(showing, screen);
    return [
      ...(regions.left === undefined ? [] : [dockSeam("left", regions.left, screen)]),
      ...this.splitSeams(showing, regions.main),
      ...(regions.right === undefined ? [] : [dockSeam("right", regions.right, screen)]),
    ];
  }

  emptyMainRect(screen: Screen): Rect | undefined {
    const showing = this.showing(screen);
    if (this.zoomedId !== undefined || showing.tree !== undefined) return undefined;
    if (this.panes().length === 0) return undefined;
    return regionsOf(showing, screen).main;
  }

  open(id: PaneId, screen: Screen, beside: PaneId | undefined = this.focusedId): Verdict {
    if (this.panes().includes(id)) return refused("already-open");
    return this.seatFocusing(this.seatedBeside(id, screen, beside), id);
  }

  openInMain(id: PaneId, screen: Screen): Verdict {
    if (this.panes().includes(id)) return refused("already-open");
    return this.seatFocusing(this.seatedInMain(id, screen), id);
  }

  openInDock(id: PaneId, side: DockSide): Verdict {
    if (this.panes().includes(id)) return refused("already-open");
    return this.seatFocusing(dockedAt(this.arrangement, side, id), id);
  }

  hasRoomBeside(screen: Screen, beside: PaneId | undefined = this.focusedId): boolean {
    return this.showsWithoutTucking(this.seatedBeside(newcomer, screen, beside), screen);
  }

  hasRoomInMain(screen: Screen): boolean {
    return this.showsWithoutTucking(this.seatedInMain(newcomer, screen), screen);
  }

  hasRoomInDock(side: DockSide, screen: Screen): boolean {
    return this.showsWithoutTucking(dockedAt(this.arrangement, side, newcomer), screen);
  }

  close(id: PaneId): Verdict {
    if (!this.panes().includes(id)) return refused("unknown-pane");
    const side = this.dockSideOf(id);
    const slot = side === undefined ? -1 : this.arrangement.docks[side].panes.indexOf(id);
    this.arrangement = lifted(this.arrangement, id);
    this.trail = this.trail.filter((pane) => pane !== id);
    this.opened = this.opened.filter((pane) => pane !== id);
    this.shelf = this.shelf.filter((pane) => pane !== id);
    this.floats.delete(id);
    this.pins.delete(id);
    if (this.zoomedId === id) this.zoomedId = undefined;
    if (this.focusedId === id) this.focusOn(this.heir(side, slot) ?? this.takenOffTheShelf());
    return ok;
  }

  focus(id: PaneId): Verdict {
    if (!this.panes().includes(id)) return refused("unknown-pane");
    this.shelf = this.shelf.filter((pane) => pane !== id);
    if (this.zoomedId !== undefined && this.zoomedId !== id && !this.isFloating(id)) {
      this.zoomedId = undefined;
    }
    this.focusOn(id);
    return ok;
  }

  focusOrdinal(ordinal: number): Verdict {
    const id = this.opened[ordinal - 1];
    return id === undefined ? refused("unknown-pane") : this.focus(id);
  }

  moveFocus(direction: Direction, screen: Screen): Verdict {
    const neighbor = this.tiledNeighborToward(direction, screen);
    return neighbor === undefined ? refused("nothing-to-do") : this.focus(neighbor);
  }

  neighborToward(direction: Direction, shown: ReadonlyMap<PaneId, Rect>): PaneId | undefined {
    return this.neighbor(direction, shown);
  }

  tiledNeighborToward(direction: Direction, screen: Screen): PaneId | undefined {
    return this.neighbor(direction, this.tiledWithTheFocusedFloat(screen));
  }

  focusAcrossLayers(screen: Screen): Verdict {
    const ring = this.layerRing(screen);
    const at = this.focusedId === undefined ? -1 : ring.indexOf(this.focusedId);
    const next = ring[(at + 1) % ring.length];
    if (next === undefined || next === this.focusedId || this.floats.size === 0) {
      return refused("nothing-to-do");
    }
    return this.focus(next);
  }

  zoomToggle(): Verdict {
    if (this.focusedId === undefined) return refused("no-focus");
    this.zoomedId = this.zoomedId === this.focusedId ? undefined : this.focusedId;
    return ok;
  }

  floatToggle(screen: Screen): Verdict {
    const id = this.focusedId;
    if (id === undefined) return refused("no-focus");
    if (this.floats.delete(id)) return ok;
    this.floats.set(id, liftedInPlace(this.rects(screen).get(id), screen));
    if (this.zoomedId === id) this.zoomedId = undefined;
    return ok;
  }

  placeFloat(id: PaneId, rect: Rect, screen: Screen): Verdict {
    const held = this.floats.get(id);
    if (held === undefined) return refused("unknown-pane");
    return this.refloat(id, held, unitRectOn(screen, rect));
  }

  shelve(id: PaneId): Verdict {
    if (!this.panes().includes(id)) return refused("unknown-pane");
    if (this.isShelved(id) || this.present().length <= 1) return refused("nothing-to-do");
    this.shelf = [...this.shelf, id];
    if (this.zoomedId === id) this.zoomedId = undefined;
    if (this.focusedId === id) this.focusOn(this.mostRecentPresent());
    return ok;
  }

  shelveFocused(): Verdict {
    return this.focusedId === undefined ? refused("no-focus") : this.shelve(this.focusedId);
  }

  returnFromShelf(screen: Screen): Verdict {
    const returning = this.shelf.at(-1) ?? this.tucked(screen).at(-1);
    return returning === undefined ? refused("nothing-to-do") : this.focus(returning);
  }

  pinToggle(): Verdict {
    const id = this.focusedId;
    if (id === undefined) return refused("no-focus");
    if (!this.pins.delete(id)) this.pins.add(id);
    return ok;
  }

  move(direction: Direction, screen: Screen): Verdict {
    const id = this.focusedId;
    if (id === undefined) return refused("no-focus");
    const float = this.floats.get(id);
    if (float !== undefined) return this.refloat(id, float, nudged(float, direction));
    const side = this.dockSideOf(id);
    const verdict =
      side === undefined
        ? this.moveInMain(id, direction, screen)
        : this.moveDocked(id, side, direction);
    if (verdict.ok) this.zoomedId = undefined;
    return verdict;
  }

  rotate(screen: Screen): Verdict {
    const id = this.focusedId;
    const tree = this.arrangement.tree;
    if (id === undefined) return refused("no-focus");
    const tiled = this.tiledRects(screen);
    if (tree === undefined || this.dockSideOf(id) !== undefined || !tiled.has(id)) {
      return refused("nothing-to-do");
    }
    const rotated = rotateAroundLeaf(tree, id, (pane) => tiled.has(pane));
    if (rotated === tree) return refused("nothing-to-do");
    this.arrangement = withTree(this.arrangement, rotated);
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

  dockFocused(side: DockSide): Verdict {
    if (this.focusedId === undefined) return refused("no-focus");
    return this.dock(this.focusedId, side);
  }

  undockFocused(screen: Screen): Verdict {
    if (this.focusedId === undefined) return refused("no-focus");
    return this.undock(this.focusedId, screen);
  }

  dock(id: PaneId, side: DockSide): Verdict {
    if (!this.panes().includes(id)) return refused("unknown-pane");
    const landed = this.floats.delete(id);
    if (this.dockSideOf(id) === side) return landed ? ok : refused("nothing-to-do");
    return this.seat(dockedAt(lifted(this.arrangement, id), side, id));
  }

  undock(id: PaneId, screen: Screen): Verdict {
    if (!this.panes().includes(id)) return refused("unknown-pane");
    const landed = this.floats.delete(id);
    const from = this.dockSideOf(id);
    if (from === undefined) return landed ? ok : refused("nothing-to-do");
    const remaining = lifted(this.arrangement, id);
    return this.seat(withTree(remaining, this.landing(id, remaining.tree, from, screen)));
  }

  send(id: PaneId, zone: DropZone, screen: Screen): Verdict {
    return zone === "main" ? this.undock(id, screen) : this.dock(id, zone);
  }

  resizeSeam(handle: SeamHandle, ratio: number, screen: Screen): Verdict {
    const candidate = this.withSeamRatio(handle, steppedRatio(ratio));
    if (
      candidate === undefined ||
      seamRatio(candidate, handle) === seamRatio(this.arrangement, handle)
    ) {
      return refused("nothing-to-do");
    }
    return this.resize(candidate, screen);
  }

  cycleFocused(screen: Screen): Verdict {
    if (this.focusedId === undefined) return refused("no-focus");
    const from = this.dockSideOf(this.focusedId);
    if (from === undefined) return this.dockFocused("left");
    if (from === "left") return this.dockFocused("right");
    return this.undockFocused(screen);
  }

  resizeDock(side: DockSide, delta: number, screen: Screen): Verdict {
    return this.resize(withDockRatio(this.arrangement, side, this.dockRatio(side) + delta), screen);
  }

  resizeFocused(delta: number, screen: Screen): Verdict {
    const id = this.focusedId;
    if (id === undefined) return refused("no-focus");
    const float = this.floats.get(id);
    if (float !== undefined) return this.refloat(id, float, scaled(float, delta));
    const tree = this.arrangement.tree;
    if (tree === undefined || this.dockSideOf(id) !== undefined) return refused("nothing-to-do");
    const tiled = this.tiledRects(screen);
    const resized = resizeAroundLeaf(tree, id, delta, (pane) => tiled.has(pane));
    if (JSON.stringify(resized) === JSON.stringify(tree)) return refused("nothing-to-do");
    return this.resize(withTree(this.arrangement, resized), screen);
  }

  private seatedBeside(id: PaneId, screen: Screen, beside: PaneId | undefined): Arrangement {
    const anchor = this.tiledAnchor(screen, beside);
    const anchorSide = anchor === undefined ? undefined : this.dockSideOf(anchor);
    if (anchor !== undefined && anchorSide !== undefined) {
      const index = this.arrangement.docks[anchorSide].panes.indexOf(anchor) + 1;
      return dockedAt(this.arrangement, anchorSide, id, index);
    }
    const tree = this.arrangement.tree;
    if (tree === undefined) return withTree(this.arrangement, leaf(id));
    if (anchor === undefined) return this.atMainEdge(tree, id);
    const orientation = splitOrientation(this.tiledRects(screen).get(anchor));
    return withTree(this.arrangement, splitLeaf(tree, anchor, leaf(id), orientation));
  }

  private seatedInMain(id: PaneId, screen: Screen): Arrangement {
    const tree = this.arrangement.tree;
    if (tree === undefined) return withTree(this.arrangement, leaf(id));
    const target = this.largestMainLeaf(screen);
    if (target === undefined) return this.atMainEdge(tree, id);
    const grown = splitLeaf(tree, target.id, leaf(id), splitOrientation(target.rect));
    return withTree(this.arrangement, grown);
  }

  private showsWithoutTucking(candidate: Arrangement, screen: Screen): boolean {
    const staged = without(candidate, (id) => this.isShelved(id) || this.isFloating(id));
    const waiting = tuckedFor(staged, [newcomer, ...this.standing()], screen);
    return waiting.length <= this.tucked(screen).length;
  }

  private staged(): Arrangement {
    return without(this.arrangement, (id) => this.isShelved(id) || this.isFloating(id));
  }

  private tucked(screen: Screen): PaneId[] {
    return tuckedFor(this.staged(), this.standing(), screen);
  }

  private showing(screen: Screen): Arrangement {
    return this.showingOf(this.arrangement, screen);
  }

  private showingOf(candidate: Arrangement, screen: Screen): Arrangement {
    const tucked = this.tucked(screen);
    return without(
      candidate,
      (id) => this.isShelved(id) || this.isFloating(id) || tucked.includes(id),
    );
  }

  private standing(): PaneId[] {
    const order = this.panes();
    const tier = (id: PaneId): number => (id === this.focusedId ? 0 : this.isPinned(id) ? 1 : 2);
    const recency = (id: PaneId): number => {
      const at = this.trail.indexOf(id);
      return at === -1 ? this.trail.length + order.indexOf(id) : at;
    };
    return [...order].sort((a, b) => tier(a) - tier(b) || recency(a) - recency(b));
  }

  private present(): PaneId[] {
    return this.panes().filter((id) => !this.isShelved(id));
  }

  private mostRecentPresent(): PaneId | undefined {
    const present = this.present();
    return this.trail.find((id) => present.includes(id)) ?? present[0];
  }

  private takenOffTheShelf(): PaneId | undefined {
    const returning = this.shelf.at(-1);
    this.shelf = this.shelf.slice(0, -1);
    return returning;
  }

  private floatingBottomUp(): PaneId[] {
    const recency = (id: PaneId): number => {
      const at = this.trail.indexOf(id);
      return at === -1 ? this.trail.length : at;
    };
    return [...this.floats.keys()]
      .filter((id) => !this.isShelved(id))
      .sort((a, b) => recency(b) - recency(a));
  }

  private layerRing(screen: Screen): PaneId[] {
    const tiled = this.tiledAnchor(screen, this.zoomedId);
    const floating = [...this.floats.keys()].filter((id) => !this.isShelved(id));
    return [...(tiled === undefined ? [] : [tiled]), ...floating];
  }

  private refloat(id: PaneId, held: UnitRect, wanted: UnitRect): Verdict {
    if (sameUnitRect(held, wanted)) return refused("nothing-to-do");
    this.floats.set(id, wanted);
    return ok;
  }

  private splitSeams(showing: Arrangement, main: Rect): Seam[] {
    const seated = this.arrangement.tree;
    if (showing.tree === undefined || seated === undefined) return [];
    const shown = new Set(mainPanes(showing));
    const seatedPaths = survivingSplitPaths(seated, (id) => shown.has(id));
    return collectSeams(showing.tree, main).map((seam, index) =>
      splitSeam({ ...seam, path: seatedPaths[index] ?? seam.path }),
    );
  }

  private withSeamRatio(handle: SeamHandle, ratio: number): Arrangement | undefined {
    if (handle.kind === "dock") {
      if (this.arrangement.docks[handle.side].panes.length === 0) return undefined;
      return withDockRatio(this.arrangement, handle.side, ratio);
    }
    const tree = this.arrangement.tree;
    if (tree === undefined || ratioAt(tree, handle.path) === undefined) return undefined;
    return withTree(this.arrangement, withRatioAt(tree, handle.path, ratio));
  }

  private tiledRects(screen: Screen): Map<PaneId, Rect> {
    return arrangementRects(this.showing(screen), screen);
  }

  private tiledWithTheFocusedFloat(screen: Screen): Map<PaneId, Rect> {
    const tiled = this.tiledRects(screen);
    const focused = this.focusedId;
    const float = focused === undefined ? undefined : this.floats.get(focused);
    if (focused === undefined || float === undefined) return tiled;
    return new Map([...tiled, [focused, floatRectOn(screen, float)]]);
  }

  private tiledAnchor(screen: Screen, preferred: PaneId | undefined): PaneId | undefined {
    const tiled = this.tiledRects(screen);
    return [preferred, this.focusedId, ...this.trail, ...tiled.keys()].find(
      (id) => id !== undefined && tiled.has(id),
    );
  }

  private atMainEdge(tree: LayoutNode, id: PaneId): Arrangement {
    return withTree(this.arrangement, attachAtEdge(tree, id, "right"));
  }

  private seat(candidate: Arrangement): Verdict {
    this.arrangement = candidate;
    this.zoomedId = undefined;
    return ok;
  }

  private seatFocusing(candidate: Arrangement, id: PaneId): Verdict {
    this.seat(candidate);
    if (!this.opened.includes(id)) this.opened.push(id);
    this.focusOn(id);
    return ok;
  }

  private resize(candidate: Arrangement, screen: Screen): Verdict {
    const squeezes =
      holds(this.showing(screen), screen) && !holds(this.showingOf(candidate, screen), screen);
    return squeezes ? refused("no-room") : this.seat(candidate);
  }

  private focusOn(id: PaneId | undefined): void {
    this.focusedId = id;
    if (id === undefined) return;
    this.trail = [id, ...this.trail.filter((pane) => pane !== id)];
  }

  private heir(side: DockSide | undefined, slot: number): PaneId | undefined {
    const here = (id: PaneId): boolean => !this.isShelved(id);
    const { docks } = this.arrangement;
    const main = mainPanes(this.arrangement).filter(here);
    const stacks = { left: docks.left.panes.filter(here), right: docks.right.panes.filter(here) };
    if (side === undefined) {
      const recentMain = this.trail.find((pane) => main.includes(pane));
      return recentMain ?? main[0] ?? stacks.left[0] ?? stacks.right[0];
    }
    const stack = stacks[side];
    return stack[Math.min(slot, stack.length - 1)] ?? main[0] ?? stacks[otherSide(side)][0];
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

  private moveDocked(id: PaneId, side: DockSide, direction: Direction): Verdict {
    if (direction === "up" || direction === "down") {
      const reordered = this.pastThePresent(side, id, direction === "down" ? 1 : -1);
      if (reordered === undefined) return refused("nothing-to-do");
      this.arrangement = reordered;
      return ok;
    }
    const inward = side === "left" ? direction === "right" : direction === "left";
    if (!inward) return refused("nothing-to-do");
    const landing = attachAtEdge(this.arrangement.tree, id, side);
    return this.seat(withTree(lifted(this.arrangement, id), landing));
  }

  private pastThePresent(side: DockSide, id: PaneId, step: -1 | 1): Arrangement | undefined {
    let reordered = reorderedInDock(this.arrangement, side, id, step);
    while (reordered !== undefined && this.passedAnAbsentPane(reordered, side, id, step)) {
      reordered = reorderedInDock(reordered, side, id, step);
    }
    return reordered;
  }

  private passedAnAbsentPane(
    reordered: Arrangement,
    side: DockSide,
    id: PaneId,
    step: -1 | 1,
  ): boolean {
    const stack = reordered.docks[side].panes;
    const passed = stack[stack.indexOf(id) - step];
    return passed !== undefined && (this.isShelved(passed) || this.isFloating(passed));
  }

  private moveInMain(id: PaneId, direction: Direction, screen: Screen): Verdict {
    const tree = this.arrangement.tree;
    if (tree === undefined) return refused("nothing-to-do");
    const main = mainPanes(this.arrangement);
    const neighbor = this.neighbor(direction, this.tiledRects(screen), (candidate) =>
      main.includes(candidate),
    );
    if (neighbor !== undefined) {
      this.arrangement = withTree(this.arrangement, swapLeaves(tree, id, neighbor));
      return ok;
    }
    if (
      (direction === "left" || direction === "right") &&
      this.arrangement.docks[direction].panes.length > 0
    ) {
      return this.seat(dockedAt(lifted(this.arrangement, id), direction, id));
    }
    const remaining = removeLeaf(tree, id);
    if (remaining === undefined) return refused("nothing-to-do");
    return this.seat(withTree(this.arrangement, attachAtEdge(remaining, id, direction)));
  }

  private neighbor(
    direction: Direction,
    rects: ReadonlyMap<PaneId, Rect>,
    eligible: (id: PaneId) => boolean = () => true,
  ): PaneId | undefined {
    const focused = this.focusedId;
    if (focused === undefined) return undefined;
    const origin = rects.get(focused);
    if (origin === undefined) return undefined;
    const tiled = [...rects].filter(
      ([id]) => id !== focused && !this.isFloating(id) && eligible(id),
    );
    return this.isFloating(focused)
      ? nearestTowards(origin, tiled, direction)
      : nearestInDirection(origin, tiled, direction);
  }
}

const ok: Verdict = { ok: true };
const newcomer: PaneId = "\u0000newcomer";

function refused(refusal: Refusal): Verdict {
  return { ok: false, refused: refusal };
}

function splitOrientation(rect: Rect | undefined): Orientation {
  return rect !== undefined && isWide(rect) ? "row" : "column";
}

function seamRatio(arrangement: Arrangement, handle: SeamHandle): number | undefined {
  if (handle.kind === "dock") return arrangement.docks[handle.side].ratio;
  return arrangement.tree === undefined ? undefined : ratioAt(arrangement.tree, handle.path);
}

function splitSeam(seam: ReturnType<typeof collectSeams>[number]): Seam {
  const { path, orientation, ...span } = seam;
  return { handle: { kind: "split", path }, axis: orientation === "row" ? "x" : "y", ...span };
}

function dockSeam(side: DockSide, dock: Rect, screen: Screen): Seam {
  return {
    handle: { kind: "dock", side },
    axis: "x",
    at: side === "left" ? dock.x + dock.width : dock.x,
    start: dock.y,
    end: dock.y + dock.height,
    origin: 0,
    length: screen.width,
  };
}
