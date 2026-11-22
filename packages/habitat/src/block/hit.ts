import type { DrawList, Hit, Quad } from "./draw-list.ts";
import { opaqueAt } from "./texture.ts";

export function hitAt(list: DrawList, x: number, y: number): Hit | undefined {
  for (let index = list.quads.length - 1; index >= 0; index -= 1) {
    const quad = list.quads[index];
    if (quad !== undefined && covers(quad, x, y)) return quad.hit;
  }
  return undefined;
}

export function covers(quad: Quad, x: number, y: number): boolean {
  const texel = texelAt(quad, x, y);
  if (texel === undefined) return false;
  return "texture" in quad.paint ? opaqueAt(quad.paint.texture, texel.u, texel.v) : true;
}

export function texelAt(
  quad: Quad,
  x: number,
  y: number,
): { readonly u: number; readonly v: number } | undefined {
  const [a, b, c, d, e, f] = quad.matrix;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9) return undefined;
  const dx = x - e;
  const dy = y - f;
  const u = (d * dx - c * dy) / determinant;
  const v = (a * dy - b * dx) / determinant;
  return u >= 0 && v >= 0 && u < quad.width && v < quad.height ? { u, v } : undefined;
}
