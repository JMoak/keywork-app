import { type IndexedBitmap, type PoseName, poseNames, type Skin } from "../pose/skin.ts";
import { transparent } from "./legend.ts";

export interface IndexedFrame {
  readonly width: number;
  readonly height: number;
  readonly indices: Uint8Array;
}

export interface SlicedSkin {
  readonly hash: string;
  readonly skin: Skin;
  readonly columns: number;
  frame(pose: PoseName, index: number): IndexedFrame;
}

export function sliceSkin(skin: Skin): SlicedSkin {
  const known = slicedByIdentity.get(skin)?.deref();
  if (known !== undefined) return retainSlice(known);
  const hash = skinHash(skin);
  const sliced = matchingSlice(skin, hash) ?? slicer(skin, hash);
  slicedByIdentity.set(skin, new WeakRef(sliced));
  return retainSlice(sliced);
}

export function skinHash(skin: Skin): string {
  return `${manifestIdentity(skin)}:${contentHash(skin.atlas)}`;
}

export function contentHash(bitmap: IndexedBitmap): string {
  let hash = 0x811c9dc5;
  const mix = (byte: number): void => {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  for (const dimension of [bitmap.width, bitmap.height]) {
    mix(dimension & 0xff);
    mix((dimension >>> 8) & 0xff);
    mix((dimension >>> 16) & 0xff);
  }
  for (const index of bitmap.indices) mix(index);
  return hash.toString(16).padStart(8, "0");
}

export function sliceCacheSize(): number {
  return sliceCache.size;
}

export function clearSliceCache(): void {
  sliceCache.clear();
  slicesByHash.clear();
  retainedBytes = 0;
  slicedByIdentity = new WeakMap();
}

export function assembleAtlas(
  cell: Skin["cell"],
  cells: Readonly<Record<PoseName, readonly Uint8Array[]>>,
): IndexedBitmap {
  const columns = Math.max(...poseNames.map((name) => cells[name].length));
  const width = cell.width * columns;
  const height = cell.height * poseNames.length;
  const indices = new Uint8Array(width * height);
  poseNames.forEach((name, row) => {
    cells[name].forEach((frame, column) => {
      if (frame.length !== cell.width * cell.height) {
        throw new Error(`${name} frame ${column} holds ${frame.length} indices for the cell`);
      }
      for (let y = 0; y < cell.height; y += 1) {
        const source = frame.subarray(y * cell.width, (y + 1) * cell.width);
        indices.set(source, (row * cell.height + y) * width + column * cell.width);
      }
    });
  });
  return { width, height, indices };
}

export function mirrorFrame(frame: IndexedFrame): IndexedFrame {
  const indices = new Uint8Array(frame.indices.length);
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      indices[y * frame.width + x] =
        frame.indices[y * frame.width + (frame.width - 1 - x)] ?? transparent;
    }
  }
  return { width: frame.width, height: frame.height, indices };
}

export function lowestOpaqueRow(frame: IndexedFrame): number | undefined {
  for (let y = frame.height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if (frame.indices[y * frame.width + x] !== transparent) return y;
    }
  }
  return undefined;
}

export function opaqueCount(frame: IndexedFrame): number {
  let count = 0;
  for (const index of frame.indices) if (index !== transparent) count += 1;
  return count;
}

const maximumSlices = 32;
const maximumRetainedBytes = 32 * 1024 * 1024;
const sliceCache = new Map<SlicedSkin, number>();
const slicesByHash = new Map<string, Set<SlicedSkin>>();
let retainedBytes = 0;
let slicedByIdentity = new WeakMap<Skin, WeakRef<SlicedSkin>>();

function manifestIdentity(skin: Skin): string {
  return JSON.stringify([
    skin.id,
    skin.displayName,
    skin.cell.width,
    skin.cell.height,
    skin.atlas.width,
    skin.atlas.height,
    skin.palette.identity,
    skin.palette.ground,
    skin.palette.outline,
    skin.palette.accent,
    skin.groundLine,
    skin.gaze === undefined ? null : [skin.gaze.row, skin.gaze.directions],
    poseNames.map((pose) => {
      const row = skin.rows[pose];
      return [row.frames, row.ms, row.loop, row.fallback ?? null];
    }),
  ]);
}

function matchingSlice(skin: Skin, hash: string): SlicedSkin | undefined {
  const candidates = slicesByHash.get(hash);
  if (candidates === undefined) return undefined;
  for (const candidate of candidates) {
    if (equalIndices(candidate.skin.atlas.indices, skin.atlas.indices)) return candidate;
  }
  return undefined;
}

function equalIndices(first: Uint8Array, second: Uint8Array): boolean {
  if (first === second) return true;
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

function retainSlice(sliced: SlicedSkin): SlicedSkin {
  const retained = sliceCache.get(sliced);
  if (retained !== undefined) {
    sliceCache.delete(sliced);
    sliceCache.set(sliced, retained);
    return sliced;
  }
  const reservedBytes = sliced.skin.atlas.indices.buffer.byteLength * 2 + sliced.hash.length * 2;
  if (reservedBytes > maximumRetainedBytes) return sliced;
  sliceCache.set(sliced, reservedBytes);
  retainedBytes += reservedBytes;
  const candidates = slicesByHash.get(sliced.hash) ?? new Set<SlicedSkin>();
  candidates.add(sliced);
  slicesByHash.set(sliced.hash, candidates);
  evictOldSlices();
  return sliced;
}

function evictOldSlices(): void {
  while (sliceCache.size > maximumSlices || retainedBytes > maximumRetainedBytes) {
    const oldest = sliceCache.entries().next().value;
    if (oldest === undefined) return;
    const [sliced, reservedBytes] = oldest;
    sliceCache.delete(sliced);
    retainedBytes -= reservedBytes;
    const candidates = slicesByHash.get(sliced.hash);
    candidates?.delete(sliced);
    if (candidates?.size === 0) slicesByHash.delete(sliced.hash);
  }
}

function slicer(skin: Skin, hash: string): SlicedSkin {
  const columns = skin.atlas.width / skin.cell.width;
  const frames = new Map<number, IndexedFrame>();
  return {
    hash,
    skin,
    columns,
    frame: (pose, index) => {
      const row = poseNames.indexOf(pose);
      const requested = Number.isNaN(index) ? 0 : Math.floor(index);
      const column = Math.min(Math.max(0, requested), skin.rows[pose].frames - 1);
      const key = row * columns + column;
      const known = frames.get(key);
      if (known !== undefined) return known;
      const cut = cutCell(skin, row, column);
      frames.set(key, cut);
      return cut;
    },
  };
}

function cutCell(skin: Skin, row: number, column: number): IndexedFrame {
  const { width, height } = skin.cell;
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const start = (row * height + y) * skin.atlas.width + column * width;
    indices.set(skin.atlas.indices.subarray(start, start + width), y * width);
  }
  return { width, height, indices };
}
