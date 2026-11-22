import type { Extent } from "@keywork-app/habitat";
import type { ScreenPoint, ScreenRect } from "../port.ts";

export function rightOf(rect: ScreenRect): number {
  return rect.x + rect.width;
}

export function bottomOf(rect: ScreenRect): number {
  return rect.y + rect.height;
}

export function spanning(left: number, top: number, right: number, bottom: number): ScreenRect {
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function movedBy(rect: ScreenRect, by: ScreenPoint): ScreenRect {
  return { ...rect, x: rect.x + by.x, y: rect.y + by.y };
}

export function grownBy(rect: ScreenRect, by: number): ScreenRect {
  return spanning(rect.x - by, rect.y - by, rightOf(rect) + by, bottomOf(rect) + by);
}

export function sharedBy(one: ScreenRect, other: ScreenRect): ScreenRect {
  return spanning(
    Math.max(one.x, other.x),
    Math.max(one.y, other.y),
    Math.min(rightOf(one), rightOf(other)),
    Math.min(bottomOf(one), bottomOf(other)),
  );
}

export function liesWithin(area: ScreenRect, rect: ScreenRect): boolean {
  return (
    rect.x >= area.x &&
    rect.y >= area.y &&
    rightOf(rect) <= rightOf(area) &&
    bottomOf(rect) <= bottomOf(area)
  );
}

export function keptWithin(area: ScreenRect, rect: ScreenRect): ScreenRect {
  return {
    ...rect,
    x: clamp(rect.x, area.x, Math.max(area.x, rightOf(area) - rect.width)),
    y: clamp(rect.y, area.y, Math.max(area.y, bottomOf(area) - rect.height)),
  };
}

export function fitsIn(room: Extent, size: Extent): boolean {
  return size.width <= room.width && size.height <= room.height;
}

export function reachOf(rects: readonly ScreenRect[]): Extent {
  return {
    width: Math.max(0, ...rects.map(rightOf)),
    height: Math.max(0, ...rects.map(bottomOf)),
  };
}

export function largestOf(sizes: readonly Extent[]): Extent {
  return {
    width: Math.max(0, ...sizes.map((size) => size.width)),
    height: Math.max(0, ...sizes.map((size) => size.height)),
  };
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
