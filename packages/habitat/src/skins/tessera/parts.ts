import { type Placement, place } from "../kid/cell.ts";
import { type Part, part } from "../kid/sprite.ts";
import {
  groundBase,
  groundHighlight,
  groundLight,
  groundShadow,
  identityLight,
} from "../legend.ts";

export type Point = readonly [x: number, y: number];

export const crown = glazed("porcelain crown", 13, 14, [
  "........hhhllll",
  ".....hhhhhhFllllll",
  "...hhhhhhhhFlllDDlll",
  "..hhhhhhhhhllDDDDllll",
  ".hhhhhlllllFlDEDDlDDll",
  "hhhFlllllllFFlEFDDElll",
  "hhFllllllllllDDDEEDllcc",
  "hFlllllllllllDEDlDccccc",
  ".llllllccccccDDccccccs",
  "..lllcccccccssssccsss",
  "...cccsssss",
]);

export const leftPlate = glazed("sprigged shoulder plate", 4, 19, [
  ".............hhlll",
  "...........hhhhhhll",
  ".........hhhhhhhhFll",
  "........hhhhhlDlhFlll",
  ".......hhhDDhlDlhllDll",
  "......hhhDDDDhElhhDDEl",
  ".....hhhhllDEDhElDDEll",
  "....hhhhhhhhDDEEEllcl",
  "...hhhlDDDlllhEllllc",
  "..hhllDDDEEllhEllllc",
  "..hlllDDlllEEEEDllc",
  ".hlllFllllllllElllc",
  ".hllFllllllccllElcc",
  "hlllFlllccccccEccs",
  "llccccccssscccccsc",
  "lccss....sssssccs",
  "cs..........ssss",
]);

export const frontPlate = glazed("overlapping flank plate", 18, 21, [
  "...........hhhhll",
  "........hhhhhhlllll",
  "......hhhhhhhFlDDlll",
  ".....hhhhhhhFlDDDDlll",
  "....hhhhhllllFlEDEllDcl",
  "...hhhhhlDlllDDDEFDDDDc",
  "..hhhhhlDDlhDDDEEDDDclcl",
  "..hhhllDDEllllDDEDDllcll",
  ".hhhllllEllDDllDlllFlllc",
  ".hlllDDlElDDEllDllllFllcc",
  "hllhDDDEEDDElllDlllFlllcc",
  "hllDDllEEllDDllDllllFlccc",
  "llDDllEElllDEDlllccclFcccs",
  "lllllEElllllcccccscsclcccs",
  "llllEElllcccsss.....sscccs",
  "lllEcccsss............scss",
  "lcccss..................ss",
  "csss",
]);

export const underside = glazed("earthen breast under the lip", 8, 29, [
  "....gggggggggggggggggggg",
  "..gwwwgggggggggggggggggggg",
  ".ggwwgggggwwwgggggggwwwgggg",
  "ggggggggggwwgggggggggggggggg",
  "gdggggddgggggdddggggggdddgggg",
  "ddgggddddgggdddddgggggddddgg",
  ".ddddddgdggggddddggggdgdddd",
  "..dgdddddggggggddggddddd",
  "....dddddggggddddddddd",
  ".......dddddddddd",
]);

function glazed(name: string, x: number, y: number, rows: readonly string[]): Part {
  const width = Math.max(...rows.map((row) => row.length));
  return part(
    name,
    x,
    y,
    rows.map((row) => row.padEnd(width, ".")),
  );
}

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

export function leg(
  name: string,
  points: readonly [Point, Point, Point],
  near: boolean,
): Placement {
  const [hip, knee, tip] = points;
  const side = knee[0] < 24 ? -1 : 1;
  const ankle: Point = [
    Math.max(3, Math.min(44, tip[0] + side)),
    Math.round((knee[1] + tip[1] * 2) / 3),
  ];
  const joints = [hip, knee, ankle, tip];
  const left = Math.min(...joints.map(([x]) => x)) - 2;
  const top = Math.min(...joints.map(([, y]) => y)) - 2;
  const width = Math.max(...joints.map(([x]) => x)) - left + 3;
  const height = Math.max(...joints.map(([, y]) => y)) - top + 3;
  const pixels = new Uint8Array(width * height);

  function dab(x: number, y: number, ink: number): void {
    pixels[(y - top) * width + x - left] = ink;
  }

  function bone(from: Point, to: Point, thick: number, thin: number, lit: boolean): void {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const steps = Math.max(1, Math.abs(dx), Math.abs(dy));
    for (let step = 0; step <= steps; step++) {
      const share = step / steps;
      const cx = Math.round(from[0] + share * dx);
      const cy = Math.round(from[1] + share * dy);
      const radius = thick * (1 - share) + thin * share;
      for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
          if (x * x + y * y > radius * radius) continue;
          const value = x + y;
          const shade = value < 0 ? groundLight : value === 0 ? groundBase : groundShadow;
          dab(cx + x, cy + y, lit && value < -0.5 ? groundHighlight : shade);
        }
      }
    }
  }

  bone(hip, knee, 2, 1.7, near);
  bone(knee, ankle, 1.5, 0.85, near);
  bone(ankle, tip, 0.85, 0.45, near);
  const [kx, ky] = knee;
  dab(kx, ky - 1, near ? identityLight : groundHighlight);
  dab(kx - 1, ky, near ? groundHighlight : groundLight);
  dab(kx, ky, near ? groundHighlight : groundBase);
  dab(kx, ky + 1, groundShadow);
  dab(kx + side, ky + 1, groundShadow);
  return place({ name, x: left, y: top, sprite: { width, height, pixels } }, { layer: "behind" });
}
