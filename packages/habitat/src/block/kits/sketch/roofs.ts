import type { Part, RampKey, Side } from "../../model.ts";
import type { Role } from "../../texture.ts";
import { box, filled, type Paint, painted } from "./shapes.ts";

export type RoofKind = "gx" | "gz" | "hip";

export interface Roof {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly y: number;
  readonly kind: RoofKind;
  readonly tread: number;
  readonly gable: Role;
  readonly ramp?: RampKey | undefined;
  readonly loft?: { readonly at: number; readonly lit: boolean } | undefined;
}

export const stepHeight = 2;
export const stepLimit = 31;

export function roofParts(roof: Roof): Part[] {
  const parts: Part[] = [];
  let x0 = roof.x0;
  let x1 = roof.x1;
  let z0 = roof.z0;
  let z1 = roof.z1;
  for (let step = 0; step < stepLimit && x1 > x0 && z1 > z0; step += 1) {
    const y = roof.y + step * stepHeight;
    const sides = (side: Side, width: number, height: number) =>
      gabled(roof.kind, side)
        ? painted(
            `gable|${roof.gable}|${loftOf(roof, step, width)}`,
            width,
            height,
            gablePaint(roof, step),
          )
        : painted(
            `slope|${step % 2}|${dormerOf(roof, step, width)}`,
            width,
            height,
            slopePaint(step, dormerOf(roof, step, width)),
          );
    parts.push(
      box(x0, x1, y, y + stepHeight, z0, z1, { sides, top: filled("hue.l"), ramp: roof.ramp }),
    );
    if (roof.kind !== "gz") {
      z0 += roof.tread;
      z1 -= roof.tread;
    }
    if (roof.kind !== "gx") {
      x0 += roof.tread;
      x1 -= roof.tread;
    }
  }
  return parts;
}

function gabled(kind: RoofKind, side: Side): boolean {
  if (kind === "gx") return side === "px" || side === "nx";
  if (kind === "gz") return side === "pz" || side === "nz";
  return false;
}

function loftOf(roof: Roof, step: number, width: number): string {
  const loft = roof.loft;
  if (loft === undefined || width <= 12 || (step !== loft.at && step !== loft.at + 1))
    return "none";
  return loft.lit ? "lit" : "dark";
}

function dormerOf(roof: Roof, step: number, width: number): boolean {
  return roof.kind === "hip" && loftOf(roof, step, width) === "lit";
}

function slopePaint(step: number, dormer: boolean): Paint {
  return (brush, width, height) => {
    brush.rect(0, 0, width, 1, "hue.b");
    brush.rect(0, 1, width, height - 1, "hue.m");
    for (let x = (step % 2) * 3 + 1; x < width; x += 6) brush.rect(x, 0, 1, 1, "hue.l");
    if (dormer) brush.rect((width >> 1) - 2, 0, 4, height, "lamp");
  };
}

function gablePaint(roof: Roof, step: number): Paint {
  return (brush, width, height) => {
    brush.rect(0, 0, width, height, roof.gable);
    brush.rect(0, 0, 2, height, "hue.d");
    brush.rect(width - 2, 0, 2, height, "hue.d");
    const loft = loftOf(roof, step, width);
    if (loft !== "none") {
      brush.rect((width >> 1) - 2, 0, 4, height, loft === "lit" ? "lamp" : "glass");
    }
  };
}
