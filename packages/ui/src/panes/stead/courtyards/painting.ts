import { scaleFor } from "@keywork-app/habitat/render";

export function courtyardPaintScale(dpr: number): number {
  return Math.min(4, scaleFor(dpr));
}
