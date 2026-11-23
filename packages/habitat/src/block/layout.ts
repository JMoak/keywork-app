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

export const streetReach = 4;
export const bandRows = 4;

export function workshopCell(rank: number): CellAddress {
  while (slotsKnown.length <= rank) growSlots();
  return slotsKnown[rank] ?? { cx: 0, cz: 0 };
}

export function doorSideOf(cell: CellAddress): Side {
  return ((cell.cz % bandRows) + bandRows) % bandRows === 1 ? "nz" : "pz";
}

export function lotOf(cell: CellAddress): CellAddress {
  return { cx: cell.cx, cz: cell.cz + (doorSideOf(cell) === "pz" ? -1 : 1) };
}

export function landTowardsTheStreet(cell: CellAddress): CellAddress[] {
  const rows: number[] = [];
  for (let cz = cell.cz - 1; cz > 1; cz -= 1) rows.push(cz);
  for (let cz = cell.cz + 1; cz < 0; cz += 1) rows.push(cz);
  return rows.map((cz) => ({ cx: cell.cx, cz }));
}

export const lotSpots: readonly Point[] = [
  { x: -14, z: -13 },
  { x: 14, z: 13 },
  { x: 14, z: -13 },
  { x: -14, z: 13 },
];

export function lotSpot(index: number, door: Side): Point | undefined {
  const spot = lotSpots[index];
  return spot === undefined || door === "pz" ? spot : { x: -spot.x, z: -spot.z };
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

const slotsKnown: CellAddress[] = [...firstSlots];
let bandsGrown = 0;

function growSlots(): void {
  bandsGrown += 1;
  const columns = [0];
  for (let reach = 1; reach <= streetReach; reach += 1) columns.push(-reach, reach);
  const above = bandsGrown * bandRows;
  for (const rows of [
    [above, above + 1],
    [1 - above, -above],
  ]) {
    for (const cx of columns) for (const cz of rows) slotsKnown.push({ cx, cz });
  }
}
