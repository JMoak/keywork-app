import { deflateSync, inflateSync } from "node:zlib";
import type { Raster } from "./habitat-render.ts";

export function decodePng(bytes: Uint8Array): Raster {
  if (!signature.every((byte, index) => bytes[index] === byte)) throw new Error("not a PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const data: Uint8Array[] = [];
  let width = 0;
  let height = 0;
  let offset = signature.length;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      if (body[8] !== 8 || body[9] !== 6) throw new Error("only 8-bit RGBA PNGs are read here");
    }
    if (type === "IDAT") data.push(body);
    if (type === "IEND") break;
    offset += 12 + length;
  }
  const raw = new Uint8Array(inflateSync(concat(data)));
  return { width, height, rgba: unfilter(raw, width * 4, height) };
}

export function differingPixels(a: Raster, b: Raster): number | undefined {
  if (a.width !== b.width || a.height !== b.height) return undefined;
  let differing = 0;
  for (let offset = 0; offset < a.rgba.length; offset += 4) {
    for (let channel = 0; channel < 4; channel += 1) {
      if (a.rgba[offset + channel] !== b.rgba[offset + channel]) {
        differing += 1;
        break;
      }
    }
  }
  return differing;
}

export function encodePng(raster: Raster): Uint8Array {
  const { width, height, rgba } = raster;
  const stride = width * 4;
  const filtered = new Uint8Array((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    filtered[row * (stride + 1)] = 0;
    filtered.set(rgba.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(filtered))),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = new Uint8Array(4 + data.length);
  typed.set(
    [...type].map((letter) => letter.charCodeAt(0)),
    0,
  );
  typed.set(data, 4);
  const out = new Uint8Array(8 + data.length + 4);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(typed, 4);
  view.setUint32(8 + data.length, crc32(typed));
  return out;
}

function unfilter(raw: Uint8Array, stride: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(stride * height);
  const bpp = 4;
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
    case 4: {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      if (pa <= pb && pa <= pc) return a;
      return pb <= pc ? b : c;
    }
    default:
      throw new Error(`unsupported PNG filter ${filter}`);
  }
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
