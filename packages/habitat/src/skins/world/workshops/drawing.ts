import type { WorkshopFamily } from "../../../place/architecture.ts";
import { bitmapFromRows, glass, identityShadow, outline, worldGlyphs } from "../../legend.ts";
import type { Tile } from "../tiles.ts";

export interface WorkshopPoint {
  readonly x: number;
  readonly y: number;
}

export interface WorkshopRegion extends WorkshopPoint {
  readonly width: number;
  readonly height: number;
}

export interface WorkshopDesign {
  readonly id: WorkshopFamily;
  readonly title: string;
  readonly facade: Tile;
  readonly lamp: WorkshopRegion;
  readonly loft: WorkshopRegion;
  readonly door: WorkshopRegion;
  readonly board: WorkshopPoint;
  readonly notes: WorkshopPoint;
  readonly crates: WorkshopPoint;
}

interface WorkshopDrawing extends Omit<WorkshopDesign, "facade"> {
  readonly rows: readonly string[];
}

export function defineWorkshop(drawing: WorkshopDrawing): WorkshopDesign {
  const { rows, ...design } = drawing;
  const bitmap = bitmapFromRows(rows, worldGlyphs);
  for (const window of [design.lamp, design.loft]) inset(bitmap, window, glass);
  inset(bitmap, design.door, identityShadow);
  inset(bitmap, { ...design.board, width: 2, height: 2 }, identityShadow);
  return { ...design, facade: { name: `workshop-${design.id}`, ...bitmap } };
}

function inset(bitmap: Tile | Omit<Tile, "name">, region: WorkshopRegion, fill: number): void {
  for (let y = region.y - 1; y <= region.y + region.height; y += 1) {
    for (let x = region.x - 1; x <= region.x + region.width; x += 1) {
      const edge =
        x === region.x - 1 ||
        y === region.y - 1 ||
        x === region.x + region.width ||
        y === region.y + region.height;
      bitmap.indices[y * bitmap.width + x] = edge ? outline : fill;
    }
  }
}
