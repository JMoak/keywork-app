export const workshopFamilies = Object.freeze([
  "gable",
  "ceramic",
  "cairn",
  "folded",
  "root",
  "tidal",
  "lantern",
  "canopy",
] as const);

export type WorkshopFamily = (typeof workshopFamilies)[number];

export function isWorkshopFamily(value: unknown): value is WorkshopFamily {
  return workshopFamilies.some((family) => family === value);
}

export function workshopFamilyOf(index: number, override?: unknown): WorkshopFamily {
  if (!Number.isSafeInteger(index) || index < 0)
    throw new RangeError("A workshop needs a nonnegative integer court index.");
  return isWorkshopFamily(override)
    ? override
    : (workshopFamilies[index % workshopFamilies.length] as WorkshopFamily);
}
