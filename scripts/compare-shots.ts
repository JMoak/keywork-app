import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { repoRoot, reportViolations } from "./lib/repo-files.ts";

export const maxDifferentPixelRatio = 0.05;
export const channelTolerance = 24;
export const shotsRoot = join(repoRoot, "artifacts", "shots");

export interface Image {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export type ShotSets = ReadonlyMap<string, ReadonlyMap<string, Image>>;

export function compareShotSets(sets: ShotSets, tolerance = maxDifferentPixelRatio): string[] {
  const findings: string[] = [];
  const platforms = [...sets.keys()].sort();
  const names = new Set(platforms.flatMap((platform) => [...(sets.get(platform)?.keys() ?? [])]));
  for (const name of [...names].sort()) {
    for (const [left, right] of pairs(platforms)) {
      const a = sets.get(left)?.get(name);
      const b = sets.get(right)?.get(name);
      if (a === undefined || b === undefined) {
        findings.push(`${name}: missing on ${a === undefined ? left : right}`);
        continue;
      }
      const ratio = differingPixelRatio(a, b);
      if (ratio === undefined) {
        findings.push(
          `${name}: ${left} is ${a.width}×${a.height}, ${right} is ${b.width}×${b.height}`,
        );
      } else if (ratio > tolerance) {
        findings.push(
          `${name}: ${left} vs ${right} differ in ${percent(ratio)} of pixels (limit ${percent(tolerance)})`,
        );
      }
    }
  }
  return findings;
}

export function differingPixelRatio(
  a: Image,
  b: Image,
  perChannel = channelTolerance,
): number | undefined {
  if (a.width !== b.width || a.height !== b.height) return undefined;
  const pixels = a.width * a.height;
  if (pixels === 0) return 0;
  let differing = 0;
  for (let offset = 0; offset < a.rgba.length; offset += 4) {
    if (pixelDiffers(a.rgba, b.rgba, offset, perChannel)) differing += 1;
  }
  return differing / pixels;
}

export function decodePng(bytes: Uint8Array): Image {
  const header = readHeader(bytes);
  const compressed = concat(chunksOf(bytes, "IDAT"));
  const raw = new Uint8Array(inflateSync(compressed));
  const channels = channelsOf(header.colorType);
  const stride = header.width * channels;
  const pixels = unfilter(raw, stride, channels, header.height);
  return { width: header.width, height: header.height, rgba: toRgba(pixels, channels) };
}

export async function readShotSets(root: string): Promise<ShotSets> {
  const sets = new Map<string, Map<string, Image>>();
  for (const platform of await directoriesIn(root)) {
    const shots = new Map<string, Image>();
    for (const file of await readdir(join(root, platform))) {
      if (!file.endsWith(".png")) continue;
      shots.set(file, decodePng(new Uint8Array(await readFile(join(root, platform, file)))));
    }
    sets.set(platform, shots);
  }
  return sets;
}

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

interface Header {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
}

function readHeader(bytes: Uint8Array): Header {
  if (!pngSignature.every((byte, index) => bytes[index] === byte)) {
    throw new Error("not a PNG");
  }
  const [ihdr] = chunksOf(bytes, "IHDR");
  if (ihdr === undefined) throw new Error("PNG without IHDR");
  const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
  const header = {
    width: view.getUint32(0),
    height: view.getUint32(4),
    bitDepth: ihdr[8] ?? 0,
    colorType: ihdr[9] ?? 0,
    interlace: ihdr[12] ?? 0,
  };
  if (header.bitDepth !== 8 || header.interlace !== 0) {
    throw new Error("only 8-bit non-interlaced PNGs are supported");
  }
  return header;
}

function chunksOf(bytes: Uint8Array, wanted: string): Uint8Array[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found: Uint8Array[] = [];
  let offset = pngSignature.length;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === wanted) found.push(bytes.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") break;
    offset += 12 + length;
  }
  return found;
}

function channelsOf(colorType: number): number {
  switch (colorType) {
    case 0:
      return 1;
    case 2:
      return 3;
    case 4:
      return 2;
    case 6:
      return 4;
    default:
      throw new Error(`unsupported PNG color type ${colorType}`);
  }
}

function unfilter(raw: Uint8Array, stride: number, bpp: number, height: number): Uint8Array {
  const out = new Uint8Array(stride * height);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)] ?? 0;
    const source = row * (stride + 1) + 1;
    const target = row * stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[source + i] ?? 0;
      const a = i >= bpp ? (out[target + i - bpp] ?? 0) : 0;
      const b = row > 0 ? (out[target - stride + i] ?? 0) : 0;
      const c = row > 0 && i >= bpp ? (out[target - stride + i - bpp] ?? 0) : 0;
      out[target + i] = (x + predictor(filter, a, b, c)) & 0xff;
    }
  }
  return out;
}

function predictor(filter: number, a: number, b: number, c: number): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return a;
    case 2:
      return b;
    case 3:
      return Math.floor((a + b) / 2);
    case 4:
      return paeth(a, b, c);
    default:
      throw new Error(`unsupported PNG filter ${filter}`);
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function toRgba(pixels: Uint8Array, channels: number): Uint8Array {
  if (channels === 4) return pixels;
  const count = pixels.length / channels;
  const rgba = new Uint8Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const source = i * channels;
    const gray = channels < 3;
    rgba[i * 4] = pixels[source] ?? 0;
    rgba[i * 4 + 1] = gray ? (pixels[source] ?? 0) : (pixels[source + 1] ?? 0);
    rgba[i * 4 + 2] = gray ? (pixels[source] ?? 0) : (pixels[source + 2] ?? 0);
    rgba[i * 4 + 3] = channels % 2 === 0 ? (pixels[source + channels - 1] ?? 255) : 255;
  }
  return rgba;
}

function pixelDiffers(a: Uint8Array, b: Uint8Array, offset: number, perChannel: number): boolean {
  for (let channel = 0; channel < 4; channel += 1) {
    if (Math.abs((a[offset + channel] ?? 0) - (b[offset + channel] ?? 0)) > perChannel) return true;
  }
  return false;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

function pairs<T>(items: readonly T[]): [T, T][] {
  return items.flatMap((left, index) =>
    items.slice(index + 1).map((right): [T, T] => [left, right]),
  );
}

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(2)}%`;
}

async function directoriesIn(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

if (import.meta.main) {
  const root = process.argv[2] ?? shotsRoot;
  const sets = await readShotSets(root);
  const shots = [...sets.values()].reduce((total, set) => total + set.size, 0);
  process.exitCode = reportViolations(
    {
      check: "compare:shots",
      heading: `Screenshots differ across platforms beyond font fallback (limit ${percent(maxDifferentPixelRatio)} of pixels):`,
      scanned: `${sets.size} platforms, ${shots} shots under ${root}`,
    },
    compareShotSets(sets),
  );
}
