import type { Facing } from "../pose/pose.ts";
import type { PoseName, Skin } from "../pose/skin.ts";
import { type IndexedFrame, mirrorFrame, sliceSkin } from "../skins/atlas.ts";
import { transparent } from "../skins/legend.ts";
import { type Palette, transparentColor } from "./palette.ts";

export interface PaintSurface {
  fillStyle: string;
  fillRect(x: number, y: number, width: number, height: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
}

export interface RasterSurface extends PaintSurface {
  raster(): Raster;
}

export function createRasterSurface(width: number, height: number): RasterSurface {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const cover = (
    x: number,
    y: number,
    w: number,
    h: number,
    pixel: readonly [number, number, number, number],
  ): void => {
    const left = Math.max(0, Math.floor(x));
    const top = Math.max(0, Math.floor(y));
    const right = Math.min(width, Math.ceil(x + w));
    const bottom = Math.min(height, Math.ceil(y + h));
    for (let row = top; row < bottom; row += 1) {
      for (let column = left; column < right; column += 1) {
        rgba.set(pixel, (row * width + column) * 4);
      }
    }
  };
  return {
    fillStyle: "",
    fillRect(x, y, w, h) {
      cover(x, y, w, h, rgbaOf(this.fillStyle));
    },
    clearRect(x, y, w, h) {
      cover(x, y, w, h, [0, 0, 0, 0]);
    },
    raster: () => ({ width, height, rgba }),
  };
}

export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

export interface HitMask {
  readonly width: number;
  readonly height: number;
  readonly bits: Uint8Array;
}

export interface Blit {
  readonly frame: IndexedFrame;
  readonly x: number;
  readonly y: number;
}

export const directionalRows: ReadonlySet<PoseName> = new Set<PoseName>([
  "walk-left",
  "walk-right",
  "look",
]);

export function mirrors(pose: PoseName, facing: Facing): boolean {
  return facing === "left" && !directionalRows.has(pose);
}

export function paintIndexed(
  surface: PaintSurface,
  frame: IndexedFrame,
  palette: Palette,
  scale: number,
  originX = 0,
  originY = 0,
): void {
  for (let y = 0; y < frame.height; y += 1) {
    let x = 0;
    while (x < frame.width) {
      const index = frame.indices[y * frame.width + x] ?? transparent;
      let run = 1;
      while (x + run < frame.width && frame.indices[y * frame.width + x + run] === index) run += 1;
      const color = palette[index];
      if (index !== transparent && color !== undefined && color !== transparentColor) {
        surface.fillStyle = color;
        surface.fillRect(originX + x * scale, originY + y * scale, run * scale, scale);
      }
      x += run;
    }
  }
}

export function rasterize(frame: IndexedFrame, palette: Palette, scale: number): Raster {
  const width = frame.width * scale;
  const height = frame.height * scale;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const colors = palette.map((color, index) => (index === transparent ? undefined : rgbaOf(color)));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = frame.indices[Math.floor(y / scale) * frame.width + Math.floor(x / scale)];
      const color = index === undefined ? undefined : colors[index];
      if (color === undefined) continue;
      rgba.set(color, (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}

export function composite(width: number, height: number, layers: readonly Blit[]): IndexedFrame {
  const indices = new Uint8Array(width * height);
  for (const layer of layers) blitInto(indices, width, height, layer);
  return { width, height, indices };
}

export function blitInto(indices: Uint8Array, width: number, height: number, blit: Blit): void {
  for (let y = 0; y < blit.frame.height; y += 1) {
    const row = blit.y + y;
    if (row < 0 || row >= height) continue;
    for (let x = 0; x < blit.frame.width; x += 1) {
      const column = blit.x + x;
      if (column < 0 || column >= width) continue;
      const index = blit.frame.indices[y * blit.frame.width + x] ?? transparent;
      if (index !== transparent) indices[row * width + column] = index;
    }
  }
}

export function alphaMask(frame: IndexedFrame, scale: number): HitMask {
  const width = frame.width * scale;
  const height = frame.height * scale;
  const bits = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = frame.indices[Math.floor(y / scale) * frame.width + Math.floor(x / scale)];
      bits[y * width + x] = index === undefined || index === transparent ? 0 : 1;
    }
  }
  return { width, height, bits };
}

export function hitTest(
  skin: Skin,
  pose: PoseName,
  frame: number,
  x: number,
  y: number,
  facing: Facing = "right",
): boolean {
  const cell = sliceSkin(skin).frame(pose, frame);
  const column = Math.floor(x);
  const row = Math.floor(y);
  if (column < 0 || row < 0 || column >= cell.width || row >= cell.height) return false;
  const sampled = mirrors(pose, facing) ? cell.width - 1 - column : column;
  return (cell.indices[row * cell.width + sampled] ?? transparent) !== transparent;
}

export function hitMaskOf(
  skin: Skin,
  pose: PoseName,
  frame: number,
  scale: number,
  facing: Facing = "right",
): HitMask {
  const cell = sliceSkin(skin).frame(pose, frame);
  return alphaMask(mirrors(pose, facing) ? mirrorFrame(cell) : cell, scale);
}

export function rgbaOf(color: string): [number, number, number, number] {
  const hex = color.trim().replace(/^#/, "");
  const digits =
    hex.length === 3 || hex.length === 4 ? [...hex].map((digit) => digit + digit).join("") : hex;
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(digits)) {
    throw new Error(`"${color}" is not a hex color the rasterizer can read`);
  }
  const value = Number.parseInt(digits.slice(0, 6), 16);
  const alpha = digits.length === 8 ? Number.parseInt(digits.slice(6), 16) : 255;
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff, alpha];
}
