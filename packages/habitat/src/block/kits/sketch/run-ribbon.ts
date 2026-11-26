import { type Brush, mixedRole, type Role } from "../../texture.ts";

export const ribbonWidth = 3;
export const doorMargin = 5;
export const framePost = 2;
export const underTheBlade = 7;

export interface RibbonPlace {
  readonly x: number;
  readonly y: number;
}

export function runRibbonPlace(
  wall: { readonly piers: boolean; readonly frames: boolean },
  height: number,
  doorTop: number,
): RibbonPlace {
  if (wall.piers) return { x: 0, y: height - underTheBlade };
  const post = wall.frames ? framePost : 0;
  return { x: post + Math.floor((doorMargin - post - ribbonWidth) / 2), y: doorTop + 2 };
}

export function runRibbon(brush: Brush, tier: number, at: RibbonPlace): void {
  const cloth = cloths[tier - 1];
  if (cloth === undefined) return;
  brush.rect(at.x, at.y, ribbonWidth, 3, cloth.rosette);
  brush.dot(at.x + 1, at.y + 1, cloth.heart);
  brush.rect(at.x, at.y + 3, ribbonWidth, 1, cloth.tails);
  brush.dot(at.x, at.y + 4, cloth.tails);
  brush.dot(at.x + 2, at.y + 4, cloth.tails);
}

interface Cloth {
  readonly rosette: Role;
  readonly heart: Role;
  readonly tails: Role;
}

const cloths: readonly Cloth[] = [
  { rosette: "err", heart: mixedRole("err", "paper", 0.55), tails: mixedRole("err", "ink", 0.3) },
  { rosette: "gold", heart: "err", tails: "err" },
  { rosette: "gold", heart: "goldHi", tails: "goldDk" },
];
