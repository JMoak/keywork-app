import { type Placement, place } from "../kid/cell.ts";
import { type Part, part } from "../kid/sprite.ts";
import { groundBase, groundHighlight, groundLight } from "../legend.ts";

export type Point = readonly [x: number, y: number];

export const crown = part("tessera crown", 15, 13, [
  ".......hhhhh.......",
  "....hhhhhhhhhhh....",
  "..hhhhhhhhhhhhhhh..",
  ".hhhhhhhhhhhhhhlll.",
  "hhhhhhhclhhhhhlllll",
  "hhhhhccclcchhllllll",
  "hhhhhhclclhhlllllls",
  ".hhhhhhlhhhhhlllls.",
  "...lllllllssssss...",
]);

export const leftPlate = part("tessera left plate", 7, 21, [
  "....hhhhh....",
  "..hhhhhhhhh..",
  ".hhhhhhhhhhh.",
  "hhhhhchhhllll",
  "hhhccclhlllll",
  "hhhhclchlllls",
  "hhhhhlhllllss",
  "hhhhhlllllsss",
  ".lllllllssss.",
  "..llllsssss..",
  "....sssss....",
]);

export const rightPlate = part("tessera right plate", 29, 22, [
  "...hhhhh....",
  ".hhhhhhhhh..",
  "hhhhhhhllll.",
  "hhhchhllllll",
  "hhcclcllllls",
  "hhhlclllllss",
  "hhhllllllsss",
  ".llllllssss.",
  "..lllsssss..",
  "...sssss....",
]);

export const frontPlate = part("tessera front plate", 17, 24, [
  "....hhhhh....",
  "..hhhhhhhhh..",
  ".hhhhhhhhhhh.",
  "hhhhhhhhhhlll",
  "hhhhchhhhllll",
  "hhccclcclllll",
  "hhhclchllllll",
  "hhhhlhlllllls",
  ".hhhllllllss.",
  "..llllllsss..",
  "....lssss....",
]);

export const underside = part("tessera underside", 13, 30, [
  "....gggggggggggg....",
  "..gggggggggggggggg..",
  ".ggwwwwwwwwwwwwgggg.",
  "ggwwggggggggggwwggdd",
  "ggggdddddddddddddddd",
  ".dddddddddddddddddd.",
  "...dddddddddddddd...",
]);

export const parcel = part("tessera parcel", 18, 31, [
  ".wwwwwwwwww.",
  "wwppwwwwppww",
  "wggggwwggggw",
  "wggggwwggggw",
  "wggggwwggggw",
  "wggggwwggggw",
  "wggggwwggggw",
  "wggggwwggggw",
  "wddddwwddddw",
  ".ddddwwdddd.",
]);

export const page = part("tessera page", 22, 34, [
  "hhhhhhhhhh.",
  "hpppppppphh",
  "hpsssssppph",
  "hppppppppph",
  "hpsssssspph",
  "hppppppppph",
  "hpsssspppph",
  "hppppppppph",
  "hhhhhhhhhhh",
]);

export const workpiece = part("tessera workpiece", 28, 39, [
  "..wwwwww..",
  ".wppppppw.",
  "wppwwwwppw",
  "wwggggggww",
  "wggggggggd",
  ".dddddddd.",
]);

export const chisel = part("tessera chisel", 29, 31, ["hh", "ll", "ll", "ww", "gg", "gg", "ss"]);

export const fault = part("tessera fault seam", 22, 25, ["!.", "!!", ".!", "!!", "!."]);

export function leg(name: string, points: readonly Point[], light = false): Placement {
  const left = Math.min(...points.map(([x]) => x));
  const top = Math.min(...points.map(([, y]) => y));
  const width = Math.max(...points.map(([x]) => x)) - left + 2;
  const height = Math.max(...points.map(([, y]) => y)) - top + 1;
  const pixels = new Uint8Array(width * height);
  for (let at = 1; at < points.length; at += 1) {
    const from = points[at - 1] as Point;
    const to = points[at] as Point;
    const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
    for (let step = 0; step <= steps; step += 1) {
      const share = steps === 0 ? 0 : step / steps;
      const x = Math.round(from[0] + (to[0] - from[0]) * share) - left;
      const y = Math.round(from[1] + (to[1] - from[1]) * share) - top;
      pixels[y * width + x] = light ? groundHighlight : groundLight;
      pixels[y * width + x + 1] = light ? groundLight : groundBase;
    }
  }
  const drawn: Part = { name, x: left, y: top, sprite: { width, height, pixels } };
  return place(drawn, { layer: "behind" });
}
