import type { Annex, Crowning, SpriteArt } from "../../kit.ts";
import { along, type Footprint, type Part, type RampKey, type Side } from "../../model.ts";
import type { Role } from "../../texture.ts";
import { anchored, box, filled, type Paint, sameSides, spriteOf, topPainted } from "./shapes.ts";

export const corniceHeight = 5;
export const capStep = 4;
export const fanSector = Math.PI / 9;

export interface Cap {
  readonly parts: Part[];
  readonly top: number;
}

export interface Setback {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly y: number;
  readonly steps: number;
  readonly attic?: boolean | undefined;
  readonly ramp?: RampKey | undefined;
}

export function chevronPaint(): Paint {
  return (brush, width, height) => {
    const r = brush.rect;
    r(0, 0, width, height, "timberDk");
    r(0, 0, width, 1, "trim");
    const band = height - 2;
    for (let x = 0; x < width; x += 1) {
      const turn = x % 4;
      const y = band >= 3 ? (turn === 0 ? 3 : turn === 2 ? 1 : 2) : band === 2 ? 1 + (x & 1) : 1;
      if (band > 1 || !(x & 1)) r(x, y, 1, 1, "trim");
    }
    r(0, height - 1, width, 1, "trimLo");
  };
}

export function capTop(across: number, deep: number, inner: Role = "timberDk") {
  return topPainted(`cap|${inner}`, across, deep, (brush, width, height, grid) => {
    const edge = { x: grid.x === 1 ? 1 : 0, z: grid.z === 1 ? 1 : 0 };
    const rim = { x: edge.x + grid.x, z: edge.z + grid.z };
    brush.rect(0, 0, width, height, "timberDk");
    brush.rect(edge.x, edge.z, width - 2 * edge.x, height - 2 * edge.z, "trimLo");
    brush.rect(rim.x, rim.z, width - 2 * rim.x, height - 2 * rim.z, inner);
  });
}

export function setbackPaint(attic: boolean | undefined, light: Role): Paint {
  return (brush, width, height) => {
    const r = brush.rect;
    r(0, 0, width, height, "plaster");
    r(0, 0, width, 1, "trim");
    r(0, 1, 1, height - 1, "trimLo");
    r(width - 1, 1, 1, height - 1, "trimLo");
    if (attic === undefined) return;
    for (let x = 2; x + 2 <= width - 2; x += 4) r(x, 2, 2, height - 3, attic ? light : "glass");
  };
}

export function cornice(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  tall: number,
  ramp?: RampKey,
): Part {
  return box(x0, x1, y, y + tall, z0, z1, {
    sides: sameSides(chevronPaint(), "chevron"),
    top: capTop(x1 - x0, z1 - z0),
    ramp,
  });
}

export function steppedCap(setback: Setback, light: Role = "lamp"): Cap {
  const { x0, x1, z0, z1 } = setback;
  const parts: Part[] = [cornice(x0 - 1, x1 + 1, z0 - 1, z1 + 1, setback.y, corniceHeight)];
  let y = setback.y + corniceHeight;
  for (let step = 0; step < setback.steps; step += 1) {
    const inset = capStep * (step + 1);
    if (x1 - x0 - 2 * inset < 6 || z1 - z0 - 2 * inset < 6) break;
    const tall = step === 0 ? 6 : 4;
    const attic = step === 0 ? setback.attic : undefined;
    parts.push(
      box(x0 + inset, x1 - inset, y, y + tall, z0 + inset, z1 - inset, {
        sides: sameSides(setbackPaint(attic, light), `setback|${attic}|${light}`),
        top: capTop(x1 - x0 - 2 * inset, z1 - z0 - 2 * inset),
      }),
    );
    y += tall;
  }
  return { parts, top: y };
}

export function sunburst(
  x: number,
  z: number,
  y: number,
  half: number,
  axis: "x" | "z",
  lit: boolean,
  ramp?: RampKey,
): Crowning[] {
  const rings: readonly (readonly [number, number, number])[] = [
    [half, 3, 0],
    [half - 2, 2, 3],
    [half - 4, 2, 5],
  ];
  return rings.flatMap(([reach, tall, rise]) => {
    if (reach < 2) return [];
    const paint = sameSides(fanPaint(lit, rise), `fan|${lit}|${rise}`);
    const shape =
      axis === "x"
        ? box(x - reach, x + reach, y + rise, y + rise + tall, z - 1, z + 1, {
            sides: paint,
            top: filled("trim"),
            ramp,
          })
        : box(x - 1, x + 1, y + rise, y + rise + tall, z - reach, z + reach, {
            sides: paint,
            top: filled("trim"),
            ramp,
          });
    return [{ x, z, part: shape }];
  });
}

export function finial(order: number): SpriteArt {
  const frames = [0, 1].flatMap((wave) =>
    (["lamp", "lampHi"] as const).map((tip) =>
      anchored(`finial|${wave}|${tip}`, -2, -16, 7, 16, (put) => {
        put(-2, -1, 5, 1, "trim");
        put(-1, -3, 3, 2, "trimLo");
        put(0, -14, 1, 11, "trim");
        put(1, -12 + wave, 3, 2, "hue.b");
        put(4, -11 - wave, 1, 2, "hue.b");
        put(1, -12 + wave, 3, 1, "hue.l");
        put(-1, -16, 3, 2, tip);
      }),
    ),
  );
  const cycle = Array.from({ length: 8 }, (_, tick) => {
    const wave = ((tick >> 1) + order) % 2;
    const tip = ((tick >> 2) + order) % 2;
    return wave * 2 + tip;
  });
  return spriteOf(frames, cycle);
}

export function bladeSign(footprint: Footprint, door: Side, height: number, lit: boolean): Annex {
  const a = along(footprint, door, 0, 0);
  const b = along(footprint, door, 4, 2);
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const z0 = Math.min(a.z, b.z);
  const z1 = Math.max(a.z, b.z);
  const paint: Paint = (brush, width, tall) => {
    brush.rect(0, 0, width, tall, "trim");
    if (width < 3) return;
    brush.rect(1, 1, width - 2, tall - 2, lit ? "hue.b" : "hue.d");
    for (let y = 2; y < tall - 2; y += 3) brush.rect(1, y, width - 2, 1, lit ? "hue.h" : "hue.m");
  };
  return {
    what: "blade",
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    parts: [
      box(x0, x1, 7, Math.min(height - 1, 31), z0, z1, {
        sides: sameSides(paint, `blade|${lit}`),
        top: filled("trim"),
      }),
    ],
  };
}

function fanPaint(lit: boolean, rise: number): Paint {
  return (brush, width, height) => {
    if (width < 4) {
      brush.rect(0, 0, width, height, "trim");
      return;
    }
    for (let y = 0; y < height; y += 1) {
      const reach = rise + (height - 1 - y);
      for (let x = 0; x < width; x += 1) {
        const sector = Math.floor(Math.atan2(reach + 0.5, x + 0.5 - width / 2) / fanSector);
        brush.rect(x, y, 1, 1, sector % 2 ? (lit ? "hue.l" : "hue.m") : "trim");
      }
    }
  };
}
