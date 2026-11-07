import type { IndexedBitmap } from "../../pose/skin.ts";
import {
  bitmapFromRows,
  fog,
  identityBase,
  identityLight,
  identityShadow,
  lamplight,
  outline,
  transparent,
  worldGlyphs,
} from "../legend.ts";

export interface Tile extends IndexedBitmap {
  readonly name: string;
}

export const fence: Tile = tile("fence", [
  "oo..........",
  "o#o.........",
  "o#o.........",
  "o#o.........",
  "o#oooooooooo",
  "o#o=========",
  "o#o.........",
  "o#o.........",
  "o#o.........",
  "o#oooooooooo",
  "o#o=========",
  "o#o.........",
  "o#o.........",
  "o#o.........",
]);

export const post: Tile = tile("post", [
  "oo.",
  "o#o",
  "o#o",
  "o#o",
  "o#o",
  "o#o",
  "o#o",
  "o#o",
  "o#o",
  "o#o",
  "o#o",
  "o#o",
  "o#o",
  "o#o",
]);

export const gateOpen: Tile = tile("gate-open", [
  "oo...........oo.",
  "o#o..........o#o",
  "o#o..........o#o",
  "o#oo.........o#o",
  "o#o#o........o#o",
  "o#o#o........o#o",
  "o#o#o........o#o",
  "o#o#o........o#o",
  "o#o#o........o#o",
  "o#o#o........o#o",
  "o#o#o........o#o",
  "o#o#o........o#o",
  "o#oo.........o#o",
  "o#o..........o#o",
]);

export const gateLatched: Tile = tile("gate-latched", [
  "oo...........oo.",
  "o#o..........o#o",
  "o#o..........o#o",
  "o#oooooooooooo#o",
  "o#o=o=o=o=o==o#o",
  "o#o=o=o=o=o==o#o",
  "o#o=o=o=o=o==o#o",
  "o#o=o=o=o=o==o#o",
  "o#o=o=o=o=o==o#o",
  "o#o=o=o=o=o==o#o",
  "o#o=o=o=o=o==o#o",
  "o#o=o=o=o=o==o#o",
  "o#oooooooooooo#o",
  "o#o..........o#o",
]);

export const padlock: Tile = tile("padlock", [".o.", "o.o", "o-o", "ooo"]);

export const lantern: Tile = tile("lantern", [".o.", "o*o", "o*o", ".o."]);

export const signpostDirect: Tile = tile("signpost-direct", [
  "..oo...",
  "..o#o..",
  "..o#ooo",
  "..o#o==",
  "..o#o..",
  "..o#o..",
  "..o#o..",
  "..o#o..",
  "..o#o..",
  "..o#o..",
  "..o#o..",
  "..o#o..",
  "..o#o..",
  "..o#o..",
]);

export const signpostRelay: Tile = tile("signpost-relay", [
  "..oo...",
  "..o#o..",
  "..o#ooo",
  "..o#o==",
  "..o#o..",
  "..o#o..",
  "..o#ooo",
  "..o#o==",
  "..o#o..",
  "..o#o..",
  "..o#o..",
  "..o#o..",
  "..o#o..",
  "..o#o..",
]);

export const house: Tile = tile("house", [
  "........................",
  "..................oo....",
  "..........oo......o#o...",
  ".........o##o.....o#o...",
  "........o####o....o#o...",
  ".......o######o...o#o...",
  "......o########o..o#o...",
  ".....o##########o.o#o...",
  "....o############oo#o...",
  "...o################o...",
  "..oooooooooooooooooooo..",
  "..o==================o..",
  "..o=oooo==oooo==oooo=o..",
  "..o=oDDo==o::o==oDDo=o..",
  "..o=oDDo==o::o==oDDo=o..",
  "..o=oooo==o::o==oooo=o..",
  ".oooooooooo::oooooooooo.",
  ".o#o..o=o.o::o.....o#o..",
  ".o#o..ooo.o::o.....o#o..",
  ".o#o......o::o.....o#o..",
  ".o#o......o::o.....o#o..",
  ".oooooooooooooooooooooo.",
  ".o====================o.",
]);

export const houseWindows: readonly { x: number; y: number; width: number; height: number }[] = [
  { x: 5, y: 13, width: 2, height: 2 },
  { x: 17, y: 13, width: 2, height: 2 },
];

export const houseBell = { x: 7, y: 17 } as const;
export const houseRidge = { x: 10, y: 2 } as const;
export const houseDeck = { x: 14, y: 17 } as const;

export const bellRinging: Tile = tile("bell-ringing", [".@@", "@@@", ".@."]);

export const storehouse: Tile = tile("storehouse", [
  "...........oooo...........",
  ".......oooo####oooo.......",
  "...oooo############oooo...",
  "oooooooooooooooooooooooooo",
  "o:::::o:::::o:::::o:::::#o",
  "o:::::o:::::o:::::o:::::#o",
  "o:::::o:::::o:::::o:::::#o",
  "o:::::o:::::o:::::o:::::#o",
  "o:::::o:::::o:::::o:::::#o",
  "oooooooooooooooooooooooooo",
  "o:::::o:::::o:::::o:::::#o",
  "o:::::o:::::o:::::o:::::#o",
  "o:::::o:::::o:::::o:::::#o",
  "o:::::o:::::o:::::o:::::#o",
  "o:::::o:::::o:::::o:::::#o",
  "oooooooooooooooooooooooooo",
  "o:::::o:::::o:::::o:::::#o",
  "o:::::o:::::o:::::o:::::#o",
  "o:::::o:::::o:::::o:::::#o",
  "o:::::o:::::o:::::o:::::#o",
  "o:::::o:::::o:::::o:::::#o",
  "oooooooooooooooooooooooooo",
]);

export const shelfColumns = 4;
export const shelfRows = 3;

export function shelfCell(index: number): { x: number; y: number } {
  const column = index % shelfColumns;
  const row = Math.floor(index / shelfColumns) % shelfRows;
  return { x: 2 + column * 6, y: 17 - row * 6 };
}

export const shelfCrate: Tile = tile("shelf-crate", ["ooo", "o=o", "ooo"]);

export const deckCrate: Tile = tile("deck-crate", ["ooooo", "o=-=o", "o=-=o", "ooooo"]);

export const workshop: Tile = tile("workshop", [
  "........................",
  "........................",
  "...........oo...........",
  "..........o##o..........",
  ".........o#oo#o.........",
  "........o#oDDo#o........",
  ".......o##oooo##o.......",
  "......o##########o......",
  ".....o############o.....",
  "....o##############o....",
  "...oooooooooooooooooooo.",
  "...o=====oooooo=======o.",
  "...o=ooo=o::::o=oooo==o.",
  "...o=oDo=o::::o=o::o==o.",
  "...o=ooo=o::::o=o::o==o.",
  "...o=====o::::o=oooo==o.",
  "...o=====o::::o=======o.",
  "...o=====o::::o=======o.",
  "...o=====o::::o=======o.",
  "...oooooooooooooooooooo.",
]);

export const workshopLamp = { x: 6, y: 13, width: 1, height: 1 } as const;
export const workshopLoft = { x: 11, y: 5, width: 2, height: 1 } as const;
export const workshopBoard = { x: 17, y: 13 } as const;
export const workshopNotes = { x: 4, y: 16 } as const;
export const workshopDoor = { x: 10, y: 12, width: 4, height: 7 } as const;
export const workshopCrates = { x: 15, y: 17 } as const;

export const chalkLine: Tile = tile("chalk-line", ["--"]);
export const benchNote: Tile = tile("bench-note", ["pp", "pp"]);
export const doorCrate: Tile = tile("door-crate", ["ooo", "o=o", "ooo"]);
export const boards: Tile = tile("boards", ["oooooo", "======"]);
export const plaque: Tile = tile("plaque", ["oooo", "o--o", "oooo"]);

export const millTower: Tile = tile("mill-tower", [
  "....oooo....",
  "...o####o...",
  "..o######o..",
  ".oooooooooo.",
  ".o========o.",
  ".o========o.",
  ".o========o.",
  ".o========o.",
  ".o========o.",
  ".o========o.",
  ".o========o.",
  ".o========o.",
  ".o========o.",
  "o==========o",
  "o==========o",
  "o==========o",
  "o==========o",
  "o==o::::o==o",
  "o==o::::o==o",
  "o==o::::o==o",
  "o==o::::o==o",
  "oooooooooooo",
]);

export const millHub = { x: 5, y: 2 } as const;
export const sailFrames = 4;
export const sailRadius = 8;

export function millSails(frame: number): Tile {
  const size = sailRadius * 2 + 1;
  const indices = new Uint8Array(size * size);
  const center = sailRadius;
  const base = ((frame % sailFrames) / sailFrames) * (Math.PI / 2);
  for (let arm = 0; arm < 4; arm += 1) {
    const angle = base + (arm * Math.PI) / 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const upper = dy < -0.01;
    for (let step = 1; step <= sailRadius; step += 1) {
      const x = Math.round(center + dx * step);
      const y = Math.round(center + dy * step);
      indices[y * size + x] = outline;
      if (upper && step >= 3) {
        const cx = Math.round(center + dx * step + dy);
        const cy = Math.round(center + dy * step - dx);
        if (indices[cy * size + cx] === transparent) indices[cy * size + cx] = identityLight;
      }
    }
  }
  indices[center * size + center] = identityBase;
  return { name: `mill-sails-${frame}`, width: size, height: size, indices };
}

export const spyglass: Tile = tile("spyglass", [
  ".....oo",
  "....o*o",
  "...o##o",
  "..o##o.",
  ".o##o..",
  "oo.oo..",
]);

export const treeStages = 3;

export function tree(stage: number): Tile {
  const grown = Math.min(Math.max(0, stage), treeStages - 1);
  const crown = [2, 4, 7][grown] ?? 7;
  const trunk = [2, 3, 6][grown] ?? 6;
  const size = crown * 2 + 3;
  const height = size + trunk;
  const center = crown + 1;
  const indices = new Uint8Array(size * height);
  const at = (x: number, y: number, index: number): void => {
    if (x >= 0 && y >= 0 && x < size && y < height) indices[y * size + x] = index;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - center) / (crown + 0.5);
      const ny = (y - center) / (crown + 0.5);
      const inside = nx * nx + ny * ny <= 1;
      if (!inside) continue;
      const lit = nx + ny < -0.6;
      const shaded = nx + ny > 0.6;
      at(x, y, lit ? identityLight : shaded ? identityShadow : identityBase);
    }
  }
  const trunkWidth = grown === 0 ? 1 : 2 + grown;
  const trunkLeft = center - Math.floor(trunkWidth / 2);
  for (let y = size - 1; y < height - 1; y += 1) {
    for (let x = trunkLeft; x < trunkLeft + trunkWidth; x += 1) at(x, y, identityShadow);
  }
  return { name: `tree-${grown}`, ...sealedOutline({ width: size, height, indices }) };
}

export const well: Tile = tile("well", [
  "...oooooo...",
  "..o======o..",
  ".o========o.",
  "oooooooooooo",
  ".o#o....o#o.",
  ".o#o....o#o.",
  ".o#o.ow.o#o.",
  ".o#o.ow.o#o.",
  ".o#o.oo.o#o.",
  ".oooooooooo.",
  ".ospspspspo.",
  ".opspspspso.",
  ".ospspspspo.",
  ".oooooooooo.",
]);

export const vaneHeadings = 4;

export function weathervane(heading: number): Tile {
  const size = 7;
  const indices = new Uint8Array(size * size);
  const at = (x: number, y: number, index: number): void => {
    if (x >= 0 && y >= 0 && x < size && y < size) indices[y * size + x] = index;
  };
  for (let y = 2; y < size; y += 1) at(3, y, outline);
  for (let x = 2; x <= 4; x += 1) at(x, size - 1, outline);
  const [dx, dy] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ][heading % vaneHeadings] as [number, number];
  for (let step = 1; step <= 3; step += 1) at(3 + dx * step, 2 + dy * step, 4);
  at(3 - dx, 2 - dy, outline);
  at(3 - 2 * dx, 2 - 2 * dy, outline);
  return { name: `weathervane-${heading % vaneHeadings}`, width: size, height: size, indices };
}

export const lanternPostLit: Tile = tile("lantern-post-lit", [
  ".ooo.",
  "o***o",
  "o***o",
  ".ooo.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
]);

export const lanternPostDark: Tile = tile("lantern-post-dark", [
  ".ooo.",
  "o===o",
  "o===o",
  ".ooo.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
  ".o#o.",
]);

export const hay: Tile = tile("hay", [
  "........p..........p......",
  ".......ppw........ppw.....",
  "...wwwwwwww.....wwwwww....",
  ".wwwwwwwwwwwwwwwwwwwwwww..",
  "wwwwwwwwwwwwwwwwwwwwwwwwww",
]);

export function ghosted(source: Tile): Tile {
  const indices = new Uint8Array(source.indices.length);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const index = source.indices[y * source.width + x] ?? transparent;
      if (index === outline && (x + y) % 4 < 2) indices[y * source.width + x] = fog;
    }
  }
  return { name: `${source.name}-fogged`, width: source.width, height: source.height, indices };
}

export function lit(
  source: Tile,
  region: { x: number; y: number; width: number; height: number },
): Tile {
  const indices = new Uint8Array(source.indices);
  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      indices[y * source.width + x] = lamplight;
    }
  }
  return { name: `${source.name}-lit`, width: source.width, height: source.height, indices };
}

export const worldTiles: readonly Tile[] = [
  fence,
  post,
  gateOpen,
  gateLatched,
  padlock,
  lantern,
  signpostDirect,
  signpostRelay,
  house,
  bellRinging,
  storehouse,
  shelfCrate,
  deckCrate,
  workshop,
  chalkLine,
  benchNote,
  doorCrate,
  boards,
  plaque,
  millTower,
  spyglass,
  well,
  lanternPostLit,
  lanternPostDark,
  hay,
];

function tile(name: string, rows: readonly string[]): Tile {
  try {
    return { name, ...bitmapFromRows(rows, worldGlyphs) };
  } catch (error) {
    throw new Error(`tile ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sealedOutline(bitmap: IndexedBitmap): IndexedBitmap {
  const { width, height } = bitmap;
  const indices = new Uint8Array(bitmap.indices);
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height
      ? transparent
      : (bitmap.indices[y * width + x] ?? 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (at(x, y) !== transparent) continue;
      const touches =
        at(x - 1, y) !== transparent ||
        at(x + 1, y) !== transparent ||
        at(x, y - 1) !== transparent ||
        at(x, y + 1) !== transparent;
      if (touches) indices[y * width + x] = outline;
    }
  }
  return { width, height, indices };
}
