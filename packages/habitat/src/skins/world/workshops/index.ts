import type { WorkshopFamily } from "../../../place/architecture.ts";
import type { WorkshopDesign } from "./drawing.ts";
import { cairn, canopy, ceramic, folded, gable, lantern, root, tidal } from "./facades.ts";

export type { WorkshopDesign, WorkshopPoint, WorkshopRegion } from "./drawing.ts";

export const workshopDesigns: Readonly<Record<WorkshopFamily, WorkshopDesign>> = {
  gable,
  ceramic,
  cairn,
  folded,
  root,
  tidal,
  lantern,
  canopy,
};

export function workshopDesign(family: WorkshopFamily): WorkshopDesign {
  return workshopDesigns[family];
}
