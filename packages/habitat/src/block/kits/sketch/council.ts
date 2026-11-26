import type { Construction, Glow, SpriteArt } from "../../kit.ts";
import type { Footprint, Part } from "../../model.ts";
import type { Brush, Role } from "../../texture.ts";
import {
  anchored,
  box,
  type Paint,
  type Put,
  placed,
  sameSides,
  spriteOf,
  type TopPaint,
  topPainted,
} from "./shapes.ts";
import type { SketchStyle } from "./style.ts";

export const councilTableHeight = 6;
export const councilTableGround: Footprint = { x0: -7, x1: 7, z0: -7, z1: 7 };
export const councilLampRise = 27;
export const lampPoolReach = 22;

export function councilTable(style: SketchStyle, lit: boolean): Construction {
  const look = lookOf(style);
  return {
    parts: [table(look, lit), placed(lamp(look, lit), 0, councilTableHeight, 0)],
    reach: 0,
    ...(lit ? { glow: lampPool } : {}),
  };
}

type Look = "timber" | "neon" | "whitewash" | "deco";

const lampPool: readonly Glow[] = [
  ...poolRows(lampPoolReach, 0.09),
  ...poolRows(lampPoolReach - 8, 0.11),
];

const lampFlicker = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0];

function poolRows(reach: number, alpha: number): Glow[] {
  const rows: Glow[] = [];
  for (let z = -reach; z < reach; z += 2) {
    const half = Math.round(Math.sqrt(reach * reach - (z + 1) * (z + 1)) / 2) * 2;
    if (half > 0) rows.push({ x0: -half, x1: half, z0: z, z1: z + 2, colour: "lamp", alpha });
  }
  return rows;
}

function lookOf(style: SketchStyle): Look {
  if (style.piers) return "deco";
  if (style.ribbon) return "neon";
  return style.awning ? "whitewash" : "timber";
}

function table(look: Look, lit: boolean): Part {
  const { x0, x1, z0, z1 } = councilTableGround;
  return box(x0, x1, 0, councilTableHeight, z0, z1, {
    sides: sameSides(sidePaints[look](lit), `council-side|${look}|${lit}`),
    top: topPainted(`council-top|${look}|${lit}`, x1 - x0, z1 - z0, topPaints[look](lit)),
  });
}

const sidePaints: Readonly<Record<Look, (lit: boolean) => Paint>> = {
  timber: () => (brush, width, height) => {
    brush.rect(0, 0, width, 2, "wood");
    brush.rect(0, 0, width, 1, "woodHi");
    brush.rect(1, 2, 2, height - 2, "woodDk");
    brush.rect(width - 3, 2, 2, height - 2, "woodDk");
    brush.rect(3, 3, width - 6, 1, "woodDk");
  },
  neon: (lit) => (brush, width, height) => {
    brush.rect(0, 0, width, height, "plaster");
    brush.rect(0, 0, width, 1, "plasterHi");
    brush.rect(1, 2, width - 2, 1, lit ? "lamp" : "slateDk");
    brush.rect(0, height - 1, width, 1, "timber");
  },
  whitewash: () => (brush, width, height) => {
    brush.rect(0, 0, width, 2, "wood");
    brush.rect(0, 0, width, 1, "woodHi");
    brush.rect(2, 2, width - 4, height - 2, "plaster");
    brush.rect(2, 2, 1, height - 2, "plasterHi");
    brush.rect(2, height - 1, width - 4, 1, "timberDk");
  },
  deco: () => (brush, width, height) => {
    brush.rect(0, 0, width, height, "stone");
    brush.rect(0, 0, width, 1, "trim");
    brush.rect(0, height - 1, width, 1, "trimLo");
    for (let x = 2; x < width - 2; x += 4) brush.rect(x, 2, 2, height - 4, "trimLo");
  },
};

const topPaints: Readonly<Record<Look, (lit: boolean) => TopPaint>> = {
  timber: (lit) => (brush, across, deep) => {
    brush.rect(0, 0, across, deep, "wood");
    for (let x = 4; x < across - 2; x += 4) brush.rect(x, 0, 2, deep, "woodDk");
    brush.rect(0, 0, across, 2, "woodHi");
    lampLight(brush, across, deep, lit);
  },
  neon: (lit) => (brush, across, deep) => {
    brush.rect(0, 0, across, deep, "plaster");
    brush.rect(2, 2, across - 4, deep - 4, lit ? "lamp" : "slateDk");
    brush.rect(4, 4, across - 8, deep - 8, "timber");
    lampLight(brush, across, deep, lit);
  },
  whitewash: (lit) => (brush, across, deep) => {
    brush.rect(0, 0, across, deep, "woodHi");
    brush.rect(2, 2, across - 4, deep - 4, "wood");
    lampLight(brush, across, deep, lit);
  },
  deco: (lit) => (brush, across, deep) => {
    brush.rect(0, 0, across, deep, "trim");
    brush.rect(2, 2, across - 4, deep - 4, "stone");
    brush.rect(4, 4, across - 8, deep - 8, "trimLo");
    brush.rect(6, 6, across - 12, deep - 12, "trim");
    lampLight(brush, across, deep, lit);
  },
};

function lampLight(brush: Brush, across: number, deep: number, lit: boolean): void {
  if (lit) brush.wash(0, 0, across, deep, "lamp", 0.22);
}

function lamp(look: Look, lit: boolean): SpriteArt {
  const drawn = (flicker: number) =>
    anchored(
      `council-lamp|${look}|${lit}|${flicker}`,
      -6,
      -councilLampRise,
      13,
      councilLampRise,
      (put) => lampArts[look](put, lit ? "lamp" : "glint", lit ? flicker : undefined),
    );
  return lit ? spriteOf([drawn(0), drawn(1)], lampFlicker, 0) : spriteOf([drawn(0)]);
}

type LampArt = (put: Put, glass: Role, flicker: number | undefined) => void;

const lampArts: Readonly<Record<Look, LampArt>> = {
  timber: (put, glass, flicker) => {
    put(-1, -1, 3, 1, "ink");
    put(0, -15, 1, 14, "ink");
    put(-2, -16, 5, 1, "ink");
    put(-3, -23, 7, 7, "ink");
    put(-2, -23, 2, 7, glass);
    put(1, -23, 2, 7, glass);
    put(-3, -24, 7, 1, "ink");
    put(-2, -25, 5, 1, "ink");
    put(0, -27, 1, 2, "ink");
    if (flicker === undefined) return;
    put(-2, -21 + flicker, 2, 3, "lampHi");
    put(1, -21 + flicker, 2, 3, "lampHi");
  },
  neon: (put, glass, flicker) => {
    put(-1, -1, 3, 1, "timber");
    put(0, -15, 1, 14, "timber");
    put(-4, -25, 9, 1, glass);
    put(-4, -16, 9, 1, glass);
    put(-4, -24, 1, 8, glass);
    put(4, -24, 1, 8, glass);
    if (flicker === undefined) return;
    put(-2, -23, 5, 6, "accent");
    put(-1, -22, 3, 4, "lampHi");
    put(-1 + flicker, -21, 2, 2, "paper");
  },
  whitewash: (put, glass, flicker) => {
    put(-1, -1, 3, 1, "timberDk");
    put(0, -15, 1, 14, "timberDk");
    put(-1, -16, 3, 1, "timberDk");
    put(-2, -24, 5, 1, glass);
    put(-3, -23, 7, 6, glass);
    put(-2, -17, 5, 1, glass);
    put(-1, -25, 3, 1, "timberDk");
    if (flicker === undefined) return;
    put(-1, -22 + flicker, 3, 3, "lampHi");
  },
  deco: (put, glass, flicker) => {
    put(-2, -1, 5, 1, "trim");
    put(-1, -2, 3, 1, "trim");
    put(0, -13, 1, 11, "trimLo");
    put(-4, -14, 9, 1, "trim");
    put(-3, -21, 7, 7, glass);
    put(-1, -21, 1, 7, "trim");
    put(1, -21, 1, 7, "trim");
    put(-4, -22, 9, 1, "trim");
    put(-3, -23, 7, 1, "trim");
    put(-2, -24, 5, 1, "trim");
    put(-1, -25, 3, 1, "trim");
    put(0, -27, 1, 2, "trim");
    if (flicker === undefined) return;
    put(-3, -20 + flicker, 2, 4, "lampHi");
    put(0, -20 + flicker, 1, 4, "lampHi");
    put(2, -20 + flicker, 2, 4, "lampHi");
    put(-6, -18, 1, 1, "lamp");
    put(6, -18, 1, 1, "lamp");
    put(-5, -21, 1, 1, "lamp");
    put(5, -21, 1, 1, "lamp");
  },
};
