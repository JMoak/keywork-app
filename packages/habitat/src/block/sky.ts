import { mulberry32 } from "../clock/random.ts";
import type { View } from "./draw-list.ts";
import type { KitColours } from "./kit.ts";
import type { Role } from "./texture.ts";

export interface Backdrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly role: Role;
  readonly dither: boolean;
}

export interface Light {
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
  readonly role: Role;
}

export const orbRadius = 14;
export const starCount = 40;
export const fireflyCount = 10;

export function skyRole(stop: number): Role {
  return `sky.${stop}`;
}

export function backdropOf(colours: KitColours, view: View): Backdrop[] {
  const { width: w, height: h, scale: s } = view;
  const rects: Backdrop[] = [];
  const centreX = Math.round(w / 2 / s) * s;
  const centreY = Math.round((h * 0.54) / s) * s;
  const oval = (rx: number, ry: number, role: Role, dither: boolean): void => {
    for (let y = Math.ceil((centreY - ry) / s) * s; y < centreY + ry; y += s) {
      const dy = (y + s / 2 - centreY) / ry;
      if (dy <= -1 || dy >= 1) continue;
      const half = Math.round((rx * Math.sqrt(1 - dy * dy)) / s) * s;
      if (half > 0) rects.push({ x: centreX - half, y, width: half * 2, height: s, role, dither });
    }
  };
  const stops = colours.sky.length;
  for (let stop = 0; stop < stops; stop += 1) {
    const share = 1 - stop / (stops + 0.8);
    const rx = w * 0.44 * share;
    const ry = h * 0.42 * share;
    oval(rx * 1.07, ry * 1.09, skyRole(stop), true);
    oval(rx, ry, skyRole(stop), false);
  }
  if (colours.orb !== undefined) {
    const ox = Math.round((w * 0.27) / s);
    const oy = Math.round((h * 0.2) / s);
    for (let d = -orbRadius; d < orbRadius; d += 1) {
      if (colours.orbSlit && d > 1 && d % 4 >= 2) continue;
      const half = Math.round(Math.sqrt(orbRadius * orbRadius - (d + 0.5) * (d + 0.5)));
      rects.push({
        x: (ox - half) * s,
        y: (oy + d) * s,
        width: half * 2 * s,
        height: s,
        role: "orb",
        dither: false,
      });
    }
  }
  if (colours.star !== undefined) {
    const random = mulberry32(7);
    const size = Math.max(1, s >> 1);
    for (let star = 0; star < starCount; star += 1) {
      const x = Math.floor((random() * w) / s) * s;
      const y = Math.floor((random() * h * 0.62) / s) * s;
      rects.push({ x, y, width: size, height: size, role: "star", dither: false });
    }
  }
  return rects;
}

export function firefliesOf(
  colours: KitColours,
  view: View,
  pivotY: number,
  tick: number,
): Light[] {
  if (colours.pool === undefined) return [];
  const random = mulberry32(11);
  const across = view.width / view.scale;
  const down = view.height / view.scale;
  return Array.from({ length: fireflyCount }, (_, index) => {
    const bx = (random() - 0.5) * across * 0.6;
    const by = (random() - 0.7) * down * 0.34;
    return {
      x: Math.round(across / 2 + bx + Math.sin(tick * 0.06 + index * 1.9) * 7),
      y: Math.round(pivotY + by + Math.cos(tick * 0.045 + index * 2.3) * 5),
      alpha: 0.4 + 0.3 * Math.sin(tick * 0.25 + index * 1.3),
      role: "lampHi",
    };
  });
}
