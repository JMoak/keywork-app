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
  const known = slicedByIdentity.get(skin);
  if (known !== undefined) return known;
  const hash = skinHash(skin);
  const sliced = sliceCache.get(hash) ?? slicer(skin, hash);
  sliceCache.set(hash, sliced);
  slicedByIdentity.set(skin, sliced);
  return sliced;
}

export function skinHash(skin: Skin): string {
  return `${skin.cell.width}x${skin.cell.height}:${contentHash(skin.atlas)}`;
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

const sliceCache = new Map<string, SlicedSkin>();
let slicedByIdentity = new WeakMap<Skin, SlicedSkin>();

function slicer(skin: Skin, hash: string): SlicedSkin {
  const columns = skin.atlas.width / skin.cell.width;
  const frames = new Map<number, IndexedFrame>();
  return {
    hash,
    skin,
    columns,
    frame: (pose, index) => {
      const row = poseNames.indexOf(pose);
      const column = Math.min(Math.max(0, index), skin.rows[pose].frames - 1);
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
