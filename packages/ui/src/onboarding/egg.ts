import { type Palette, type PaletteSource, paletteRoles } from "@keywork-app/habitat/render";
import type { PaintSurface } from "../panes/stead/habitat-render.ts";
import art from "./egg.json";

export type EggFrame =
  | "rest"
  | "tilt-left"
  | "tilt-right"
  | "squash"
  | "crack"
  | "split"
  | "glow"
  | "open"
  | "shell-cap"
  | "fragments";

export interface RoleSprite {
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
}

export interface Shard extends RoleSprite {
  readonly left: number;
  readonly top: number;
}

export type RoleColours = Readonly<Record<string, string>>;

const emptyRole = ".";
const bodyRole = "m";
const lightRole = "0";
const forcedLight = "Highlight";

export const eggHeight: number = art.h;
export const midToneShare = 0.5;

export function eggSprite(frame: EggFrame): RoleSprite {
  return { width: art.w, height: art.h, rows: art.frames[art.names.indexOf(frame)] ?? [] };
}

export const eggGroundLine = lowestRow(eggSprite("rest")) + 1;
export const eggCentre = centreColumn(eggSprite("rest"));

export function cropped(sprite: RoleSprite): Shard {
  return shardOf(sprite, pixelsOf(sprite));
}

export function shardsOf(sprite: RoleSprite): Shard[] {
  const loose = new Set(pixelsOf(sprite).map(([x, y]) => keyOf(x, y)));
  const shards: Shard[] = [];
  for (const start of [...loose]) {
    if (!loose.has(start)) continue;
    const piece = connectedFrom(start, loose);
    shards.push(shardOf(sprite, piece));
  }
  return shards.sort((a, b) => a.left - b.left);
}

export function eggColours(
  coat: Palette,
  source: Pick<PaletteSource, "mix">,
  forcedColors: boolean,
): RoleColours {
  const shadow = toneOf(coat, "identity shadow");
  const base = toneOf(coat, "identity base");
  return {
    o: toneOf(coat, "outline"),
    d: shadow,
    m: forcedColors ? base : source.mix(base, shadow, midToneShare),
    b: base,
    l: toneOf(coat, "identity light"),
    h: toneOf(coat, "identity highlight"),
    [lightRole]: lightColour(forcedColors),
  };
}

export function toneOf(palette: Palette, role: string): string {
  const index = paletteRoles.find((held) => held.role === role)?.index;
  return (index === undefined ? undefined : palette[index]) ?? "";
}

export function lightColour(forcedColors: boolean): string {
  return forcedColors ? forcedLight : art.fixed[lightRole];
}

export function paintRoles(
  surface: PaintSurface,
  sprite: RoleSprite,
  colours: RoleColours,
  zoom: number,
  left: number,
  top: number,
  thin = false,
): void {
  sprite.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const role = row[x] ?? emptyRole;
      const run = thin ? 1 : runFrom(row, x);
      if (role !== emptyRole && !(thin && (x + y) % 2 === 1)) {
        surface.fillStyle = colours[role] ?? colours[bodyRole] ?? "";
        surface.fillRect(left + x * zoom, top + y * zoom, run * zoom, zoom);
      }
      x += run;
    }
  });
}

type Pixel = readonly [x: number, y: number];

function runFrom(row: string, from: number): number {
  let run = 1;
  while (from + run < row.length && row[from + run] === row[from]) run += 1;
  return run;
}

function pixelsOf(sprite: RoleSprite): Pixel[] {
  return sprite.rows.flatMap((row, y) =>
    [...row].flatMap((role, x): Pixel[] => (role === emptyRole ? [] : [[x, y]])),
  );
}

function lowestRow(sprite: RoleSprite): number {
  return Math.max(...pixelsOf(sprite).map(([, y]) => y));
}

function centreColumn(sprite: RoleSprite): number {
  const columns = pixelsOf(sprite).map(([x]) => x);
  return Math.round((Math.min(...columns) + Math.max(...columns) + 1) / 2);
}

function shardOf(sprite: RoleSprite, pixels: readonly Pixel[]): Shard {
  const left = Math.min(...pixels.map(([x]) => x));
  const top = Math.min(...pixels.map(([, y]) => y));
  const width = Math.max(...pixels.map(([x]) => x)) - left + 1;
  const height = Math.max(...pixels.map(([, y]) => y)) - top + 1;
  const held = new Set(pixels.map(([x, y]) => keyOf(x, y)));
  const rows = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      held.has(keyOf(left + x, top + y))
        ? (sprite.rows[top + y]?.[left + x] ?? emptyRole)
        : emptyRole,
    ).join(""),
  );
  return { left, top, width, height, rows };
}

function connectedFrom(start: number, loose: Set<number>): Pixel[] {
  const piece: Pixel[] = [];
  const waiting = [start];
  loose.delete(start);
  while (waiting.length > 0) {
    const key = waiting.pop() as number;
    const x = key % keyStride;
    const y = Math.floor(key / keyStride);
    piece.push([x, y]);
    for (const [dx, dy] of neighbours) {
      const next = keyOf(x + dx, y + dy);
      if (x + dx < 0 || !loose.delete(next)) continue;
      waiting.push(next);
    }
  }
  return piece;
}

const keyStride = 1024;

function keyOf(x: number, y: number): number {
  return y * keyStride + x;
}

const neighbours: readonly Pixel[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
