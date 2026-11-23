import type { MonumentTier, ShedSpot } from "./kit.ts";
import type { Point, Side } from "./model.ts";

export interface CellAddress {
  readonly cx: number;
  readonly cz: number;
}

export const reserved = {
  house: { cx: 0, cz: 0 },
  storehouse: { cx: 1, cz: 0 },
  green: { cx: 0, cz: 1 },
  mill: { cx: 1, cz: -1 },
} as const satisfies Readonly<Record<string, CellAddress>>;

export const firstSlots: readonly CellAddress[] = [
  [-1, 0],
  [2, 0],
  [-1, 1],
  [1, 1],
  [2, 1],
  [-2, 0],
  [-2, 1],
  [3, 0],
  [3, 1],
  [-3, 0],
  [-3, 1],
  [4, 0],
  [4, 1],
  [-4, 0],
  [-4, 1],
].map(([cx, cz]) => ({ cx: cx ?? 0, cz: cz ?? 0 }));

export const streetEnd = 4;
export const besideTheStreet = 2;

export function workshopCell(rank: number): CellAddress {
  const first = firstSlots[rank];
  if (first !== undefined) return first;
  const past = rank - firstSlots.length;
  const reach = streetEnd + 1 + Math.floor(past / (2 * besideTheStreet));
  return {
    cx: past % (2 * besideTheStreet) < besideTheStreet ? reach : -reach,
    cz: past % besideTheStreet,
  };
}

export function doorSideOf(cell: CellAddress): Side {
  return cell.cz >= 1 ? "nz" : "pz";
}

export interface LotPlace {
  readonly cell: CellAddress;
  readonly at: Point;
}

export const lotSpots: readonly Point[] = [
  { x: -14, z: -13 },
  { x: 14, z: 13 },
  { x: 14, z: -13 },
  { x: -14, z: 13 },
];

export function lotPlace(workshop: CellAddress, index: number): LotPlace {
  const behind = doorSideOf(workshop) === "pz" ? -1 : 1;
  const spot = lotSpots[index % lotSpots.length] ?? { x: 0, z: 0 };
  return {
    cell: {
      cx: workshop.cx,
      cz: workshop.cz + behind * (1 + Math.floor(index / lotSpots.length)),
    },
    at: { x: -behind * spot.x, z: -behind * spot.z },
  };
}

export function lotOf(workshop: CellAddress): CellAddress {
  return lotPlace(workshop, 0).cell;
}

export const shedSpots: readonly (ShedSpot & { readonly on?: number })[] = [
  { x0: 16, x1: 26, z0: -10, z1: 6, y0: 0, height: 12, ridge: "gz", door: "pz" },
  { x0: 10, x1: 22, z0: 16, z1: 26, y0: 0, height: 10, ridge: "gx", door: "pz" },
  { x0: -26, x1: -16, z0: -6, z1: 10, y0: 0, height: 12, ridge: "gz", door: "pz" },
  { x0: -12, x1: 4, z0: -26, z1: -16, y0: 0, height: 10, ridge: "gx", door: "nz" },
  { x0: -26, x1: -16, z0: 14, z1: 24, y0: 0, height: 8, ridge: "gz", door: "pz" },
  { x0: 16, x1: 26, z0: -10, z1: 6, y0: 12, height: 10, ridge: "gz", door: "pz", on: 0 },
  { x0: -26, x1: -16, z0: -6, z1: 10, y0: 12, height: 10, ridge: "gz", door: "pz", on: 2 },
];

export function shedSpot(
  index: number,
  door: Side,
): (ShedSpot & { readonly on?: number }) | undefined {
  const spot = shedSpots[index];
  if (spot === undefined || door === "pz") return spot;
  return {
    ...spot,
    z0: -spot.z1,
    z1: -spot.z0,
    door: spot.door === "pz" ? "nz" : spot.door === "nz" ? "pz" : spot.door,
  };
}

export const treeSpot: Point = { x: 18, z: -2 };
export const wellSpot: Point = { x: -20, z: 2 };
export const monumentSpot: Point = { x: 18, z: 22 };

export const stoneFrom = 3;
export const statueFrom = 8;

export function monumentFor(creatures: number): MonumentTier {
  return creatures >= statueFrom ? 2 : creatures >= stoneFrom ? 1 : 0;
}
