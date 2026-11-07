import { indexOfGlyph, outline, transparent } from "./legend.ts";

export interface Sprite {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

export interface Band {
  readonly rows: readonly [number, number];
  readonly cols: readonly [number, number];
}

export interface Part {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly sprite: Sprite;
  readonly band?: Band;
}

export function part(
  name: string,
  x: number,
  y: number,
  rows: readonly string[],
  band?: Band,
): Part {
  const sprite = spriteFromRows(rows);
  if (band === undefined) return { name, x, y, sprite };
  return { name, x, y, sprite, band };
}

export function spriteFromRows(rows: readonly string[]): Sprite {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (height === 0 || width === 0) throw new Error("a sprite needs at least one pixel");
  const pixels = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} is ${row.length} wide, not ${width}`);
    for (let x = 0; x < width; x += 1) pixels[y * width + x] = indexOfGlyph(row.charAt(x));
  });
  return { width, height, pixels };
}

export function pixelAt(sprite: Sprite, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= sprite.width || y >= sprite.height) return transparent;
  return sprite.pixels[y * sprite.width + x] ?? transparent;
}

export function mirrorSprite(sprite: Sprite): Sprite {
  const pixels = new Uint8Array(sprite.pixels.length);
  for (let y = 0; y < sprite.height; y += 1) {
    for (let x = 0; x < sprite.width; x += 1) {
      pixels[y * sprite.width + x] = pixelAt(sprite, sprite.width - 1 - x, y);
    }
  }
  return { width: sprite.width, height: sprite.height, pixels };
}

export function deformSprite(sprite: Sprite, band: Band, rows: number, cols: number): Sprite {
  const rowOrder = stretchedIndices(sprite.height, band.rows, rows, "middle");
  const colOrder = stretchedIndices(sprite.width, band.cols, cols, "edges");
  const pixels = new Uint8Array(rowOrder.length * colOrder.length);
  rowOrder.forEach((sourceY, y) => {
    colOrder.forEach((sourceX, x) => {
      pixels[y * colOrder.length + x] = pixelAt(sprite, sourceX, sourceY);
    });
  });
  return { width: colOrder.length, height: rowOrder.length, pixels };
}

export function outlineSprite(sprite: Sprite): Sprite {
  const width = sprite.width + 2;
  const height = sprite.height + 2;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const own = pixelAt(sprite, x - 1, y - 1);
      pixels[y * width + x] =
        own !== transparent ? own : touchesFill(sprite, x - 1, y - 1) ? outline : 0;
    }
  }
  return { width, height, pixels };
}

export function opaqueCount(sprite: Sprite): number {
  return sprite.pixels.reduce((count, index) => (index === transparent ? count : count + 1), 0);
}

function touchesFill(sprite: Sprite, x: number, y: number): boolean {
  return (
    isFill(pixelAt(sprite, x - 1, y)) ||
    isFill(pixelAt(sprite, x + 1, y)) ||
    isFill(pixelAt(sprite, x, y - 1)) ||
    isFill(pixelAt(sprite, x, y + 1))
  );
}

function isFill(index: number): boolean {
  return index !== transparent && index !== outline;
}

function stretchedIndices(
  length: number,
  band: readonly [number, number],
  delta: number,
  where: "middle" | "edges",
): number[] {
  const indices = Array.from({ length }, (_, index) => index);
  if (delta === 0) return indices;
  const [from, to] = band;
  if (delta > 0)
    return where === "middle"
      ? grownMiddle(indices, from, to, delta)
      : grownEdges(indices, from, to, delta);
  return where === "middle"
    ? shrunkMiddle(indices, from, to, -delta)
    : shrunkEdges(indices, from, to, -delta);
}

function grownMiddle(indices: number[], from: number, to: number, count: number): number[] {
  const middle = Math.floor((from + to) / 2);
  return [
    ...indices.slice(0, middle + 1),
    ...Array.from({ length: count }, () => middle),
    ...indices.slice(middle + 1),
  ];
}

function grownEdges(indices: number[], from: number, to: number, count: number): number[] {
  return [
    ...indices.slice(0, from),
    ...Array.from({ length: count }, () => from),
    ...indices.slice(from, to + 1),
    ...Array.from({ length: count }, () => to),
    ...indices.slice(to + 1),
  ];
}

function shrunkMiddle(indices: number[], from: number, to: number, count: number): number[] {
  const middle = Math.floor((from + to) / 2);
  const start = Math.max(from, middle - Math.floor(count / 2));
  return [...indices.slice(0, start), ...indices.slice(start + count)];
}

function shrunkEdges(indices: number[], from: number, to: number, count: number): number[] {
  return [
    ...indices.slice(0, from),
    ...indices.slice(from + count, to + 1 - count),
    ...indices.slice(to + 1),
  ];
}
