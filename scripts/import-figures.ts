import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  type Aspect,
  aspects,
  type FigureName,
  figureNames,
} from "../packages/habitat/src/block/figure-art.ts";
import type { Sheet, SheetEntry } from "./import-skins.ts";
import { repoRoot } from "./lib/repo-files.ts";

export const figureTurnsFile = join(repoRoot, "packages/habitat/src/block/figure-turns.ts");
export const turnsSheet = "turns.json";
export const worldHeights: Readonly<Record<FigureName, number>> = {
  cairn: 18,
  tessera: 20,
  folio: 24,
  purl: 25,
  hush: 26,
  knot: 26,
  beaver: 22,
  newfie: 22,
  hippo: 18,
};
export const leastCover = 0.45;
export const inkShare = 0.33;
export const paperShare = 0.3;
export const largestSpeck = 3;
export const largestFloater = 10;
export const largestEye = 8;
export const eyeMargin = 2;

export type Drawn = Readonly<
  Partial<Record<string, Readonly<Partial<Record<Aspect, readonly string[]>>>>>
>;

export type WorldTurns = Record<FigureName, string[][]>;

export async function importFigures(directory: string, drawnFile?: string): Promise<WorldTurns> {
  const sheet = JSON.parse(await readFile(join(directory, turnsSheet), "utf8")) as Sheet;
  const drawn =
    drawnFile === undefined ? {} : (JSON.parse(await readFile(drawnFile, "utf8")) as Drawn);
  const turns = Object.fromEntries(
    figureNames.map((name) => {
      const entry = sheet[name];
      if (entry === undefined) throw new Error(`the sheet has no ${name}`);
      return [name, worldTurns(name, entry, drawn)];
    }),
  ) as WorldTurns;
  await writeFile(figureTurnsFile, turnsModule(turns));
  execFileSync(process.execPath, ["x", "biome", "format", "--write", figureTurnsFile], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  return turns;
}

export function worldTurns(name: FigureName, entry: SheetEntry, drawn: Drawn = {}): string[][] {
  if (entry.frames.length !== aspects.length) {
    throw new Error(`${name} turns through ${entry.frames.length} frames, not ${aspects.length}`);
  }
  const { top, floor } = standingBetween(entry.frames);
  const scale = worldHeights[name] / (floor - top + 1);
  return aspects.map((aspect, at) => {
    const own = drawn[name]?.[aspect];
    return own === undefined
      ? reducedTurn(entry.frames[at] ?? [], entry.fixed, scale, floor)
      : [...own];
  });
}

export function reducedTurn(
  rows: readonly string[],
  fixed: Readonly<Record<string, string>>,
  scale: number,
  floor: number,
): string[] {
  const source = rows.map((row) => [...row].map((glyph) => roleOf(glyph, fixed)));
  const frame = frameFor(source, scale, floor);
  const small = outlined(sampled(source, frame));
  for (const mark of [...floatersIn(source), ...eyesIn(source)]) {
    const [x, y] = targetOf(frame, mark.x, mark.y);
    const line = small[y];
    if (line === undefined || x < 0 || x >= frame.width) continue;
    if (mark.role === paper && line[x] === clear) continue;
    line[x] = mark.role;
  }
  return aboutItsAxis(small, frame.width / 2);
}

export function turnsModule(turns: WorldTurns): string {
  const figures = figureNames
    .map((name) => {
      const views = turns[name]
        .map((rows, at) => `    // ${aspects[at]}\n    ${JSON.stringify(rows)},`)
        .join("\n");
      return `  ${name}: [\n${views}\n  ],`;
    })
    .join("\n");
  return [
    "// Written by scripts/import-figures.ts from the Stead World sheet's turns; change the art and run it again.",
    "// Each figure is drawn from eight directions in the order of `aspects`, and turns about its middle column.",
    "export const figureTurns: Readonly<Record<string, readonly (readonly string[])[]>> = {",
    figures,
    "};",
    "",
  ].join("\n");
}

type Role = string;

interface Frame {
  readonly axis: number;
  readonly scale: number;
  readonly floor: number;
  readonly width: number;
  readonly height: number;
}

interface Mark {
  readonly x: number;
  readonly y: number;
  readonly role: Role;
}

const clear = ".";
const ink = "o";
const paper = "w";
const tones = "dmblh";

function standingBetween(frames: readonly (readonly string[])[]): { top: number; floor: number } {
  const drawnRows = frames.flatMap((rows) =>
    rows.flatMap((row, y) => (/[^.]/.test(row) ? [y] : [])),
  );
  return { top: Math.min(...drawnRows), floor: Math.max(...drawnRows) };
}

function roleOf(glyph: string, fixed: Readonly<Record<string, string>>): Role {
  if (glyph === clear || glyph === ink || glyph === paper || tones.includes(glyph)) return glyph;
  const hex = fixed[glyph];
  if (hex === undefined) return "m";
  const channels = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  const lightness = (Math.max(...channels) + Math.min(...channels)) / 2;
  return lightness > 0.6 ? paper : lightness < 0.3 ? ink : "m";
}

function frameFor(source: readonly (readonly Role[])[], scale: number, floor: number): Frame {
  const columns = source.flatMap((row) => row.flatMap((role, x) => (role === clear ? [] : [x])));
  const wide = Math.max(0, ...source.map((row) => row.length));
  return {
    axis: columns.reduce((sum, x) => sum + x, 0) / Math.max(1, columns.length) + 0.5,
    scale,
    floor,
    width: Math.ceil(wide * scale) + 2,
    height: Math.ceil((floor + 1) * scale) + 1,
  };
}

function targetOf(frame: Frame, x: number, y: number): [number, number] {
  return [
    Math.floor((x + 0.5 - frame.axis) * frame.scale + frame.width / 2),
    Math.floor(frame.height - 1 - (frame.floor + 1 - (y + 0.5)) * frame.scale + 1e-9),
  ];
}

function sampled(source: readonly (readonly Role[])[], frame: Frame): Role[][] {
  const step = 1 / frame.scale;
  return Array.from({ length: frame.height }, (_, ty) =>
    Array.from({ length: frame.width }, (_, tx) => {
      const left = frame.axis + (tx - frame.width / 2) * step;
      const bottom = frame.floor + 1 - (frame.height - 1 - ty) * step;
      return roleUnder(weighed(source, left, bottom - step, step), step * step);
    }),
  );
}

function weighed(
  source: readonly (readonly Role[])[],
  left: number,
  top: number,
  step: number,
): Map<Role, number> {
  const held = new Map<Role, number>();
  for (let y = Math.floor(top); y < Math.ceil(top + step); y += 1) {
    const tall = Math.min(top + step, y + 1) - Math.max(top, y);
    for (let x = Math.floor(left); x < Math.ceil(left + step); x += 1) {
      const role = source[y]?.[x] ?? clear;
      if (role === clear) continue;
      const wide = Math.min(left + step, x + 1) - Math.max(left, x);
      held.set(role, (held.get(role) ?? 0) + wide * tall);
    }
  }
  return held;
}

function roleUnder(held: ReadonlyMap<Role, number>, area: number): Role {
  const all = [...held.values()].reduce((sum, weight) => sum + weight, 0);
  if (all / area < leastCover) return clear;
  const inked = (held.get(ink) ?? 0) / all;
  const papered = (held.get(paper) ?? 0) / all;
  let toned = 0;
  let lightness = 0;
  for (const [at, tone] of [...tones].entries()) {
    const weight = held.get(tone) ?? 0;
    toned += weight;
    lightness += weight * at;
  }
  if (papered >= paperShare && papered >= inked) return paper;
  if (toned <= 0) return papered > inked ? paper : ink;
  if (inked >= inkShare) return ink;
  return tones[Math.round(lightness / toned)] ?? "b";
}

function outlined(grid: readonly (readonly Role[])[]): Role[][] {
  const at = (x: number, y: number): Role => grid[y]?.[x] ?? clear;
  const pieces = piecesOf(grid, (role) => role !== clear);
  const speck = new Set(
    pieces
      .filter((piece) => piece.length <= largestSpeck)
      .flatMap((piece) => piece.map(([x, y]) => `${x},${y}`)),
  );
  return grid.map((line, y) =>
    line.map((role, x) => {
      if (role === clear) return role;
      if (speck.has(`${x},${y}`)) return role === ink ? clear : role;
      const edge = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].includes(clear);
      return edge ? ink : role;
    }),
  );
}

function floatersIn(source: readonly (readonly Role[])[]): Mark[] {
  return piecesOf(source, (role) => role !== clear).flatMap((piece) => {
    const filled = piece.filter(([x, y]) => source[y]?.[x] !== ink);
    const [first] = filled;
    if (piece.length > largestFloater || first === undefined) return [];
    return [{ ...middleOf(filled), role: source[first[1]]?.[first[0]] ?? "b" }];
  });
}

function eyesIn(source: readonly (readonly Role[])[]): Mark[] {
  const at = (x: number, y: number): Role => source[y]?.[x] ?? clear;
  const nearTheEdge = ([x, y]: readonly [number, number]): boolean => {
    for (let reach = 1; reach <= eyeMargin; reach += 1) {
      const around = [at(x + reach, y), at(x - reach, y), at(x, y + reach), at(x, y - reach)];
      if (around.includes(clear)) return true;
    }
    return false;
  };
  return piecesOf(source, (role) => role === paper)
    .filter((piece) => piece.length <= largestEye && !piece.some(nearTheEdge))
    .map((piece) => ({ ...middleOf(piece), role: paper }));
}

function middleOf(piece: readonly (readonly [number, number])[]): { x: number; y: number } {
  return {
    x: piece.reduce((sum, [x]) => sum + x, 0) / piece.length,
    y: piece.reduce((sum, [, y]) => sum + y, 0) / piece.length,
  };
}

function piecesOf(
  grid: readonly (readonly Role[])[],
  wanted: (role: Role) => boolean,
): [number, number][][] {
  const seen = new Set<string>();
  const pieces: [number, number][][] = [];
  grid.forEach((line, y) => {
    line.forEach((role, x) => {
      if (!wanted(role) || seen.has(`${x},${y}`)) return;
      const piece: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      seen.add(`${x},${y}`);
      while (stack.length > 0) {
        const next = stack.pop();
        if (next === undefined) break;
        piece.push(next);
        const [cx, cy] = next;
        for (let ny = cy - 1; ny <= cy + 1; ny += 1) {
          for (let nx = cx - 1; nx <= cx + 1; nx += 1) {
            const beside = grid[ny]?.[nx];
            if (beside === undefined || !wanted(beside) || seen.has(`${nx},${ny}`)) continue;
            seen.add(`${nx},${ny}`);
            stack.push([nx, ny]);
          }
        }
      }
      pieces.push(piece);
    });
  });
  return pieces;
}

function aboutItsAxis(grid: readonly (readonly Role[])[], axis: number): string[] {
  const held = grid.map((line) => line.some((role) => role !== clear));
  const drawn = grid.slice(held.indexOf(true), held.lastIndexOf(true) + 1);
  const columns = drawn.flatMap((line) => line.flatMap((role, x) => (role === clear ? [] : [x])));
  const middle = Math.round(axis - 0.5);
  const reach = Math.max(middle - Math.min(...columns), Math.max(...columns) - middle);
  return drawn.map((line) =>
    Array.from({ length: reach * 2 + 1 }, (_, at) => line[middle - reach + at] ?? clear).join(""),
  );
}

if (import.meta.main) {
  const { positionals } = parseArgs({ allowPositionals: true });
  const [directory, drawnFile] = positionals;
  if (directory === undefined) {
    console.error(
      "usage: bun scripts/import-figures.ts <folder holding turns.json> [drawings.json]\n" +
        '  drawings.json holds world-size drawings to use as they are: { "beaver": { "front": ["..o..", …] } }',
    );
    process.exit(2);
  }
  const turns = await importFigures(directory, drawnFile);
  for (const name of figureNames) {
    const sizes = turns[name].map((rows) => `${rows[0]?.length ?? 0}x${rows.length}`);
    console.log(`${name}: ${sizes.join(" ")}`);
  }
  console.log(`${aspects.length} directions each, written to ${figureTurnsFile}`);
}
