import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  type ArtFrame,
  type CreatureId,
  creatureIds,
  fixedGlyphs,
  rowBreak,
} from "../packages/habitat/src/skins/art.ts";
import { posesInASheet, turnsInASheet } from "../packages/habitat/src/skins/clips.ts";
import { repoRoot } from "./lib/repo-files.ts";

export const skinsDirectory = join(repoRoot, "packages/habitat/src/skins");
export const sheetFiles = ["poses.json", "poses-b.json", "turns.json"] as const;
export const facingLeftAtRest: ReadonlySet<CreatureId> = new Set(["folio", "purl"]);
export const walkingFrames: readonly number[] = [4, 5, 6, 7];
export const carryingFrames: readonly number[] = [4, 5, 6, 7];
export const weakestOverlap = 0.45;
export const largestCrack = 6;
export const largestSpeck = 14;
export const deepestSpeck = 3;

export interface SheetEntry {
  readonly w: number;
  readonly h: number;
  readonly fixed: Readonly<Record<string, string>>;
  readonly frames: readonly (readonly string[])[];
}

export type Sheet = Readonly<Record<string, SheetEntry>>;

export interface ImportedArt {
  readonly id: CreatureId;
  readonly cell: { readonly width: number; readonly height: number };
  readonly groundLine: number;
  readonly fixed: readonly number[];
  readonly frames: readonly ArtFrame[];
  readonly placements: readonly Placement[];
}

export interface Placement {
  readonly frame: string;
  readonly shift: number;
  readonly overlap: number;
  readonly by: "overlap" | "sheet" | "centre" | "root" | "turns";
}

export async function readSheets(directory: string): Promise<readonly Sheet[]> {
  return Promise.all(
    sheetFiles.map(
      async (file) => JSON.parse(await readFile(join(directory, file), "utf8")) as Sheet,
    ),
  );
}

export function importCreature(id: CreatureId, sheets: readonly Sheet[]): ImportedArt {
  const entries = sheets.map((sheet) => {
    const entry = sheet[id];
    if (entry === undefined) throw new Error(`the sheet has no ${id}`);
    return entry;
  });
  const palette = mergedFixed(entries);
  const sources = entries.flatMap((entry, set) =>
    entry.frames.map((rows, index) => sourceFrame(id, entry, set, index, rows, palette.glyphOf)),
  );
  const placements = placeAll(sources);
  const stored = sources.map((source, at) => storedPixels(source, placements[at]?.shift ?? 0));
  const all = stored.flat();
  const reach = Math.max(...all.map((pixel) => Math.abs(pixel.x)));
  const groundLine = Math.max(...all.map((pixel) => pixel.up)) + 1;
  const below = Math.max(0, ...all.map((pixel) => -pixel.up));
  return {
    id,
    cell: { width: reach * 2 + 1, height: groundLine + below },
    groundLine,
    fixed: palette.colours,
    frames: stored.map((pixels) => encodeFrame(pixels, reach, groundLine)),
    placements,
  };
}

export function artModule(art: ImportedArt): string {
  const name = `${art.id.charAt(0).toUpperCase()}${art.id.slice(1)}`;
  const frames = art.frames
    .map(([left, top, rows]) => `    [${left}, ${top}, ${JSON.stringify(rows)}],`)
    .join("\n");
  return [
    "// Written by scripts/import-skins.ts from the Stead World sheet's art; change the art and run it again.",
    'import type { CreatureArt } from "../art.ts";',
    "",
    `export const ${art.id}Art: CreatureArt = {`,
    `  id: "${art.id}",`,
    `  name: "${name}",`,
    `  cell: { width: ${art.cell.width}, height: ${art.cell.height} },`,
    `  groundLine: ${art.groundLine},`,
    `  fixed: [${art.fixed.map((rgb) => `0x${rgb.toString(16).padStart(6, "0")}`).join(", ")}],`,
    "  frames: [",
    frames,
    "  ],",
    "};",
    "",
  ].join("\n");
}

export async function importSkins(directory: string): Promise<ImportedArt[]> {
  const sheets = await readSheets(directory);
  const arts = creatureIds.map((id) => importCreature(id, sheets));
  const written: string[] = [];
  for (const art of arts) {
    const folder = join(skinsDirectory, art.id);
    await mkdir(folder, { recursive: true });
    const file = join(folder, "art.ts");
    await writeFile(file, artModule(art));
    written.push(file);
  }
  execFileSync(process.execPath, ["x", "biome", "format", "--write", ...written], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  return arts;
}

interface Pixel {
  readonly x: number;
  readonly up: number;
  readonly glyph: string;
}

interface SourceFrame {
  readonly label: string;
  readonly set: number;
  readonly index: number;
  readonly flipped: boolean;
  readonly walking: boolean;
  readonly turn: boolean;
  readonly pixels: readonly Pixel[];
}

interface MergedFixed {
  readonly colours: number[];
  glyphOf(set: number, role: string): string;
}

function mergedFixed(entries: readonly SheetEntry[]): MergedFixed {
  const colours: number[] = [];
  const glyphs = new Map<string, string>();
  entries.forEach((entry, set) => {
    const used = new Set(entry.frames.flatMap((rows) => [...rows.join("")]));
    for (const [role, hex] of Object.entries(entry.fixed)) {
      if (!used.has(role)) continue;
      const rgb = Number.parseInt(hex.replace(/^#/, ""), 16);
      let at = colours.indexOf(rgb);
      if (at < 0) {
        at = colours.length;
        colours.push(rgb);
      }
      const glyph = fixedGlyphs[at];
      if (glyph === undefined) throw new Error(`more fixed colours than ${fixedGlyphs.length}`);
      glyphs.set(`${set}:${role}`, glyph);
    }
  });
  return {
    colours,
    glyphOf: (set, role) => {
      if ("odmblhw".includes(role)) return role;
      const glyph = glyphs.get(`${set}:${role}`);
      if (glyph === undefined) throw new Error(`sheet ${set} draws "${role}" with no colour`);
      return glyph;
    },
  };
}

function sourceFrame(
  id: CreatureId,
  entry: SheetEntry,
  set: number,
  index: number,
  rows: readonly string[],
  glyphOf: MergedFixed["glyphOf"],
): SourceFrame {
  const turn = set === 2;
  const walking = set === 0 && walkingFrames.includes(index);
  const drawnLeft =
    walking || (set === 1 && carryingFrames.includes(index)) || (!turn && facingLeftAtRest.has(id));
  const flipped = !turn && drawnLeft;
  const floor = floorOf(rows);
  const pixels: Pixel[] = [];
  inked(sealed(withoutStrays(rows, floor), floor)).forEach((row, y) => {
    [...row].forEach((role, x) => {
      if (role === ".") return;
      pixels.push({ x: flipped ? entry.w - 1 - x : x, up: floor - y, glyph: glyphOf(set, role) });
    });
  });
  const label = `${["a", "b", "t"][set]}${index}`;
  return { label, set, index, flipped, walking, turn, pixels };
}

function floorOf(rows: readonly string[]): number {
  const pieces = piecesOf(rows);
  const lowestOf = (piece: readonly [number, number][]): number =>
    Math.max(...piece.map(([, y]) => y));
  const highestOf = (piece: readonly [number, number][]): number =>
    Math.min(...piece.map(([, y]) => y));
  const sorted = [...pieces].sort((a, b) => lowestOf(b) - lowestOf(a));
  let floor = Math.max(...pieces.map(lowestOf));
  for (const piece of sorted) {
    const rest = pieces.filter((other) => other !== piece && lowestOf(other) <= floor);
    if (rest.length === 0) break;
    const above = Math.max(...rest.map(lowestOf));
    const speck = piece.length < largestSpeck && highestOf(piece) > above;
    if (!speck) break;
    floor = above;
  }
  return floor;
}

function withoutStrays(rows: readonly string[], floor: number): string[] {
  const kept = rows.map((row) => [...row]);
  for (const piece of piecesOf(rows)) {
    if (Math.min(...piece.map(([, y]) => y)) <= floor + deepestSpeck) continue;
    for (const [x, y] of piece) {
      const line = kept[y];
      if (line !== undefined) line[x] = ".";
    }
  }
  return kept.map((line) => line.join(""));
}

function piecesOf(rows: readonly string[]): [number, number][][] {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const seen = new Uint8Array(width * height);
  const pieces: [number, number][][] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (seen[y * width + x] === 1 || rows[y]?.[x] === ".") continue;
      const piece: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      seen[y * width + x] = 1;
      while (stack.length > 0) {
        const next = stack.pop();
        if (next === undefined) break;
        piece.push(next);
        const [cx, cy] = next;
        for (let ny = cy - 1; ny <= cy + 1; ny += 1) {
          for (let nx = cx - 1; nx <= cx + 1; nx += 1) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (seen[ny * width + nx] === 1 || rows[ny]?.[nx] === ".") continue;
            seen[ny * width + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      pieces.push(piece);
    }
  }
  return pieces;
}

function sealed(rows: readonly string[], lowest: number): string[] {
  const at = (x: number, y: number): string => rows[y]?.[x] ?? ".";
  const fill = (x: number, y: number): boolean => at(x, y) !== "." && at(x, y) !== "o";
  return rows.map((row, y) =>
    [...row]
      .map((role, x) => {
        if (role !== "." || y > lowest) return role;
        const touches = fill(x - 1, y) || fill(x + 1, y) || fill(x, y - 1) || fill(x, y + 1);
        return touches ? "o" : role;
      })
      .join(""),
  );
}

function inked(rows: readonly string[]): string[] {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const grid = rows.map((row) => [...row]);
  const pockets: [number, number][][] = [];
  const seen = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (seen[y * width + x] === 1 || grid[y]?.[x] !== ".") continue;
      const pocket = airAround(grid, x, y, seen);
      const enclosed = pocket.every(
        ([px, py]) => px > 0 && py > 0 && px < width - 1 && py < height - 1,
      );
      if (enclosed) pockets.push(pocket);
    }
  }
  pockets.forEach((pocket) => {
    if (pocket.length > largestCrack) return;
    for (const [px, py] of pocket) {
      const line = grid[py];
      if (line !== undefined) line[px] = "o";
    }
  });
  return grid.map((line) => line.join(""));
}

function airAround(
  grid: readonly string[][],
  x: number,
  y: number,
  seen: Uint8Array,
): [number, number][] {
  const width = grid[0]?.length ?? 0;
  const pocket: [number, number][] = [];
  const stack: [number, number][] = [[x, y]];
  seen[y * width + x] = 1;
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined) break;
    pocket.push(next);
    const [cx, cy] = next;
    for (const [nx, ny] of [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= grid.length) continue;
      if (seen[ny * width + nx] === 1 || grid[ny]?.[nx] !== ".") continue;
      seen[ny * width + nx] = 1;
      stack.push([nx, ny]);
    }
  }
  return pocket;
}

const parents: Readonly<Record<string, string>> = {
  a1: "a0",
  a2: "a0",
  a3: "a0",
  a4: "a0",
  a5: "a4",
  a6: "a4",
  a7: "a4",
  a8: "a0",
  a9: "a8",
  a10: "a0",
  a11: "a0",
  b8: "a0",
  b0: "b8",
  b1: "b8",
  b2: "b8",
  b3: "b2",
  b4: "b8",
  b5: "b4",
  b6: "b4",
  b7: "b8",
  b9: "b8",
  b10: "b8",
  b11: "b8",
  t7: "a0",
};

function placeAll(sources: readonly SourceFrame[]): Placement[] {
  const byLabel = new Map(sources.map((source) => [source.label, source]));
  const placed = new Map<string, Placement>();
  const place = (label: string): Placement => {
    const known = placed.get(label);
    if (known !== undefined) return known;
    const source = byLabel.get(label);
    if (source === undefined) throw new Error(`no frame ${label}`);
    const parentLabel = source.turn ? (label === "t7" ? "a0" : "t7") : parents[label];
    let placement: Placement;
    if (parentLabel === undefined) {
      placement = { frame: label, shift: -Math.round(centroid(source)), overlap: 1, by: "root" };
    } else {
      const parent = byLabel.get(parentLabel);
      if (parent === undefined) throw new Error(`no frame ${parentLabel}`);
      const anchor = place(parentLabel);
      placement =
        source.turn && label !== "t7"
          ? {
              frame: label,
              shift: Math.round(centroid(parent) + anchor.shift - centroid(source)),
              overlap: 1,
              by: "turns",
            }
          : aligned(source, parent, anchor.shift);
    }
    placed.set(label, placement);
    return placement;
  };
  return sources.map((source) => place(source.label));
}

function aligned(child: SourceFrame, parent: SourceFrame, parentShift: number): Placement {
  const sameSheet = child.set === parent.set && child.flipped === parent.flipped;
  const fallback = sameSheet
    ? parentShift
    : Math.round(centroid(parent) + parentShift - centroid(child));
  const best = bestOverlap(child, parent, parentShift, fallback);
  if (best.overlap >= weakestOverlap) {
    return { frame: child.label, shift: best.shift, overlap: best.overlap, by: "overlap" };
  }
  return {
    frame: child.label,
    shift: fallback,
    overlap: best.overlap,
    by: sameSheet ? "sheet" : "centre",
  };
}

function bestOverlap(
  child: SourceFrame,
  parent: SourceFrame,
  parentShift: number,
  preferred: number,
): { shift: number; overlap: number } {
  const span = 48;
  const width = 512;
  const origin = 256;
  const height = 1 + Math.max(...parent.pixels.map((pixel) => pixel.up));
  const grid = new Uint8Array(width * height);
  for (const pixel of parent.pixels) grid[pixel.up * width + pixel.x + parentShift + origin] = 1;
  let best = { shift: preferred, overlap: -1 };
  for (let shift = preferred - span; shift <= preferred + span; shift += 1) {
    let shared = 0;
    for (const pixel of child.pixels) {
      if (pixel.up < height && grid[pixel.up * width + pixel.x + shift + origin] === 1) shared += 1;
    }
    const overlap = shared / (child.pixels.length + parent.pixels.length - shared);
    const closer = Math.abs(shift - preferred) < Math.abs(best.shift - preferred);
    if (overlap > best.overlap || (overlap === best.overlap && closer)) best = { shift, overlap };
  }
  return best;
}

function centroid(frame: SourceFrame): number {
  return frame.pixels.reduce((sum, pixel) => sum + pixel.x, 0) / Math.max(1, frame.pixels.length);
}

function storedPixels(source: SourceFrame, shift: number): Pixel[] {
  return source.pixels.map((pixel) => ({
    ...pixel,
    x: source.walking ? -(pixel.x + shift) : pixel.x + shift,
  }));
}

function encodeFrame(pixels: readonly Pixel[], reach: number, groundLine: number): ArtFrame {
  const columns = pixels.map((pixel) => pixel.x + reach);
  const left = Math.min(...columns);
  const right = Math.max(...columns);
  const rowOf = (up: number): number => groundLine - 1 - up;
  const top = rowOf(Math.max(...pixels.map((pixel) => pixel.up)));
  const bottom = rowOf(Math.min(...pixels.map((pixel) => pixel.up)));
  const width = right - left + 1;
  const lines = Array.from({ length: bottom - top + 1 }, () => Array<string>(width).fill("."));
  for (const pixel of pixels) {
    const line = lines[rowOf(pixel.up) - top];
    if (line !== undefined) line[pixel.x + reach - left] = pixel.glyph;
  }
  return [
    left,
    top,
    lines.map((line) => runLength(line.join("").replace(/\.+$/, ""))).join(rowBreak),
  ];
}

function runLength(row: string): string {
  let out = "";
  let at = 0;
  while (at < row.length) {
    const glyph = row[at] ?? "";
    let end = at + 1;
    while (row[end] === glyph) end += 1;
    const run = end - at;
    out += run >= 3 ? `${run}${glyph}` : glyph.repeat(run);
    at = end;
  }
  return out;
}

if (import.meta.main) {
  const { positionals } = parseArgs({ allowPositionals: true });
  const directory = positionals[0];
  if (directory === undefined) {
    console.error(
      "usage: bun scripts/import-skins.ts <folder holding poses.json, poses-b.json and turns.json>",
    );
    process.exit(2);
  }
  const arts = await importSkins(directory);
  for (const art of arts) {
    const loose = art.placements.filter((placement) => placement.by !== "overlap");
    console.log(
      `${art.id}: ${art.cell.width}x${art.cell.height}, ${art.fixed.length} fixed colours, ` +
        `placed by sheet or centre: ${loose.map((placement) => `${placement.frame}(${placement.overlap.toFixed(2)})`).join(" ") || "none"}`,
    );
  }
  console.log(`${posesInASheet * 2 + turnsInASheet} frames each, written under ${skinsDirectory}`);
}
