import type { StoredPosition } from "./preferences.ts";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface DisplayLike {
  id: number;
  bounds: Rect;
  workArea: Rect;
  scaleFactor: number;
}

export type Edge = StoredPosition["edge"];

export const homeInset = 16;
export const snapDistance = 24;
export const nudgeStep = 8;

export function layoutKeyOf(displays: readonly DisplayLike[]): string {
  return [...displays]
    .sort((a, b) => a.id - b.id)
    .map(({ id, bounds }) => `${id}@${bounds.x},${bounds.y},${bounds.width}x${bounds.height}`)
    .join("|");
}

export function homeBounds(display: DisplayLike, size: Size): Rect {
  const area = display.workArea;
  return clampToWorkArea(
    {
      x: area.x + area.width - size.width - homeInset,
      y: area.y + area.height - size.height - homeInset,
      ...size,
    },
    area,
  );
}

export function displayUnder(
  point: Point | undefined,
  displays: readonly DisplayLike[],
): DisplayLike {
  const first = displays[0];
  if (first === undefined) throw new Error("no display to place the companion on");
  if (point === undefined) return first;
  return displays.find((display) => contains(display.bounds, point)) ?? first;
}

export function displayOf(bounds: Rect, displays: readonly DisplayLike[]): DisplayLike {
  return displayUnder(center(bounds), displays);
}

export function storedFrom(bounds: Rect, displays: readonly DisplayLike[]): StoredPosition {
  const display = displayOf(bounds, displays);
  const area = display.workArea;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return {
    layoutKey: layoutKeyOf(displays),
    displayId: display.id,
    edge: edgeOf(bounds, area),
    u: fraction(right - area.x, area.width),
    v: fraction(bottom - area.y, area.height),
  };
}

export function boundsFrom(stored: StoredPosition, display: DisplayLike, size: Size): Rect {
  const area = display.workArea;
  const anchored = {
    x: area.x + stored.u * area.width - size.width,
    y: area.y + stored.v * area.height - size.height,
    ...size,
  };
  return clampToWorkArea(snapped(anchored, stored.edge, area), area);
}

export function restoreBounds(
  positions: Readonly<Record<string, StoredPosition>>,
  displays: readonly DisplayLike[],
  size: Size,
  cursor: Point | undefined,
): Rect {
  const layout = positions[layoutKeyOf(displays)];
  const onLayout = layout && displays.find((display) => display.id === layout.displayId);
  if (layout && onLayout) return boundsFrom(layout, onLayout, size);
  for (const stored of Object.values(positions)) {
    const display = displays.find((candidate) => candidate.id === stored.displayId);
    if (display !== undefined) return boundsFrom(stored, display, size);
  }
  return homeBounds(displayUnder(cursor, displays), size);
}

export function clampToWorkArea(bounds: Rect, area: Rect): Rect {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.round(clamp(bounds.x, area.x, area.x + area.width - width)),
    y: Math.round(clamp(bounds.y, area.y, area.y + area.height - height)),
    width,
    height,
  };
}

export function moved(bounds: Rect, dx: number, dy: number, area: Rect): Rect {
  return clampToWorkArea({ ...bounds, x: bounds.x + dx, y: bounds.y + dy }, area);
}

export function settled(bounds: Rect, area: Rect): Rect {
  return clampToWorkArea(snapped(bounds, edgeOf(bounds, area), area), area);
}

export function resizedAtAnchor(bounds: Rect, size: Size, area: Rect): Rect {
  return clampToWorkArea(
    {
      x: bounds.x + bounds.width - size.width,
      y: bounds.y + bounds.height - size.height,
      ...size,
    },
    area,
  );
}

export function edgeOf(bounds: Rect, area: Rect): Edge {
  const distances: Array<[Edge, number]> = [
    ["left", bounds.x - area.x],
    ["right", area.x + area.width - (bounds.x + bounds.width)],
    ["top", bounds.y - area.y],
    ["bottom", area.y + area.height - (bounds.y + bounds.height)],
  ];
  const nearest = distances
    .filter(([, distance]) => distance <= snapDistance)
    .sort((a, b) => a[1] - b[1])[0];
  return nearest === undefined ? "none" : nearest[0];
}

function snapped(bounds: Rect, edge: Edge, area: Rect): Rect {
  switch (edge) {
    case "left":
      return { ...bounds, x: area.x };
    case "right":
      return { ...bounds, x: area.x + area.width - bounds.width };
    case "top":
      return { ...bounds, y: area.y };
    case "bottom":
      return { ...bounds, y: area.y + area.height - bounds.height };
    case "none":
      return bounds;
  }
}

function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function fraction(part: number, whole: number): number {
  return whole <= 0 ? 1 : clamp(part / whole, 0, 1);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}
