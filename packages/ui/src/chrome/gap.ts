import { seamReach } from "../layout/index.ts";

export const gapCellRem = 0.5;

export function gapSeamReach(cells: number, remPx: number): number {
  const halfGap = (cells * gapCellRem * remPx) / 2;
  return Math.max(seamReach, Math.ceil(halfGap));
}

export function rootRemPx(): number {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function")
    return fallbackRemPx;
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : fallbackRemPx;
}

const fallbackRemPx = 14;
