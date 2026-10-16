import { deflateSync } from "node:zlib";
import type { MenuItemModel } from "./menu.ts";
import type { OpenWorkspace } from "./windows.ts";

export interface TrayModel {
  tooltip: string;
  badge: string | undefined;
  menu: readonly MenuItemModel[];
}

export function trayModel(open: readonly OpenWorkspace[]): TrayModel {
  const waiting = open.reduce((sum, entry) => sum + entry.needsYou, 0);
  return {
    tooltip: waiting === 0 ? "keywork" : `keywork · ${needsYouPhrase(waiting)}`,
    badge: waiting === 0 ? undefined : needsYouPhrase(waiting),
    menu: [
      { kind: "action", label: "Open Folder…", action: "open-folder" },
      ...(open.length === 0 ? [] : [{ kind: "separator" } as const]),
      ...open.map(
        (entry): MenuItemModel => ({
          kind: "action",
          label: workspaceLabel(entry),
          action: "open-recent",
          payload: entry.workspace,
        }),
      ),
      { kind: "separator" },
      { kind: "action", label: "Quit", action: "quit" },
    ],
  };
}

export type Ink = "black" | "white";

export interface MarkOptions {
  size: number;
  filled: boolean;
  ink: Ink;
}

export function trayMarkPng(options: MarkOptions): Uint8Array {
  const { size } = options;
  const unit = Math.max(1, Math.round(size / 16));
  const inset = unit;
  const stroke = unit * 2;
  const pixels = new Uint8Array(size * size * 4);
  const tone = options.ink === "black" ? 0 : 255;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (markCovers(x, y, size, inset, stroke, options.filled)) {
        const at = (y * size + x) * 4;
        pixels[at] = tone;
        pixels[at + 1] = tone;
        pixels[at + 2] = tone;
        pixels[at + 3] = 255;
      }
    }
  }
  return encodePng(size, size, pixels);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    raw.set(rgba.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  return concat([
    pngSignature,
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

export function decodePngHeader(png: Uint8Array): { width: number; height: number } | undefined {
  if (png.length < 24 || !pngSignature.every((byte, at) => png[at] === byte)) return undefined;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function needsYouPhrase(waiting: number): string {
  return waiting === 1 ? "1 needs you" : `${waiting} need you`;
}

function workspaceLabel(entry: OpenWorkspace): string {
  const name =
    entry.workspace
      .split(/[\\/]/)
      .filter((part) => part !== "")
      .at(-1) ?? "";
  const base = name === "" ? entry.workspace : `${name}  (${entry.workspace})`;
  return entry.needsYou === 0 ? base : `${base} · ${needsYouPhrase(entry.needsYou)}`;
}

function markCovers(
  x: number,
  y: number,
  size: number,
  inset: number,
  stroke: number,
  filled: boolean,
): boolean {
  const outer = x >= inset && x < size - inset && y >= inset && y < size - inset;
  if (!outer) return false;
  const edge = inset + stroke;
  const ring = x < edge || x >= size - edge || y < edge || y >= size - edge;
  if (ring) return true;
  if (!filled) return false;
  const core = edge + stroke;
  return x >= core && x < size - core && y >= core && y < size - core;
}

const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = new Uint8Array(4 + data.length);
  typed.set([...type].map((char) => char.charCodeAt(0)));
  typed.set(data, 4);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(typed));
  return concat([length, typed, crc]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

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
