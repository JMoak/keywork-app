import {
  type PoseName,
  poseNames,
  type Row,
  referenceRows,
  rowDuration,
  type Skin,
} from "../pose/skin.ts";
import { assembleAtlas, mirrorFrame } from "./atlas.ts";
import { type Clip, framesInAnArt, sheetClips } from "./clips.ts";
import {
  coatBase,
  coatDeep,
  coatHighlight,
  coatLight,
  coatShade,
  creatureInk,
  firstFixed,
  paper,
  transparent,
} from "./legend.ts";

export interface CreatureArt {
  readonly id: string;
  readonly name: string;
  readonly cell: { readonly width: number; readonly height: number };
  readonly groundLine: number;
  readonly fixed: readonly number[];
  readonly frames: readonly ArtFrame[];
}

export type ArtFrame = readonly [left: number, top: number, rows: string];

export const creatureIds = [
  "cairn",
  "tessera",
  "folio",
  "purl",
  "hush",
  "knot",
  "beaver",
  "newfie",
  "hippo",
] as const;

export type CreatureId = (typeof creatureIds)[number];

export const roleGlyphs = ".odmblhw";
export const fixedGlyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZacefgijknpqrstuvxyz!%&*+,-:;<=>?@[]^_|~{}";
export const rowBreak = "/";

export function artSkin(art: CreatureArt): Skin {
  if (art.frames.length !== framesInAnArt) {
    throw new Error(`${art.id} holds ${art.frames.length} frames, not ${framesInAnArt}`);
  }
  const drawn = art.frames.map((frame) => decodeFrame(art, frame));
  const mirrored = new Map<number, Uint8Array>();
  const cellOf = (source: number, flip: boolean): Uint8Array => {
    const frame = drawn[source];
    if (frame === undefined) throw new Error(`${art.id} has no frame ${source}`);
    if (!flip) return frame;
    const known = mirrored.get(source);
    if (known !== undefined) return known;
    const flipped = mirrorFrame({ ...art.cell, indices: frame }).indices;
    mirrored.set(source, flipped);
    return flipped;
  };
  const played = byPose((pose) => playedClip(pose, sheetClips[pose]));
  const cells = byPose((pose): readonly Uint8Array[] =>
    played[pose].sources.map((source) => cellOf(source, played[pose].mirrored)),
  );
  return {
    id: art.id,
    displayName: art.name,
    cell: art.cell,
    atlas: assembleAtlas(art.cell, cells),
    palette: {
      identity: [coatDeep, coatShade, coatBase, coatLight, coatHighlight],
      ground: [],
      outline: creatureInk,
      accent: [paper],
    },
    fixed: art.fixed.map(hexOf),
    rows: byPose((pose) => played[pose].row),
    groundLine: art.groundLine,
    gaze: { row: poseNames.indexOf("look"), directions: 8 },
  };
}

export function decodeFrame(art: CreatureArt, frame: ArtFrame): Uint8Array {
  const [left, top, rows] = frame;
  const { width, height } = art.cell;
  const cell = new Uint8Array(width * height);
  rows.split(rowBreak).forEach((row, line) => {
    const y = top + line;
    if (y >= height) throw new Error(`${art.id} draws below its cell`);
    let x = left;
    let count = "";
    for (const glyph of row) {
      if (glyph >= "0" && glyph <= "9") {
        count += glyph;
        continue;
      }
      const run = count === "" ? 1 : Number(count);
      if (x + run > width) throw new Error(`${art.id} draws past the right of its cell`);
      cell.fill(indexOfArtGlyph(glyph), y * width + x, y * width + x + run);
      x += run;
      count = "";
    }
  });
  return cell;
}

function byPose<Value>(make: (pose: PoseName) => Value): Record<PoseName, Value> {
  return Object.fromEntries(poseNames.map((pose) => [pose, make(pose)])) as Record<PoseName, Value>;
}

interface PlayedClip {
  readonly sources: readonly number[];
  readonly mirrored: boolean;
  readonly row: Row;
}

function playedClip(pose: PoseName, clip: Clip): PlayedClip {
  const reference = referenceRows[pose];
  const runs = runsOf(clip.beats, reference.loop && pose !== "look");
  const ms =
    runs.length === 1 && !reference.loop
      ? [rowDuration(reference)]
      : runs.map((run) => run.beats * clip.beatMs);
  return {
    sources: runs.map((run) => run.source),
    mirrored: clip.mirrored === true,
    row: reference.loop
      ? { frames: runs.length, ms, loop: true }
      : { frames: runs.length, ms, loop: false, fallback: reference.fallback ?? "idle" },
  };
}

interface Run {
  readonly source: number;
  readonly beats: number;
}

function runsOf(beats: readonly number[], wraps: boolean): Run[] {
  const runs: Run[] = [];
  for (const source of beats) {
    const last = runs[runs.length - 1];
    if (last?.source === source) runs[runs.length - 1] = { source, beats: last.beats + 1 };
    else runs.push({ source, beats: 1 });
  }
  const first = runs[0];
  const last = runs[runs.length - 1];
  if (wraps && runs.length > 1 && first !== undefined && last?.source === first.source) {
    runs.pop();
    runs[0] = { source: first.source, beats: first.beats + last.beats };
  }
  return runs;
}

const glyphIndices = new Map<string, number>([
  ...[transparent, creatureInk, coatDeep, coatShade, coatBase, coatLight, coatHighlight, paper].map(
    (index, at): [string, number] => [roleGlyphs[at] ?? "", index],
  ),
  ...[...fixedGlyphs].map((glyph, at): [string, number] => [glyph, firstFixed + at]),
]);

function indexOfArtGlyph(glyph: string): number {
  const index = glyphIndices.get(glyph);
  if (index === undefined) throw new Error(`"${glyph}" is not an art glyph`);
  return index;
}

function hexOf(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, "0")}`;
}
