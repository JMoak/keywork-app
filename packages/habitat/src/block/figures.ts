import { facesAway, facesLeft, facesRight } from "./facing.ts";
import {
  aspects,
  type FigureArt,
  type FigureName,
  figureArt,
  figureNames,
  front,
} from "./figure-art.ts";
import { figureTurns } from "./figure-turns.ts";
import type { Part, Sprite } from "./model.ts";
import type { ToolTier } from "./scene.ts";
import { mannerOf, type Temperament } from "./temperament.ts";
import {
  type IndexedTexture,
  mirrored,
  paintTexture,
  roleAt,
  textureFromRows,
  textureMemo,
} from "./texture.ts";
import { toolArts, toolHeight, toolLegend, toolWidth } from "./tools.ts";

export { type FigureArt, type FigureName, figureNames };

export type Doing = "work" | "porch" | "walk" | "nap" | "idle" | "blocked" | "sit";

export interface Bearing {
  readonly tool?: ToolTier | undefined;
  readonly medal?: boolean | undefined;
  readonly temperament?: Temperament | undefined;
}

export interface Bearings {
  readonly tools?: Readonly<Record<string, ToolTier>> | undefined;
  readonly medals?: Readonly<Record<string, boolean>> | undefined;
  readonly temperaments?: Readonly<Record<string, Temperament>> | undefined;
}

export interface Critter {
  readonly figure: FigureArt;
  readonly doing: Doing;
  readonly order: number;
  readonly tool: ToolTier;
  readonly medal: boolean;
  readonly temperament: Temperament | undefined;
}

export const figureArts = Object.fromEntries(
  figureNames.map((name) => [name, figureArt(name, figureTurns[name] ?? [])]),
) as Readonly<Record<FigureName, FigureArt>>;

export function figureFor(skin: string | undefined, seed = 0): FigureArt {
  const own = skin === undefined ? undefined : ownEntry(figureArts, skin);
  return own ?? figureArts[figureNames[(seed >>> 0) % figureNames.length] ?? "cairn"];
}

export function bearingOf(held: Bearings, slug: string): Bearing {
  return {
    tool: held.tools?.[slug],
    medal: held.medals?.[slug],
    temperament: held.temperaments?.[slug],
  };
}

export function critterParts(
  figure: FigureArt,
  doing: Doing,
  order: number,
  bearing: Bearing = {},
): Part[] {
  const critter: Critter = {
    figure,
    doing,
    order,
    tool: bearing.tool ?? 0,
    medal: bearing.medal === true,
    temperament: bearing.temperament,
  };
  return partsSeen({ critter, seen: new Map() }, front);
}

export function seenFrom(parts: readonly Part[], aspect: number): readonly Part[] {
  const drawn = drawings.get(parts);
  return drawn === undefined ? parts : partsSeen(drawn, aspect);
}

export function critterOf(parts: readonly Part[]): Critter | undefined {
  return drawings.get(parts)?.critter;
}

export function bobAt(doing: Doing, order: number, tick: number): number {
  if (doing === "nap" || doing === "sit" || tick === 0) return 0;
  return Math.floor((tick + phaseOf(order)) / breathOf(order)) % 2;
}

export function breathOf(order: number): number {
  return slowestBreath - (Math.abs(Math.floor(order)) % breaths);
}

export function phaseOf(order: number): number {
  return Math.floor(order / breaths) * 7 + order * 2;
}

export function sparkEvery(order: number): number {
  return quickestSpark + (Math.abs(Math.floor(order)) % sparks);
}

export const slowestBreath = 6;
export const breaths = 3;
export const quickestSpark = 6;
export const sparks = 4;
export const chestShare = 0.5;
export const crateSize = 5;
export const handsBelow = 10;
export const heldOver = 2;

interface Drawing {
  readonly critter: Critter;
  readonly seen: Map<number, Part[]>;
}

const drawings = new WeakMap<readonly Part[], Drawing>();

function partsSeen(drawing: Drawing, aspect: number): Part[] {
  const known = drawing.seen.get(aspect);
  if (known !== undefined) return known;
  const { critter } = drawing;
  const parts: Part[] = [{ sprite: body(critter, aspect) }];
  if (critter.doing === "porch" || critter.doing === "blocked") {
    parts.push({ sprite: glyph(critter.figure, critter.doing, critter.order, aspect) });
  }
  if (critter.doing === "work") {
    parts.push({ sprite: tool(critter, aspect) }, { sprite: spark(critter, aspect) });
  }
  drawing.seen.set(aspect, parts);
  drawings.set(parts, drawing);
  return parts;
}

const figureLegend: Readonly<Record<string, string>> = {
  o: "ink",
  e: "ink",
  d: "hue.d",
  m: "hue.m",
  b: "hue.b",
  l: "hue.l",
  h: "hue.h",
  w: "paper",
  k: "wood",
  c: "slateDk",
  a: "lamp",
  g: "leafHi",
};

const memo = textureMemo(2048);

function artOf(figure: FigureArt, aspect: number): IndexedTexture {
  const rows = figure.turns[aspect % aspects.length] ?? figure.rows;
  return memo(`figure|${figure.name}|${aspect}`, () => textureFromRows(rows, figureLegend));
}

interface Frame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function body(critter: Critter, aspect: number): Sprite {
  const { figure, doing, medal } = critter;
  const art = artOf(figure, aspect);
  const frame = frameAround(figure, art, doing, aspect);
  const frames = [0, 1].map((bob) =>
    memo(`body|${figure.name}|${aspect}|${doing}|${bob}|${medal}`, () =>
      paintBody(figure, art, doing, bob, frame, aspect, medal),
    ),
  );
  const still = doing === "nap" || doing === "sit";
  return {
    x: 0,
    y: 0,
    z: 0,
    frames: still ? [frames[0] as IndexedTexture] : frames,
    left: frame.left,
    top: frame.top,
    ...(still ? { sequence: [], phase: 0 } : breathing(critter)),
    rest: still ? undefined : 0,
  };
}

function breathing({ doing, order, temperament }: Critter): Pick<Sprite, "sequence" | "phase"> {
  const own = mannerOf(temperament).breath;
  if (own !== undefined) return { sequence: own(breathOf(order)), phase: phaseOf(order) };
  return {
    sequence: Array.from({ length: cycleOf(order) }, (_, tick) =>
      bobAt(doing, order, tick + cycleOf(order)),
    ),
    phase: 0,
  };
}

function frameAround(figure: FigureArt, art: IndexedTexture, doing: Doing, aspect: number): Frame {
  const half = art.width >> 1;
  const crate = doing === "walk" ? crateLeft(art, aspect) : 0;
  const left = Math.min(-half, -3, crate);
  const right = Math.max(
    art.width - half,
    3,
    doing === "walk" ? crate + crateSize : 0,
    doing === "nap" ? 9 : 0,
  );
  const top = -art.height - figure.hover - 1 - (doing === "nap" ? 8 : 0);
  return { left, top, width: right - left, height: -top };
}

function paintBody(
  figure: FigureArt,
  art: IndexedTexture,
  doing: Doing,
  bob: number,
  frame: Frame,
  aspect: number,
  medal: boolean,
): IndexedTexture {
  const hover = figure.hover;
  const ox = -(art.width >> 1);
  const oy = -art.height - hover - bob;
  return paintTexture(frame.width, frame.height, (brush) => {
    const put = (x: number, y: number, w: number, h: number, role: string): void =>
      brush.rect(x - frame.left, y - frame.top, w, h, role);
    const crate = (): void => {
      const cx = crateLeft(art, aspect);
      const cy = -crateSize - 1 - hover - bob;
      put(cx, cy, crateSize, crateSize, "wood");
      put(cx, cy, crateSize, 1, "woodHi");
      put(cx, cy + crateSize - 1, crateSize, 1, "woodDk");
    };
    if (hover > 0) put(-3, -1, 6, 1, "grassLo");
    if (doing === "walk" && facesAway(aspect)) crate();
    for (let y = 0; y < art.height; y += 1) {
      for (let x = 0; x < art.width; x += 1) {
        const role = roleAt(art, x, y);
        if (role !== undefined) put(ox + x, oy + y, 1, 1, role);
      }
    }
    const chest = medal ? chestOf(art, aspect) : undefined;
    if (chest !== undefined) {
      put(ox + chest.column, oy + chest.row - 1, 1, 1, "err");
      put(ox + chest.column, oy + chest.row, 2, 2, "gold");
      put(ox + chest.column, oy + chest.row, 1, 1, "goldHi");
      put(ox + chest.column + 1, oy + chest.row + 1, 1, 1, "goldDk");
    }
    if (doing === "nap") {
      put(3, oy - 4, 3, 1, "chalk");
      put(4, oy - 3, 1, 1, "chalk");
      put(3, oy - 2, 3, 1, "chalk");
      put(7, oy - 8, 2, 1, "chalk");
      put(7, oy - 7, 2, 1, "chalk");
    }
    if (doing === "walk" && !facesAway(aspect)) crate();
  });
}

function crateLeft(art: IndexedTexture, aspect: number): number {
  if (aspect === front) return -(crateSize >> 1);
  const held = handsOf(art);
  return facesLeft(aspect) ? held.left - crateSize + heldOver : held.right - heldOver;
}

interface Hands {
  readonly left: number;
  readonly right: number;
}

function handsOf(art: IndexedTexture): Hands {
  const columns: number[] = [];
  for (let row = Math.max(0, art.height - handsBelow); row < art.height; row += 1) {
    for (let column = 0; column < art.width; column += 1) {
      if (roleAt(art, column, row) !== undefined) columns.push(column);
    }
  }
  const half = art.width >> 1;
  return { left: Math.min(...columns) - half, right: Math.max(...columns) + 1 - half };
}

interface Chest {
  readonly column: number;
  readonly row: number;
}

function chestOf(art: IndexedTexture, aspect: number): Chest | undefined {
  if (facesAway(aspect)) return undefined;
  const lean = facesLeft(aspect) ? -1 : facesRight(aspect) ? 1 : 0;
  const reach = aspect % 2 === 0 ? 1 : 0.5;
  const middle = (art.width >> 1) - 1;
  const chestRow = Math.round(art.height * chestShare);
  const rows = Array.from({ length: art.height }, (_, row) => row).sort(
    (a, b) => Math.abs(a - chestRow) - Math.abs(b - chestRow),
  );
  for (const row of rows) {
    const columns = Array.from({ length: art.width }, (_, column) => column).filter((column) =>
      fleshAt(art, column, row),
    );
    const edge = lean < 0 ? columns[0] : columns[columns.length - 1];
    if (edge === undefined) continue;
    const wanted = Math.round(middle + (edge - middle) * Math.abs(lean) * reach);
    const nearest = columns.reduce((best, column) =>
      Math.abs(column - wanted) < Math.abs(best - wanted) ? column : best,
    );
    return { column: nearest, row };
  }
  return undefined;
}

function fleshAt(art: IndexedTexture, column: number, row: number): boolean {
  return [
    [0, -1],
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].every(([dx = 0, dy = 0]) => {
    const role = roleAt(art, column + dx, row + dy);
    return role !== undefined && role !== "ink";
  });
}

function glyph(
  figure: FigureArt,
  doing: "porch" | "blocked",
  order: number,
  aspect: number,
): Sprite {
  const art = artOf(figure, aspect);
  const base = -art.height - figure.hover - 7;
  const top = base - 2;
  const frames = [0, 1, 2].map((lift) =>
    memo(`glyph|${doing}|${lift}`, () =>
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
    bobAt("work", order, tick) + (Math.floor((tick + order) / breathOf(order)) % 2);
  return {
    x: 0,
    y: 0,
    z: 0,
    frames,
    left: -2,
    top,
    sequence: Array.from({ length: cycleOf(order) }, (_, tick) => liftAt(tick + cycleOf(order))),
    phase: 0,
    rest: Math.floor(order / breathOf(order)) % 2,
  };
}

function tool({ figure, order, tool: tier }: Critter, aspect: number): Sprite {
  const side = workSide(aspect);
  const art = toolArts[figure.name as FigureName] ?? toolArts.folio;
  const frames = ([art.raised, art.struck] as const).map((rows, swing) =>
    memo(`tool|${figure.name}|${tier}|${side}|${swing}`, () => {
      const drawn = textureFromRows(rows, toolLegend(tier));
      return side < 0 ? drawn : mirrored(drawn);
    }),
  );
  return {
    x: 0,
    y: 0,
    z: 0,
    frames,
    left: toolLeft(figure, aspect),
    top: -toolHeight - 2 - figure.hover,
    sequence: striking(order),
    phase: 0,
    rest: 0,
  };
}

function spark({ figure, order }: Critter, aspect: number): Sprite {
  const side = workSide(aspect);
  const frames = [false, true].map((on) =>
    memo(`spark|${side}|${on}`, () => {
      const lit = paintTexture(4, 4, (brush) => {
        if (!on) return;
        brush.rect(2, 2, 2, 2, "lampHi");
        brush.rect(0, 0, 1, 1, "lamp");
      });
      return side < 0 ? lit : mirrored(lit);
    }),
  );
  return {
    x: 0,
    y: 0,
    z: 0,
    frames,
    left: toolLeft(figure, aspect) + (side < 0 ? -4 : toolWidth),
    top: -6 - figure.hover,
    sequence: striking(order),
    phase: 0,
    rest: 0,
  };
}

function workSide(aspect: number): number {
  return facesRight(aspect) || aspect === backOn ? 1 : -1;
}

function toolLeft(figure: FigureArt, aspect: number): number {
  const held = handsOf(artOf(figure, aspect));
  return workSide(aspect) < 0 ? held.left - toolWidth + heldOver : held.right - heldOver;
}

function striking(order: number): number[] {
  return Array.from({ length: sparkEvery(order) }, (_, tick) =>
    (tick + order * 5) % sparkEvery(order) < 2 ? 1 : 0,
  );
}

const backOn = aspects.indexOf("back");

function cycleOf(order: number): number {
  return 2 * breathOf(order);
}

function ownEntry<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
