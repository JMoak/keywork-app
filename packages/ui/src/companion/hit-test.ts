import type { HitMask } from "./port.ts";

export const enterMargin = 2;
export const leaveMargin = 6;

export interface Point {
  x: number;
  y: number;
}

export function maskHit(mask: HitMask, point: Point): boolean {
  const column = Math.floor(point.x);
  const row = Math.floor(point.y);
  if (column < 0 || row < 0 || column >= mask.width || row >= mask.height) return false;
  return (mask.bits[row * mask.width + column] ?? 0) !== 0;
}

export function nearMask(mask: HitMask, point: Point, margin: number): boolean {
  const centerX = Math.floor(point.x);
  const centerY = Math.floor(point.y);
  for (let dy = -margin; dy <= margin; dy += 1) {
    for (let dx = -margin; dx <= margin; dx += 1) {
      if (dx * dx + dy * dy > margin * margin) continue;
      if (maskHit(mask, { x: centerX + dx, y: centerY + dy })) return true;
    }
  }
  return false;
}

export function insideWithHysteresis(mask: HitMask, point: Point, wasInside: boolean): boolean {
  return nearMask(mask, point, wasInside ? leaveMargin : enterMargin);
}

export function emptyMask(width: number, height: number): HitMask {
  return { width, height, bits: new Uint8Array(Math.max(0, width * height)) };
}

export function unionMask(
  base: HitMask,
  rects: readonly { x: number; y: number; width: number; height: number }[],
): HitMask {
  const bits = new Uint8Array(base.bits);
  for (const rect of rects) {
    const right = Math.min(base.width, Math.ceil(rect.x + rect.width));
    const bottom = Math.min(base.height, Math.ceil(rect.y + rect.height));
    for (let y = Math.max(0, Math.floor(rect.y)); y < bottom; y += 1) {
      for (let x = Math.max(0, Math.floor(rect.x)); x < right; x += 1) bits[y * base.width + x] = 1;
    }
  }
  return { width: base.width, height: base.height, bits };
}
