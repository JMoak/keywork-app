import type { Quad } from "./draw-list.ts";
import type { Appearance, Kit } from "./kit.ts";
import type { BlockPalette } from "./palette.ts";
import type { Role } from "./texture.ts";

export type SystemColour = "Canvas" | "CanvasText" | "Highlight" | "GrayText";

export type SystemColours = Readonly<Record<SystemColour, string>>;

export const systemColourNames: SystemColours = {
  Canvas: "Canvas",
  CanvasText: "CanvasText",
  Highlight: "Highlight",
  GrayText: "GrayText",
};

export function forcedBlockPalette(
  kit: Kit,
  appearance: Appearance,
  system: SystemColours = systemColourNames,
): BlockPalette {
  return {
    key: `${kit.id}|${appearance}|forced|${Object.values(system).join(",")}`,
    appearance,
    colours: kit.colours[appearance],
    background: system.Canvas,
    haze: system.Canvas,
    edge: system.CanvasText,
    colourOf: (role) => system[forcedColourOf(role)],
  };
}

export function forcedColourOf(role: Role): SystemColour {
  const [owned = role] = role.split("#");
  const [under = owned] = owned.split("~");
  const mixed = /^(.*)>([^>@]+)@([\d.]+)$/.exec(under);
  if (mixed !== null) return mixed[2] === "ink" ? "CanvasText" : forcedColourOf(mixed[1] ?? "");
  return forcedRoles[under] ?? "Canvas";
}

export function outlined(quad: Quad, palette: BlockPalette): boolean {
  return palette.edge !== undefined && quad.light !== undefined;
}

export function onTheRim(quad: Quad, u: number, v: number): boolean {
  return u === 0 || v === 0 || u === Math.ceil(quad.width) - 1 || v === Math.ceil(quad.height) - 1;
}

export const forcedRoles: Readonly<Record<Role, SystemColour>> = {
  ink: "CanvasText",
  timber: "CanvasText",
  timberDk: "CanvasText",
  woodDk: "CanvasText",
  slateDk: "CanvasText",
  err: "CanvasText",
  gold: "CanvasText",
  goldHi: "CanvasText",
  goldDk: "CanvasText",
  "hue.d": "CanvasText",
  lamp: "Highlight",
  "glow.l": "Highlight",
  "glow.h": "Highlight",
  lampHi: "Highlight",
  pool: "Highlight",
  accent: "Highlight",
  chalk: "GrayText",
  star: "GrayText",
  smoke: "GrayText",
  path: "GrayText",
  pathLo: "GrayText",
  cobble: "GrayText",
  cobbleLo: "GrayText",
  grassLo: "GrayText",
  soilLo: "GrayText",
  rockLo: "GrayText",
};
