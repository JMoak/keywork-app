import { mulberry32, type Random } from "../../../clock/random.ts";
import type { SpriteArt } from "../../kit.ts";
import {
  type Box,
  type FaceKey,
  type FacePaint,
  type Part,
  type RampKey,
  type Side,
  type Sprite,
  sides,
  topTexel,
} from "../../model.ts";
import {
  type Brush,
  type IndexedTexture,
  paintTexture,
  type Role,
  textureMemo,
} from "../../texture.ts";

export type Paint = (brush: Brush, width: number, height: number) => void;

export type SidePaint = (side: Side, width: number, height: number) => FacePaint;

export interface BoxPaints {
  readonly sides?: SidePaint | undefined;
  readonly only?: readonly Side[] | undefined;
  readonly top?: FacePaint | undefined;
  readonly meanings?: Readonly<Partial<Record<Side, string>>> | undefined;
  readonly ramp?: RampKey | undefined;
}

export const memo = textureMemo(4096);

export function painted(key: string, width: number, height: number, paint: Paint): FacePaint {
  return {
    texture: memo(`${key}|${width}x${height}`, () =>
      paintTexture(width, height, (brush) => paint(brush, width, height)),
    ),
  };
}

export function filled(role: Role): FacePaint {
  return { fill: role };
}

export function sameSides(paint: Paint, key: string): SidePaint {
  return (_side, width, height) => painted(key, width, height, paint);
}

export function fillSides(role: Role): SidePaint {
  return () => filled(role);
}

export function box(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  paints: BoxPaints,
): Part {
  const faces: Partial<Record<FaceKey, FacePaint>> = {};
  for (const side of paints.only ?? sides) {
    if (paints.sides === undefined) continue;
    const across = side === "pz" || side === "nz" ? x1 - x0 : z1 - z0;
    faces[side] = paints.sides(side, across, y1 - y0);
  }
  if (paints.top !== undefined) faces.top = paints.top;
  const shaped: Box = {
    x0,
    x1,
    y0,
    y1,
    z0,
    z1,
    faces,
    ...(paints.meanings === undefined ? {} : { meanings: paints.meanings }),
    ...(paints.ramp === undefined ? {} : { ramp: paints.ramp }),
  };
  return { box: shaped };
}

export function topPainted(key: string, across: number, deep: number, paint: Paint): FacePaint {
  return painted(`top|${key}`, across / topTexel, deep / topTexel, (brush, width, height) =>
    paint(halved(brush), width * topTexel, height * topTexel),
  );
}

export type Put = (x: number, y: number, width: number, height: number, role: Role) => void;

export interface Anchored {
  readonly texture: IndexedTexture;
  readonly left: number;
  readonly top: number;
}

export function anchored(
  key: string,
  left: number,
  top: number,
  width: number,
  height: number,
  draw: (put: Put) => void,
): Anchored {
  const texture = memo(`sprite|${key}|${left},${top},${width}x${height}`, () =>
    paintTexture(width, height, (brush) =>
      draw((x, y, w, h, role) => brush.rect(x - left, y - top, w, h, role)),
    ),
  );
  return { texture, left, top };
}

export function spriteOf(
  frames: readonly Anchored[],
  sequence: readonly number[] = [],
  rest: number | undefined = undefined,
): SpriteArt {
  const first = frames[0];
  return {
    frames: frames.map((frame) => frame.texture),
    left: first?.left ?? 0,
    top: first?.top ?? 0,
    sequence,
    rest,
  };
}

export function placed(art: SpriteArt, x: number, y: number, z: number, phase = 0): Part {
  const sprite: Sprite = { x, y, z, ...art, phase };
  return { sprite };
}

export function sketchRandom(seed: number): Random {
  return mulberry32(seed);
}

export function truncated(value: number): number {
  return value | 0;
}

function halved(brush: Brush): Brush {
  const scale = (value: number): number => value / topTexel;
  return {
    width: brush.width * topTexel,
    height: brush.height * topTexel,
    rect: (x, y, w, h, role) => brush.rect(scale(x), scale(y), scale(w), scale(h), role),
    dot: (x, y, role) => brush.rect(scale(x), scale(y), scale(2), scale(2), role),
    erase: (x, y, w, h) => brush.erase(scale(x), scale(y), scale(w), scale(h)),
    wash: (x, y, w, h, role, alpha) =>
      brush.wash(scale(x), scale(y), scale(w), scale(h), role, alpha),
  };
}
