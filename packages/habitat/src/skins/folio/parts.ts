import { type Part, part } from "../kid/sprite.ts";

export const foldedSheet = cut("creased paper", 2, 44, [
  "........p",
  "......pppw",
  "....ppFpww",
  "..ppwEwpwww",
  "pppEFgggwwwg",
  ".gggggggggg",
]);

export const proof = cut("flat proof", 2, 47, ["......wwpp", "..wwEEpppgg", "ppwwFgggg"]);
export const seal = cut("brass stamp", 4, 40, ["..**", "..*g", "...g", ".wwwg", "wwppgg"]);
export const slip = cut("sealed letter", 3, 30, [
  ".ppppppp",
  "FEpppppEF",
  "ppEEppEFp",
  "wppFDDppw",
  "wwpppppwg",
  ".ggggggg",
]);
export const page = cut("opened sheet", 2, 39, [
  ".....p...",
  ".....pp..p",
  ".....pwp.pw",
  "....pwpppww",
  "...pwFEppwg",
  "..pwwwwwpwg",
  ".ppEwEwwpgg",
  "ppwwwwwwggg",
  ".wwwggggggg",
]);
export const bell = cut("folding bell", 3, 34, [
  "...p",
  "...*",
  "..***",
  ".**ww*",
  ".**ww*",
  "**wwww*",
  "...g",
]);
export const bellStand = cut("folding bell stand", 2, 31, [
  ".wwppp",
  ".gwwwp",
  ".gw..g",
  ".gw",
  ".gw",
  ".gw",
  ".gw",
  ".gw",
  ".gw",
  ".gw",
  ".gw",
  ".gw",
  ".gw",
  ".gw",
  ".gw",
  ".gw",
  ".pwg",
  ".pwwg",
  "wwgggg",
]);
export const splint = cut("creased corner", 25, 27, ["...p", "..pp", ".pp!", "pp!!"]);
export const uprightSheet = cut("standing fold", 2, 36, [
  ".....p",
  ".....pw",
  "....ppw",
  "....pwwg",
  "...pwwwg",
  "...pwwwwg",
  "...pwggwg",
  "..pwEwpwwg",
  "..pEwwpwwg",
  ".pwwwppwwwg",
  ".pwwpppwwwg",
  "pwwwppppwwgg",
  "pwwpppppwwgg",
  "gggggggggggg",
]);

export function cut(name: string, x: number, y: number, rows: readonly string[]): Part {
  const width = Math.max(...rows.map((row) => row.length));
  return part(
    name,
    x,
    y,
    rows.map((row) => row.padEnd(width, ".")),
  );
}
