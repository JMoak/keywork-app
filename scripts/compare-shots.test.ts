import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  compareShotSets,
  decodePng,
  differingPixelRatio,
  type Image,
  maxDifferentPixelRatio,
} from "./compare-shots.ts";

function png(width: number, height: number, colorType: 2 | 6, rows: number[][]): Uint8Array {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const ihdr = [...be32(width), ...be32(height), 8, colorType, 0, 0, 0];
  const idat = [...deflateSync(Uint8Array.from(rows.flat()))];
  return Uint8Array.from([
    ...signature,
    ...chunk("IHDR", ihdr),
    ...chunk("IDAT", idat),
    ...chunk("IEND", []),
  ]);
}

function chunk(type: string, data: number[]): number[] {
  return [...be32(data.length), ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
}

function be32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function solid(width: number, height: number, rgba: [number, number, number, number]): Image {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) pixels.set(rgba, i * 4);
  return { width, height, rgba: pixels };
}

describe("decodePng", () => {
  it("decodes RGBA rows through every filter type", () => {
    const image = decodePng(
      png(2, 5, 6, [
        [0, 10, 20, 30, 255, 40, 50, 60, 255],
        [1, 10, 20, 30, 255, 1, 1, 1, 0],
        [2, 0, 0, 0, 0, 1, 1, 1, 0],
        [3, 0, 0, 0, 0, 0, 0, 0, 0],
        [4, 0, 0, 0, 0, 0, 0, 0, 0],
      ]),
    );
    expect(image.width).toBe(2);
    expect(image.height).toBe(5);
    expect([...image.rgba.subarray(0, 8)]).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
    expect([...image.rgba.subarray(8, 16)]).toEqual([10, 20, 30, 255, 11, 21, 31, 255]);
    expect([...image.rgba.subarray(16, 24)]).toEqual([10, 20, 30, 255, 12, 22, 32, 255]);
    expect([...image.rgba.subarray(24, 32)]).toEqual([5, 10, 15, 127, 8, 16, 23, 191]);
    expect([...image.rgba.subarray(32, 40)]).toEqual([5, 10, 15, 127, 8, 16, 23, 191]);
  });

  it("expands RGB to RGBA with an opaque alpha", () => {
    const image = decodePng(png(1, 1, 2, [[0, 7, 8, 9]]));
    expect([...image.rgba]).toEqual([7, 8, 9, 255]);
  });

  it("refuses bytes that are not a PNG", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(/not a PNG/);
  });
});

describe("differingPixelRatio", () => {
  it("ignores small per-channel drift and counts larger changes", () => {
    const base = solid(10, 10, [100, 100, 100, 255]);
    const drifted = solid(10, 10, [110, 95, 100, 255]);
    const changed = solid(10, 10, [100, 100, 100, 255]);
    changed.rgba.set([200, 200, 200, 255], 0);
    changed.rgba.set([200, 200, 200, 255], 4);
    expect(differingPixelRatio(base, drifted)).toBe(0);
    expect(differingPixelRatio(base, changed)).toBe(0.02);
  });

  it("reports a size mismatch as undefined", () => {
    expect(
      differingPixelRatio(solid(2, 2, [0, 0, 0, 0]), solid(3, 2, [0, 0, 0, 0])),
    ).toBeUndefined();
  });
});

describe("compareShotSets", () => {
  const sets = (
    windows: Record<string, Image>,
    linux: Record<string, Image>,
    macos: Record<string, Image> = {},
  ) =>
    new Map([
      ["windows", new Map(Object.entries(windows))],
      ["linux", new Map(Object.entries(linux))],
      ["macos", new Map(Object.entries(macos))],
    ]);

  it("passes shots that agree within the font-fallback tolerance", () => {
    const a = solid(20, 20, [0, 0, 0, 255]);
    const b = solid(20, 20, [0, 0, 0, 255]);
    for (let i = 0; i < 20 * 20 * maxDifferentPixelRatio; i += 1)
      b.rgba.set([255, 255, 255, 255], i * 4);
    expect(
      compareShotSets(sets({ "plain.png": a }, { "plain.png": b }, { "plain.png": a })),
    ).toEqual([]);
  });

  it("names the pair, the ratio and the limit when shots diverge", () => {
    const a = solid(4, 4, [0, 0, 0, 255]);
    const b = solid(4, 4, [255, 255, 255, 255]);
    expect(
      compareShotSets(sets({ "plain.png": a }, { "plain.png": b }, { "plain.png": a })),
    ).toEqual([
      "plain.png: linux vs macos differ in 100.00% of pixels (limit 5.00%)",
      "plain.png: linux vs windows differ in 100.00% of pixels (limit 5.00%)",
    ]);
  });

  it("flags a shot missing on one platform and a size mismatch", () => {
    const a = solid(4, 4, [0, 0, 0, 255]);
    const taller = solid(4, 5, [0, 0, 0, 255]);
    expect(compareShotSets(sets({ "plain.png": a }, { "plain.png": taller }))).toEqual([
      "plain.png: missing on macos",
      "plain.png: linux is 4×5, windows is 4×4",
      "plain.png: missing on macos",
    ]);
  });
});
