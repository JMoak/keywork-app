import type { WorkshopFamily } from "../place/architecture.ts";
import type { IndexedFrame } from "../skins/atlas.ts";
import { fog, groundBase, groundHighlight, groundLight, groundShadow } from "../skins/legend.ts";
import { courtyardSize } from "../skins/world/courtyards/drawing.ts";
import { orchardTerrace, quarrySteps, tidalInlet } from "../skins/world/courtyards/landscapes.ts";
import { type Palette, type PaletteSource, resolvePalette } from "./palette.ts";
import { blitInto } from "./raster.ts";
import { type WorkshopFrameOptions, workshopFrame } from "./workshop.ts";

export const courtyardLayout = {
  ...courtyardSize,
  workshop: { x: 20, y: 31 },
  resident: { x: 96, y: 66 },
} as const;

export type CourtyardSetting = "orchard" | "quarry" | "inlet";

export function courtyardSettingOf(address: number): CourtyardSetting {
  if (!Number.isSafeInteger(address) || address < 0)
    throw new RangeError("A courtyard needs a nonnegative integer address.");
  return settings[address % settings.length] as CourtyardSetting;
}

export function courtyardFrame(
  address: number,
  family: WorkshopFamily,
  options: WorkshopFrameOptions = {},
): IndexedFrame {
  const { width, height, workshop } = courtyardLayout;
  const indices = landscapes[courtyardSettingOf(address)].indices.slice();
  blitInto(indices, width, height, { ...workshop, frame: workshopFrame(family, options) });
  return { width, height, indices };
}

export function courtyardPalette(
  source: PaletteSource,
  address: number,
  forcedColors = false,
): Palette {
  const base = resolvePalette(source, { world: true, forcedColors });
  if (forcedColors) return base;
  const pigment = source.read(terrainToken[courtyardSettingOf(address)]);
  const ground = source.mix(base[groundBase] as string, pigment, 0.32);
  const paper = source.read(source.appearance === "dark" ? "--kw-text" : "--kw-background");
  const palette = [...base];
  palette[groundShadow] = source.mix(ground, source.read("--kw-terminal-black"), 0.42);
  palette[groundBase] = ground;
  palette[groundLight] = source.mix(ground, paper, 0.24);
  palette[groundHighlight] = source.mix(ground, paper, 0.55);
  palette[fog] = source.mix(source.read("--kw-panel"), pigment, 0.16);
  return palette;
}

const settings = ["orchard", "quarry", "inlet"] as const;
const terrainToken = {
  orchard: "--kw-success",
  quarry: "--kw-terminal-yellow",
  inlet: "--kw-terminal-cyan",
} satisfies Record<CourtyardSetting, string>;
const landscapes = {
  orchard: orchardTerrace(),
  quarry: quarrySteps(),
  inlet: tidalInlet(),
} satisfies Record<CourtyardSetting, IndexedFrame>;
