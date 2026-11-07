import {
  type IndexedBitmap,
  type PoseName,
  poseNames,
  type Row,
  referenceRows,
  type Skin,
} from "../pose/skin.ts";
import { assembleAtlas } from "./atlas.ts";

export const codexRows = [
  "idle",
  "running",
  "waiting",
  "review",
  "failed",
  "running-left",
  "running-right",
  "waving",
  "jumping",
] as const;

export type CodexRow = (typeof codexRows)[number];

export interface CodexRowTiming {
  readonly frames: number;
  readonly ms: readonly number[];
}

export interface CodexManifest {
  readonly id: string;
  readonly displayName: string;
  readonly cell: { readonly width: number; readonly height: number };
  readonly groundLine: number;
  readonly rows: Readonly<Record<CodexRow, CodexRowTiming>>;
  readonly atlas: IndexedBitmap;
}

export const codexRowMap: Readonly<Record<CodexRow, PoseName>> = {
  idle: "idle",
  running: "work",
  waiting: "wait",
  review: "celebrate",
  failed: "blocked",
  "running-left": "walk-left",
  "running-right": "walk-right",
  waving: "wave",
  jumping: "greet",
};

export type BorrowedPose = Exclude<PoseName, (typeof codexRowMap)[CodexRow]>;

export const borrowedRows: Readonly<Record<BorrowedPose, PoseName>> = {
  hammer: "work",
  read: "work",
  carve: "work",
  carry: "work",
  deliver: "wait",
  ring: "wave",
  stumble: "blocked",
  nap: "idle",
  stretch: "idle",
  look: "idle",
  raise: "work",
  sit: "idle",
};

export function importCodexAtlas(manifest: CodexManifest): Skin {
  const columns = manifest.atlas.width / manifest.cell.width;
  const codexCells = Object.fromEntries(
    codexRows.map((name, row) => [
      name,
      Array.from({ length: manifest.rows[name].frames }, (_, column) =>
        cutCell(manifest, row, column, columns),
      ),
    ]),
  ) as Record<CodexRow, Uint8Array[]>;
  const sourceOf = (pose: PoseName): CodexRow => {
    const direct = codexRows.find((name) => codexRowMap[name] === pose);
    if (direct !== undefined) return direct;
    return sourceOf(borrowedRows[pose as BorrowedPose]);
  };
  const cells = Object.fromEntries(
    poseNames.map((pose) => [pose, cellsFor(pose, codexCells[sourceOf(pose)])]),
  ) as Record<PoseName, readonly Uint8Array[]>;
  const rows = Object.fromEntries(
    poseNames.map((pose) => [pose, rowFor(pose, manifest.rows[sourceOf(pose)], cells[pose])]),
  ) as Record<PoseName, Row>;
  return {
    id: manifest.id,
    displayName: manifest.displayName,
    cell: manifest.cell,
    atlas: assembleAtlas(manifest.cell, cells),
    palette: { identity: [1, 2, 3, 4], ground: [5, 6, 7, 8], outline: 9, accent: [10, 11, 12] },
    rows,
    groundLine: manifest.groundLine,
    gaze: { row: poseNames.indexOf("look"), directions: 8 },
  };
}

function cellsFor(pose: PoseName, source: readonly Uint8Array[]): readonly Uint8Array[] {
  if (pose !== "look") return source;
  const neutral = source[0];
  if (neutral === undefined) throw new Error("the idle row has no frame to look from");
  return Array.from({ length: 8 }, () => neutral);
}

function rowFor(pose: PoseName, timing: CodexRowTiming, cells: readonly Uint8Array[]): Row {
  const reference = referenceRows[pose];
  const ms =
    cells.length === timing.frames
      ? [...timing.ms]
      : Array.from({ length: cells.length }, (_, index) => reference.ms[index] ?? 600);
  return reference.loop
    ? { frames: cells.length, ms, loop: true }
    : { frames: cells.length, ms, loop: false, fallback: reference.fallback ?? "idle" };
}

function cutCell(
  manifest: CodexManifest,
  row: number,
  column: number,
  columns: number,
): Uint8Array {
  const { width, height } = manifest.cell;
  if (column >= columns)
    throw new Error(`the codex atlas has ${columns} columns, not ${column + 1}`);
  const cell = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const start = (row * height + y) * manifest.atlas.width + column * width;
    cell.set(manifest.atlas.indices.subarray(start, start + width), y * width);
  }
  return cell;
}
