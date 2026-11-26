import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { frameIndex } from "../packages/habitat/src/block/draw-list.ts";
import { aspects } from "../packages/habitat/src/block/figure-art.ts";
import {
  critterParts,
  type Doing,
  figureArts,
  figureNames,
  seenFrom,
} from "../packages/habitat/src/block/figures.ts";
import { kitNamed, kits } from "../packages/habitat/src/block/kits/index.ts";
import { identityRamp } from "../packages/habitat/src/block/model.ts";
import { type BlockPalette, resolveBlockPalette } from "../packages/habitat/src/block/palette.ts";
import type { ToolTier } from "../packages/habitat/src/block/scene.ts";
import { roleAt } from "../packages/habitat/src/block/texture.ts";
import type { Raster } from "../packages/habitat/src/render/index.ts";
import { encodePng } from "../packages/ui/src/panes/stead/png.ts";

export interface SheetLook {
  readonly doing: Doing;
  readonly tool: ToolTier;
  readonly medal: boolean;
  readonly tick: number;
  readonly scale: number;
  readonly kit: string;
  readonly night: boolean;
}

export const cell = { width: 44, height: 40, ground: 34 } as const;

export function figureSheet(look: SheetLook): Raster {
  const kit = kitNamed(look.kit) ?? kits[0];
  if (kit === undefined) throw new Error("no kit to draw with");
  const palette = resolveBlockPalette(kit, look.night ? "night" : "day");
  const width = aspects.length * cell.width;
  const height = figureNames.length * cell.height;
  const art = new Uint8ClampedArray(width * height * 4);
  const dot = (x: number, y: number, colour: string | undefined): void => {
    if (colour === undefined || x < 0 || y < 0 || x >= width || y >= height) return;
    art.set([...rgbOf(colour), 255], (y * width + x) * 4);
  };
  figureNames.forEach((name, row) => {
    aspects.forEach((_, aspect) => {
      const left = aspect * cell.width;
      const top = row * cell.height;
      for (let y = 0; y < cell.height; y += 1) {
        const ground = y >= cell.ground ? "grassLo" : "grass";
        for (let x = 0; x < cell.width; x += 1) {
          dot(left + x, top + y, palette.colourOf(ground, undefined));
        }
      }
      stamp(dot, palette, left + (cell.width >> 1), top + cell.ground, name, row, aspect, look);
    });
  });
  return enlarged({ width, height, rgba: art }, look.scale);
}

function stamp(
  dot: (x: number, y: number, colour: string | undefined) => void,
  palette: BlockPalette,
  x: number,
  y: number,
  name: (typeof figureNames)[number],
  order: number,
  aspect: number,
  look: SheetLook,
): void {
  const built = critterParts(figureArts[name], look.doing, order, {
    tool: look.tool,
    medal: look.medal,
  });
  for (const part of seenFrom(built, aspect)) {
    if (!("sprite" in part)) continue;
    const { sprite } = part;
    const frame = sprite.frames[frameIndex(sprite, look.tick)];
    if (frame === undefined) continue;
    for (let v = 0; v < frame.height; v += 1) {
      for (let u = 0; u < frame.width; u += 1) {
        const role = roleAt(frame, u, v);
        if (role === undefined) continue;
        dot(x + sprite.left + u, y + sprite.top + v, palette.colourOf(role, identityRamp(order)));
      }
    }
  }
}

function enlarged(small: Raster, scale: number): Raster {
  const width = small.width * scale;
  const height = small.height * scale;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (Math.floor(y / scale) * small.width + Math.floor(x / scale)) * 4;
      rgba.set(small.rgba.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}

function rgbOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      doing: { type: "string", default: "idle" },
      tool: { type: "string", default: "0" },
      medal: { type: "boolean", default: false },
      tick: { type: "string", default: "0" },
      scale: { type: "string", default: "6" },
      kit: { type: "string", default: "neon" },
      day: { type: "boolean", default: false },
    },
  });
  const [file] = positionals;
  if (file === undefined) {
    console.error(
      "usage: bun scripts/figure-sheet.ts <sheet.png> [--doing work] [--tool 0-3] [--medal] [--tick n] [--scale n] [--kit neon] [--day]",
    );
    process.exit(2);
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    encodePng(
      figureSheet({
        doing: values.doing as Doing,
        tool: Number(values.tool) as ToolTier,
        medal: values.medal,
        tick: Number(values.tick),
        scale: Number(values.scale),
        kit: values.kit,
        night: !values.day,
      }),
    ),
  );
  console.log(
    `${figureNames.length} creatures from ${aspects.length} directions, written to ${file}`,
  );
}
