import type { Facing } from "../pose/pose.ts";
import type { PoseName, Skin } from "../pose/skin.ts";
import { type IndexedFrame, mirrorFrame, sliceSkin } from "../skins/atlas.ts";
import { type Palette, transparentColor } from "./palette.ts";
import { alphaMask, mirrors, type PaintSurface, paintIndexed } from "./raster.ts";

export interface RenderPose {
  readonly clip: PoseName;
  readonly frame: number;
  readonly facing: Facing;
}

export interface RenderPrefs {
  readonly scale: number;
}

export interface RenderedFrame {
  readonly width: number;
  readonly height: number;
  readonly indexed: IndexedFrame;
  readonly alpha: Uint8Array;
  paint(surface: PaintSurface, x?: number, y?: number): void;
}

export type Renderer = (pose: RenderPose, tokens: Palette, prefs: RenderPrefs) => RenderedFrame;

export const artScale = 2;

export function scaleFor(devicePixelRatio: number, size = 1): number {
  return Math.max(1, Math.round(artScale * size * devicePixelRatio));
}

export function createRenderer(skin: Skin): Renderer {
  const sliced = sliceSkin(skin);
  return (pose, tokens, prefs) => {
    const scale = renderScale(skin.cell, prefs.scale);
    const cell = sliced.frame(pose.clip, pose.frame);
    const flip = mirrors(pose.clip, pose.facing);
    const key = 2 * frameId(cell) + Number(flip);
    const frame = drawings.get(key) ?? drawings.put(key, prepare(flip ? mirrorFrame(cell) : cell));
    let alpha: Uint8Array | undefined;
    return {
      width: cell.width * scale,
      height: cell.height * scale,
      indexed: frame.indexed,
      get alpha() {
        if (alpha === undefined) {
          const maskKey = `${key}:${scale}`;
          alpha = masks.get(maskKey) ?? masks.put(maskKey, scaledAlpha(frame, scale));
        }
        return alpha;
      },
      paint: (surface, x = 0, y = 0) => paint(surface, frame, tokens, scale, x, y),
    };
  };
}

type Runs = Uint8Array | Uint16Array | Uint32Array;

interface Drawing {
  readonly indexed: IndexedFrame;
  readonly runs: Runs | undefined;
  readonly byteLength: number;
}

const drawingBudget = 8 * 1024 * 1024;
const maskBudget = 4 * 1024 * 1024;
const identities = new WeakMap<IndexedFrame, number>();
let nextId = 0;

function renderScale(cell: Skin["cell"], requested: number): number {
  const scale = Math.max(1, Math.round(requested));
  const pixels = cell.width * cell.height * scale * scale;
  if (!Number.isFinite(requested) || !Number.isSafeInteger(pixels) || pixels > maskBudget)
    throw new RangeError(
      `scale ${requested} exceeds the renderer's ${maskBudget}-pixel frame limit`,
    );
  return scale;
}

function frameId(cell: IndexedFrame): number {
  const known = identities.get(cell);
  if (known !== undefined) return known;
  const id = nextId++;
  identities.set(cell, id);
  return id;
}

function prepare(indexed: IndexedFrame): Drawing {
  const runs = compileRuns(indexed);
  return { indexed, runs, byteLength: indexed.indices.byteLength + (runs?.byteLength ?? 0) };
}

function compileRuns({ width, height, indices }: IndexedFrame): Runs | undefined {
  const dimension = Math.max(width, height);
  const Coordinates =
    dimension <= 255 ? Uint8Array : dimension <= 65535 ? Uint16Array : Uint32Array;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    let previous = 0;
    for (let x = 0; x < width; x += 1) {
      const ink = indices[y * width + x] ?? 0;
      if (ink !== 0 && ink !== previous) count += 1;
      previous = ink;
    }
  }
  if (count * 4 * Coordinates.BYTES_PER_ELEMENT + indices.byteLength > drawingBudget)
    return undefined;
  const runs = new Coordinates(count * 4);
  let at = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let x = 0;
    while (x < width) {
      const ink = indices[row + x] ?? 0;
      const start = x++;
      while (x < width && indices[row + x] === ink) x += 1;
      if (ink === 0) continue;
      runs[at++] = start;
      runs[at++] = y;
      runs[at++] = x - start;
      runs[at++] = ink;
    }
  }
  return runs;
}

function paint(
  surface: PaintSurface,
  frame: Drawing,
  palette: Palette,
  scale: number,
  x: number,
  y: number,
): void {
  const { indexed, runs } = frame;
  if (runs === undefined) {
    paintIndexed(surface, indexed, palette, scale, x, y);
    return;
  }
  for (let at = 0; at < runs.length; at += 4) {
    const color = palette[runs[at + 3] as number];
    if (color === undefined || color === transparentColor) continue;
    surface.fillStyle = color;
    surface.fillRect(
      x + (runs[at] as number) * scale,
      y + (runs[at + 1] as number) * scale,
      (runs[at + 2] as number) * scale,
      scale,
    );
  }
}

function scaledAlpha({ indexed, runs }: Drawing, scale: number): Uint8Array {
  if (runs === undefined) return alphaMask(indexed, scale).bits;
  const width = indexed.width * scale;
  const bits = new Uint8Array(width * indexed.height * scale);
  for (let at = 0; at < runs.length; at += 4) {
    const x = (runs[at] as number) * scale;
    const y = (runs[at + 1] as number) * scale;
    const end = x + (runs[at + 2] as number) * scale;
    bits.fill(1, y * width + x, y * width + end);
  }
  for (let row = 0; row < indexed.height; row += 1) {
    const first = row * scale * width;
    for (let subrow = 1; subrow < scale; subrow += 1)
      bits.copyWithin(first + subrow * width, first, first + width);
  }
  return bits;
}

class ByteCache<K, V extends { readonly byteLength: number }> {
  private readonly entries = new Map<K, V>();
  private readonly capacity: number;
  private readonly budget: number;
  private bytes = 0;

  constructor(capacity: number, budget: number) {
    this.capacity = capacity;
    this.budget = budget;
  }

  get(key: K): V | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  put(key: K, value: V): V {
    if (value.byteLength > this.budget) return value;
    this.entries.set(key, value);
    this.bytes += value.byteLength;
    while (this.entries.size > this.capacity || this.bytes > this.budget) {
      const oldest = this.entries.entries().next().value;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.bytes -= oldest[1].byteLength;
    }
    return value;
  }
}

const drawings = new ByteCache<number, Drawing>(512, drawingBudget);
const masks = new ByteCache<string, Uint8Array>(64, maskBudget);
