import type { Part, Sprite } from "./model.ts";
import {
  type IndexedTexture,
  paintTexture,
  roleAt,
  textureFromRows,
  textureMemo,
} from "./texture.ts";

export interface FigureArt {
  readonly name: string;
  readonly rows: readonly string[];
  readonly hover: number;
}

export const neutralFigure: FigureArt = {
  name: "neutral",
  hover: 0,
  rows: [
    "...ooooo...",
    "..obbblllo.",
    ".obbbbbbllo",
    ".obbbbbbbbo",
    "obbebbbbebo",
    "obbbbbbbbbo",
    "obbbbbbbbbo",
    "odbbbbbbbdo",
    ".odbbbbbdo.",
    "..odddddo..",
    "..oo...oo..",
  ],
};

export const figureArts: Readonly<Record<string, FigureArt>> = {
  kid: {
    name: "kid",
    hover: 0,
    rows: [
      "o...........o",
      "oo.........oo",
      ".oo.......oo.",
      "..ooooooooo..",
      ".obbbbbbbbbo.",
      "obbbbbbbbbblo",
      "obbebbbbebblo",
      "obbbbllbbbbbo",
      ".obbbllbbbbo.",
      "..ooooooooo..",
      "...okkkkko...",
      "..obkkkkkbo..",
      "..obkkkkkbo..",
      "...okkkkko...",
      "...ob...bo...",
      "...oo...oo...",
    ],
  },
  cairn: {
    name: "cairn",
    hover: 2,
    rows: [
      "....ooooo....",
      "...ollgbbo...",
      "....oobbo....",
      ".....ooo.....",
      "..ooooooooo..",
      ".olllbbbbbbo.",
      ".olboooobbdo.",
      ".obbo...obdo.",
      ".obboooobddo.",
      ".odbbbbbbddo.",
      "..ooooooooo..",
      ".....ooo.....",
      "....obbbo....",
      "....oddo.....",
      ".....oo......",
    ],
  },
  tessera: {
    name: "tessera",
    hover: 0,
    rows: [
      "....ooooooo....",
      "..oollllllboo..",
      ".olllbblbbbbbo.",
      "olllbbbobbbbbbo",
      "olbbhhbobbhhbbo",
      "obbbhhbobbhhbdo",
      "obbbbbbobbbbddo",
      "oodddddddddddoo",
      ".ooeobbbbboeoo.",
      ".o.oo.....oo.o.",
      ".o..o.....o..o.",
    ],
  },
  folio: {
    name: "folio",
    hover: 0,
    rows: [
      ".....o.....",
      "....olo....",
      "...ollho...",
      "..olllhho..",
      ".ollldhhho.",
      ".ollldhhho.",
      "olllbdbhhho",
      "ollbbdbbhho",
      "olbebdbebho",
      "obbbbdbbbbo",
      ".obbbdbbbo.",
      "..obbdbbo..",
      "...oodoo...",
      "....odo....",
      "...oo.oo...",
      "...o...o...",
    ],
  },
  purl: {
    name: "purl",
    hover: 0,
    rows: [
      "...ooooooo...",
      "..obbbblllo..",
      ".obllbbbbllo.",
      "obbbbllbbbblo",
      "obbebbbbbebbo",
      "obbbbbbbbbbbo",
      "odbbllbbllbdo",
      ".oodbbbbbdoo.",
      ".obo.obo.obo.",
      ".obo.obo.obo.",
      ".odo.odo.odo.",
      "..o...o...o..",
    ],
  },
  hush: {
    name: "hush",
    hover: 3,
    rows: [
      "...oooooo...",
      "..obbllbbo..",
      ".obboooolbo.",
      "obboccccoblo",
      "oboccccccobo",
      "oboccacccobo",
      "obocccaccobo",
      "obboccccobbo",
      ".obboooobbo.",
      "..obbbbbbo..",
      "...oooooo...",
    ],
  },
  knot: {
    name: "knot",
    hover: 2,
    rows: [
      "...oooooo...",
      "..obbllllo..",
      ".obboooobbo.",
      ".obo....obo.",
      ".obo....obo.",
      ".obbo..obbo.",
      "..obboobbo..",
      "...obbbbo...",
      "..obboobbo..",
      ".obbo..obbo.",
      "obbo....obbo",
      "ooo......ooo",
    ],
  },
};

export const figureOfSkin: Readonly<Record<string, string>> = {
  kid: "kid",
  cairn: "cairn",
  tessera: "tessera",
  folio: "folio",
  purl: "purl",
  hush: "hush",
  knot: "knot",
};

export type Doing = "work" | "porch" | "walk" | "nap" | "idle" | "blocked" | "sit";

export function figureFor(skin: string | undefined): FigureArt {
  const name = skin === undefined ? undefined : figureOfSkin[skin];
  return (name === undefined ? undefined : figureArts[name]) ?? neutralFigure;
}

export function critterParts(figure: FigureArt, doing: Doing, order: number): Part[] {
  const parts: Part[] = [{ sprite: body(figure, doing, order) }];
  if (doing === "porch" || doing === "blocked") parts.push({ sprite: glyph(figure, doing, order) });
  if (doing === "work") parts.push({ sprite: spark(figure, order) });
  return parts;
}

export function bobAt(doing: Doing, order: number, tick: number): number {
  if (doing === "nap" || doing === "sit" || tick === 0) return 0;
  return Math.floor((tick + order * 3) / 4) % 2;
}

const figureLegend: Readonly<Record<string, string>> = {
  o: "ink",
  e: "ink",
  d: "hue.d",
  b: "hue.b",
  l: "hue.l",
  h: "hue.h",
  k: "wood",
  c: "slateDk",
  a: "lamp",
  g: "leafHi",
};

const memo = textureMemo(512);
const cycle = 8;

function artOf(figure: FigureArt): IndexedTexture {
  return memo(`figure|${figure.name}`, () => textureFromRows(figure.rows, figureLegend));
}

interface Frame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function body(figure: FigureArt, doing: Doing, order: number): Sprite {
  const art = artOf(figure);
  const hover = figure.hover;
  const left = Math.min(-(art.width >> 1), -3);
  const right = Math.max(
    art.width - (art.width >> 1),
    3,
    doing === "walk" ? (art.width >> 1) + 4 : 0,
    doing === "nap" ? 9 : 0,
  );
  const top = -art.height - hover - 1 - (doing === "nap" ? 8 : 0);
  const frame: Frame = { left, top, width: right - left, height: -top };
  const frames = [0, 1].map((bob) =>
    memo(`body|${figure.name}|${doing}|${bob}`, () => paintBody(figure, art, doing, bob, frame)),
  );
  const still = doing === "nap" || doing === "sit";
  return {
    x: 0,
    y: 0,
    z: 0,
    frames: still ? [frames[0] as IndexedTexture] : frames,
    left,
    top,
    sequence: still
      ? []
      : Array.from({ length: cycle }, (_, tick) => bobAt(doing, order, tick + cycle)),
    phase: 0,
    rest: still ? undefined : 0,
  };
}

function paintBody(
  figure: FigureArt,
  art: IndexedTexture,
  doing: Doing,
  bob: number,
  frame: Frame,
): IndexedTexture {
  const hover = figure.hover;
  const ox = -(art.width >> 1);
  const oy = -art.height - hover - bob;
  return paintTexture(frame.width, frame.height, (brush) => {
    const put = (x: number, y: number, w: number, h: number, role: string): void =>
      brush.rect(x - frame.left, y - frame.top, w, h, role);
    if (hover > 0) put(-3, -1, 6, 1, "grassLo");
    for (let y = 0; y < art.height; y += 1) {
      for (let x = 0; x < art.width; x += 1) {
        const role = roleAt(art, x, y);
        if (role !== undefined) put(ox + x, oy + y, 1, 1, role);
      }
    }
    if (doing === "nap") {
      put(3, oy - 4, 3, 1, "chalk");
      put(4, oy - 3, 1, 1, "chalk");
      put(3, oy - 2, 3, 1, "chalk");
      put(7, oy - 8, 2, 1, "chalk");
      put(7, oy - 7, 2, 1, "chalk");
    }
    if (doing === "walk") {
      const cx = (art.width >> 1) - 1;
      put(cx, -6 - hover - bob, 5, 5, "wood");
      put(cx, -6 - hover - bob, 5, 1, "woodHi");
      put(cx, -2 - hover - bob, 5, 1, "woodDk");
    }
  });
}

function glyph(figure: FigureArt, doing: "porch" | "blocked", order: number): Sprite {
  const art = artOf(figure);
  const base = -art.height - figure.hover - 7;
  const top = base - 2;
  const frames = [0, 1, 2].map((lift) =>
    memo(`glyph|${doing}|${figure.name}|${lift}`, () =>
      paintTexture(5, 7, (brush) => {
        const put = (x: number, y: number, role: string): void =>
          brush.rect(x + 2, y + base - lift - top, 1, 1, role);
        const marks =
          doing === "porch"
            ? [
                [0, 0],
                [-1, 1],
                [0, 1],
                [1, 1],
                [-2, 2],
                [-1, 2],
                [0, 2],
                [1, 2],
                [2, 2],
                [-1, 3],
                [0, 3],
                [1, 3],
                [0, 4],
              ]
            : [
                [-2, 0],
                [2, 0],
                [-1, 1],
                [1, 1],
                [0, 2],
                [-1, 3],
                [1, 3],
                [-2, 4],
                [2, 4],
              ];
        for (const [x = 0, y = 0] of marks) put(x, y, doing === "porch" ? "accent" : "err");
      }),
    ),
  );
  const liftAt = (tick: number): number =>
    bobAt("work", order, tick) + (Math.floor((tick + order) / 4) % 2);
  return {
    x: 0,
    y: 0,
    z: 0,
    frames,
    left: -2,
    top,
    sequence: Array.from({ length: cycle }, (_, tick) => liftAt(tick + cycle)),
    phase: 0,
    rest: Math.floor(order / 4) % 2,
  };
}

function spark(figure: FigureArt, order: number): Sprite {
  const art = artOf(figure);
  const ox = -(art.width >> 1);
  const frames = [false, true].map((on) =>
    memo(`spark|${figure.name}|${on}`, () =>
      paintTexture(4, 4, (brush) => {
        if (!on) return;
        brush.rect(2, 2, 2, 2, "lampHi");
        brush.rect(0, 0, 1, 1, "lamp");
      }),
    ),
  );
  return {
    x: 0,
    y: 0,
    z: 0,
    frames,
    left: ox - 5,
    top: -8,
    sequence: Array.from({ length: 6 }, (_, tick) => ((tick + order * 2) % 6 < 2 ? 1 : 0)),
    phase: 0,
    rest: 0,
  };
}
