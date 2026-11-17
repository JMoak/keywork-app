import { isWorkshopFamily, type WorkshopFamily } from "../place/architecture.ts";
import type { IndexedFrame } from "../skins/atlas.ts";
import * as tiles from "../skins/world/tiles.ts";
import {
  type GardenPlanting,
  gardenPlantings,
  gardenTile,
} from "../skins/world/workshops/gardens.ts";
import { workshopDesign } from "../skins/world/workshops/index.ts";
import { type Blit, composite } from "./raster.ts";

export interface WorkshopFrameOptions {
  readonly lamps?: number | undefined;
  readonly lanterns?: number | undefined;
  readonly notes?: number | undefined;
  readonly chores?: number | undefined;
  readonly crates?: number | undefined;
  readonly boarded?: boolean | undefined;
  readonly garden?: GardenPlanting | undefined;
}

export const workshopPlotWidth = 48;

export function workshopFrame(
  family: WorkshopFamily,
  options: WorkshopFrameOptions = {},
): IndexedFrame {
  const design = workshopDesign(isWorkshopFamily(family) ? family : "gable");
  let facade = design.facade;
  if ((options.lamps ?? 0) > 0) facade = tiles.lit(facade, design.lamp);
  if ((options.lanterns ?? 0) > 0) facade = tiles.lit(facade, design.loft);
  const layers: Blit[] = [{ frame: facade, x: 0, y: 0 }];
  for (let note = 0; note < countOf(options.notes, 3); note += 1)
    layers.push({
      frame: tiles.benchNote,
      x: design.notes.x + note * 2,
      y: design.notes.y - note,
    });
  for (let chore = 0; chore < countOf(options.chores, 2); chore += 1)
    layers.push({ frame: tiles.chalkLine, x: design.board.x, y: design.board.y + chore });
  for (let crate = 0; crate < countOf(options.crates, 2); crate += 1)
    layers.push({
      frame: tiles.doorCrate,
      x: design.crates.x + crate * 4,
      y: design.crates.y,
    });
  if (options.boarded) {
    layers.push(
      { frame: tiles.boards, x: design.door.x - 1, y: design.door.y + 1 },
      { frame: tiles.boards, x: design.door.x - 1, y: design.door.y + 4 },
      {
        frame: tiles.plaque,
        x: design.board.x - 1,
        y: facade.height - tiles.plaque.height - 1,
      },
    );
  }
  const planting = gardenPlantings.find((planting) => planting === options.garden);
  const garden = planting === undefined ? undefined : gardenTile(planting);
  if (garden !== undefined)
    layers.push({ frame: garden, x: facade.width, y: facade.height - garden.height });
  return composite(workshopPlotWidth, facade.height, layers);
}

function countOf(count: number | undefined, maximum: number): number {
  return count !== undefined && Number.isFinite(count)
    ? Math.max(0, Math.min(maximum, Math.floor(count)))
    : 0;
}
