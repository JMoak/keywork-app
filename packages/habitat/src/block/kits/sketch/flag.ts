import { type Crowning, familyFlags, type SpriteArt } from "../../kit.ts";
import { mixedRole, type Role } from "../../texture.ts";
import { anchored, placed, spriteOf } from "./shapes.ts";
import type { SketchStyle } from "./style.ts";

export const mastHeight = 6;
export const quietShare = 0.3;
export const flagCuts = [
  ["###", "###", "###"],
  ["###", "##.", "#.."],
  ["###", "...", "###"],
  ["###", "#.#", "###"],
  ["###", "...", "..."],
  ["#.#", ".#.", "#.#"],
] as const satisfies readonly (readonly string[])[];

export function familyFlag(
  style: SketchStyle,
  family: number,
  x: number,
  y: number,
  z: number,
): Crowning {
  return { x, z, part: placed(flagArt(style, family), x, y, z) };
}

export function flagArt(style: SketchStyle, family: number): SpriteArt {
  const cut = flagCuts[((family % familyFlags) + familyFlags) % familyFlags] ?? flagCuts[0];
  const { mast, cloth } = clothOf(style);
  const across = cut[0]?.length ?? 0;
  return spriteOf([
    anchored(`flag|${family}|${mast}|${cloth}`, 0, -mastHeight, across + 1, mastHeight, (put) => {
      put(0, -mastHeight, 1, mastHeight, mast);
      cut.forEach((row, down) => {
        [...row].forEach((cell, along) => {
          if (cell === "#") put(1 + along, down - mastHeight, 1, 1, cloth);
        });
      });
    }),
  ]);
}

interface Cloth {
  readonly mast: Role;
  readonly cloth: Role;
}

function clothOf(style: SketchStyle): Cloth {
  return style.piers
    ? { mast: "trimLo", cloth: "trim" }
    : { mast: "ink", cloth: mixedRole("lamp", "ink", quietShare) };
}
