import type { Arrangement } from "./arrangement.ts";
import { fullRect, type Rect, type Screen } from "./geometry.ts";
import {
  collectRects,
  type LayoutNode,
  minHeight,
  minPaneSize,
  minWidth,
  type PaneId,
} from "./tree.ts";

export interface Regions {
  readonly left?: Rect;
  readonly main: Rect;
  readonly right?: Rect;
}

export function regionsOf(arrangement: Arrangement, screen: Screen): Regions {
  const { tree, docks } = arrangement;
  return carveColumns(
    fullRect(screen),
    docks.left.panes.length > 0 ? docks.left.ratio : undefined,
    docks.right.panes.length > 0 ? docks.right.ratio : undefined,
    tree === undefined ? 0 : Math.max(minPaneSize.width, minWidth(tree)),
  );
}

export function holds(arrangement: Arrangement, screen: Screen): boolean {
  const regions = regionsOf(arrangement, screen);
  return (
    dockHolds(regions.left, arrangement.docks.left.panes.length) &&
    dockHolds(regions.right, arrangement.docks.right.panes.length) &&
    (arrangement.tree === undefined || treeHolds(regions.main, arrangement.tree))
  );
}

export function arrangementRects(arrangement: Arrangement, screen: Screen): Map<PaneId, Rect> {
  const rects = new Map<PaneId, Rect>();
  const regions = regionsOf(arrangement, screen);
  if (regions.left !== undefined) stack(arrangement.docks.left.panes, regions.left, rects);
  if (arrangement.tree !== undefined) collectRects(arrangement.tree, regions.main, rects);
  if (regions.right !== undefined) stack(arrangement.docks.right.panes, regions.right, rects);
  return rects;
}

export function dockSlotRects(rect: Rect, count: number): Rect[] {
  const shares = integerShares(count, rect.height);
  let y = rect.y;
  return shares.map((height) => {
    const slot = { x: rect.x, y, width: rect.width, height };
    y += height;
    return slot;
  });
}

function stack(ids: readonly PaneId[], rect: Rect, into: Map<PaneId, Rect>): void {
  const slots = dockSlotRects(rect, ids.length);
  ids.forEach((id, index) => {
    const slot = slots[index];
    if (slot !== undefined) into.set(id, slot);
  });
}

function integerShares(count: number, total: number): number[] {
  if (count === 0) return [];
  const base = Math.floor(total / count);
  const leftover = total - base * count;
  return Array.from({ length: count }, (_, index) => (index < leftover ? base + 1 : base));
}

function carveColumns(
  full: Rect,
  leftRatio: number | undefined,
  rightRatio: number | undefined,
  mainReserve: number,
): Regions {
  if (leftRatio === undefined && rightRatio === undefined) return { main: full };
  const [leftWidth, rightWidth] = fittedDockWidths(
    leftRatio === undefined ? 0 : preferredDockWidth(full.width, leftRatio),
    rightRatio === undefined ? 0 : preferredDockWidth(full.width, rightRatio),
    full.width,
    mainReserve,
  );
  const mainWidth = full.width - leftWidth - rightWidth;
  return {
    ...(leftRatio !== undefined && { left: { ...full, width: leftWidth } }),
    main: { ...full, x: full.x + leftWidth, width: mainWidth },
    ...(rightRatio !== undefined && {
      right: { ...full, x: full.x + leftWidth + mainWidth, width: rightWidth },
    }),
  };
}

function preferredDockWidth(screenWidth: number, ratio: number): number {
  return Math.max(minPaneSize.width, Math.round(screenWidth * ratio));
}

function fittedDockWidths(
  left: number,
  right: number,
  room: number,
  mainReserve: number,
): [number, number] {
  const available = Math.max(0, room - mainReserve);
  const wanted = left + right;
  if (wanted <= available) return [left, right];
  if (available === 0 || wanted === 0) return [0, 0];
  const scaledLeft = Math.floor((left * available) / wanted);
  return [scaledLeft, available - scaledLeft];
}

function dockHolds(rect: Rect | undefined, count: number): boolean {
  if (count === 0) return true;
  return (
    rect !== undefined &&
    rect.width >= minPaneSize.width &&
    Math.floor(rect.height / count) >= minPaneSize.height
  );
}

function treeHolds(rect: Rect, tree: LayoutNode): boolean {
  return minWidth(tree) <= rect.width && minHeight(tree) <= rect.height;
}
