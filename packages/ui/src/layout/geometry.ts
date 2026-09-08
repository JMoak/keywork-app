export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Screen {
  readonly width: number;
  readonly height: number;
}

export type Direction = "left" | "right" | "up" | "down";

export function fullRect(screen: Screen): Rect {
  return { x: 0, y: 0, width: screen.width, height: screen.height };
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

export function area(rect: Rect): number {
  return rect.width * rect.height;
}

export function isWide(rect: Rect): boolean {
  return rect.width >= rect.height * wideAspect;
}

export function nearestInDirection<Id>(
  from: Rect,
  candidates: Iterable<readonly [Id, Rect]>,
  direction: Direction,
): Id | undefined {
  const origin = centerOf(from);
  let best: { id: Id; distance: number } | undefined;
  for (const [id, rect] of candidates) {
    if (!liesInDirection(from, rect, direction)) continue;
    const target = centerOf(rect);
    const distance = (origin.x - target.x) ** 2 + (origin.y - target.y) ** 2;
    if (best === undefined || distance < best.distance) best = { id, distance };
  }
  return best?.id;
}

const wideAspect = 1.2;

function centerOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function liesInDirection(from: Rect, candidate: Rect, direction: Direction): boolean {
  switch (direction) {
    case "left":
      return candidate.x + candidate.width <= from.x;
    case "right":
      return candidate.x >= from.x + from.width;
    case "up":
      return candidate.y + candidate.height <= from.y;
    case "down":
      return candidate.y >= from.y + from.height;
  }
}
