import type { Slug } from "../world/types.ts";
import type { IndexedTexture, Role } from "./texture.ts";

export const cellPitch = 56;
export const halfCell = cellPitch / 2;
export const topTexel = 2;
export const tickMs = 125;

export const sides = ["pz", "px", "nz", "nx"] as const;

export type Side = (typeof sides)[number];

export type FaceKey = Side | "top";

export type QuadPaint = { readonly texture: IndexedTexture } | { readonly fill: Role };

export type FacePaint =
  | { readonly texture: IndexedTexture; readonly sideOn?: IndexedTexture }
  | { readonly fill: Role };

export interface Grid {
  readonly x: number;
  readonly z: number;
}

export const frontOnGrid: Grid = { x: 1, z: topTexel };
export const sideOnGrid: Grid = { x: topTexel, z: 1 };

export type RampKey = string;

export interface Footprint {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

export interface Box extends Footprint {
  readonly y0: number;
  readonly y1: number;
  readonly faces: Readonly<Partial<Record<FaceKey, FacePaint>>>;
  readonly meanings?: Readonly<Partial<Record<Side, string>>>;
  readonly ramp?: RampKey;
}

export interface Sprite {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly frames: readonly IndexedTexture[];
  readonly left: number;
  readonly top: number;
  readonly sequence: readonly number[];
  readonly phase: number;
  readonly rest: number | undefined;
  readonly ramp?: RampKey;
}

export type Part = { readonly box: Box } | { readonly sprite: Sprite };

export type Target =
  | { readonly kind: "creature"; readonly creature: Slug }
  | { readonly kind: "workshop"; readonly creature: Slug }
  | { readonly kind: "shed"; readonly creature: Slug; readonly project: string }
  | { readonly kind: "house" }
  | { readonly kind: "storehouse" }
  | { readonly kind: "mill"; readonly mill: string };

export interface CrownPart {
  readonly x: number;
  readonly z: number;
  readonly part: Part;
}

export interface Item {
  readonly what: string;
  readonly x: number;
  readonly z: number;
  readonly parts: readonly Part[];
  readonly crown?: readonly CrownPart[];
  readonly ramp?: RampKey;
  readonly target?: Target;
}

export interface Walker {
  readonly what: string;
  readonly path: readonly Point[];
  readonly phase: number;
  readonly pace: number;
  readonly parts: readonly Part[];
  readonly ramp?: RampKey;
  readonly target?: Target;
}

export interface Plot {
  readonly cell: { readonly cx: number; readonly cz: number };
  readonly ground: Footprint;
  readonly door: Side;
  readonly beside: number;
}

export interface CastMember {
  readonly slug: Slug;
  readonly order: number;
  readonly home: Plot;
  readonly stands: Plot;
  readonly road: readonly Point[];
  readonly still: boolean;
  readonly parts: readonly Part[];
  readonly ramp: RampKey;
}

export interface Stand extends Point {
  readonly stride?: number;
}

export type Standing = ReadonlyMap<Slug, Stand>;

export interface Staging {
  readonly standing?: Standing | undefined;
  readonly lifts?: ReadonlyMap<string, number> | undefined;
}

export interface Cell {
  readonly cx: number;
  readonly cz: number;
  readonly land: boolean;
  readonly fog: number;
  readonly ground: readonly Box[];
  readonly items: readonly Item[];
}

export interface WorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly height: number;
  readonly slab: number;
}

export interface BlockWorld {
  readonly cells: readonly Cell[];
  readonly walkers: readonly Walker[];
  readonly cast: readonly CastMember[];
  readonly bounds: WorldBounds;
}

export interface Point {
  readonly x: number;
  readonly z: number;
}

export function cellKey(cell: { readonly cx: number; readonly cz: number }): string {
  return `${cell.cx},${cell.cz}`;
}

export function cellCenter(cx: number, cz: number): Point {
  return { x: cx * cellPitch, z: cz * cellPitch };
}

export function cellAt(x: number, z: number): { readonly cx: number; readonly cz: number } {
  return { cx: Math.floor((x + halfCell) / cellPitch), cz: Math.floor((z + halfCell) / cellPitch) };
}

export function identityRamp(identity: number): RampKey {
  return `identity:${identity}`;
}

export function identityOfRamp(ramp: RampKey | undefined): number | undefined {
  const match = ramp === undefined ? null : /^identity:(\d+)$/.exec(ramp);
  return match === null ? undefined : Number(match[1]);
}

export function turnedAbout(part: Part): Part {
  if ("sprite" in part) return { sprite: { ...part.sprite, x: -part.sprite.x, z: -part.sprite.z } };
  const { box } = part;
  const about: Readonly<Record<FaceKey, FaceKey>> = {
    pz: "nz",
    nz: "pz",
    px: "nx",
    nx: "px",
    top: "top",
  };
  const faces: Partial<Record<FaceKey, FacePaint>> = {};
  for (const [key, paint] of Object.entries(box.faces)) faces[about[key as FaceKey]] = paint;
  return { box: { ...box, x0: -box.x1, x1: -box.x0, z0: -box.z1, z1: -box.z0, faces } };
}

export function movedBox(box: Box, dx: number, dz: number, dy = 0): Box {
  return {
    ...box,
    x0: box.x0 + dx,
    x1: box.x1 + dx,
    y0: box.y0 + dy,
    y1: box.y1 + dy,
    z0: box.z0 + dz,
    z1: box.z1 + dz,
  };
}

export function movedPart(part: Part, dx: number, dz: number, dy = 0): Part {
  return "box" in part
    ? { box: movedBox(part.box, dx, dz, dy) }
    : {
        sprite: {
          ...part.sprite,
          x: part.sprite.x + dx,
          y: part.sprite.y + dy,
          z: part.sprite.z + dz,
        },
      };
}

export function along(footprint: Footprint, side: Side, offset: number, out: number): Point {
  switch (side) {
    case "pz":
      return { x: footprint.x0 + offset, z: footprint.z1 + out };
    case "nz":
      return { x: footprint.x1 - offset, z: footprint.z0 - out };
    case "px":
      return { x: footprint.x1 + out, z: footprint.z1 - offset };
    case "nx":
      return { x: footprint.x0 - out, z: footprint.z0 + offset };
  }
}

export function wallLength(footprint: Footprint, side: Side): number {
  return side === "pz" || side === "nz" ? footprint.x1 - footprint.x0 : footprint.z1 - footprint.z0;
}

export function sideAfter(side: Side, steps: number): Side {
  return sides[(sides.indexOf(side) + steps + sides.length * 4) % sides.length] ?? side;
}

export function stillSprite(
  frame: IndexedTexture,
  left: number,
  top: number,
): Omit<Sprite, "x" | "y" | "z" | "phase"> {
  return { frames: [frame], left, top, sequence: [], rest: undefined };
}
