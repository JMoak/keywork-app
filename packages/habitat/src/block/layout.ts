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
  mill: { cx: 2, cz: -1 },
} as const satisfies Readonly<Record<string, CellAddress>>;

export const firstSlots: readonly CellAddress[] = [
  [-1, 0],
  [2, 0],
  [-1, 1],
  [1, 1],
  [2, 1],
  [0, -1],
  [-1, -1],
  [1, -1],
  [-2, 0],
  [-2, 1],
  [0, 2],
  [-1, 2],
  [1, 2],
  [-2, -1],
  [2, 2],
  [-2, 2],
].map(([cx, cz]) => ({ cx: cx ?? 0, cz: cz ?? 0 }));

export function workshopCell(rank: number): CellAddress {
  while (slotsKnown.length <= rank) growSlots();
  return slotsKnown[rank] ?? { cx: 0, cz: 0 };
}

export function doorSideOf(cell: CellAddress): Side {
  return cell.cz >= 1 ? "nz" : "pz";
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

export const porchSpot: Point = { x: 8, z: 25 };
export const treeSpot: Point = { x: 18, z: -2 };
export const wellSpot: Point = { x: -20, z: 2 };
export const monumentSpot: Point = { x: 18, z: 22 };

export const stoneFrom = 3;
export const statueFrom = 8;

export function monumentFor(creatures: number): MonumentTier {
  return creatures >= statueFrom ? 2 : creatures >= stoneFrom ? 1 : 0;
}

export const greenSpots: readonly Point[] = [
  { x: -16, z: -16 },
  { x: 15, z: -14 },
  { x: 1, z: 6 },
  { x: -17, z: 22 },
];

export const outOnTheGreenEvery = 4;

export function restsOnTheGreen(seed: number): boolean {
  return Math.max(0, Math.floor(seed)) % outOnTheGreenEvery === 0;
}

const slotsKnown: CellAddress[] = [...firstSlots];
let ringsGrown = 0;

function growSlots(): void {
  ringsGrown += 1;
  const reach = ringsGrown;
  const inner = (cell: CellAddress): boolean =>
    cell.cx >= -2 - (reach - 1) &&
    cell.cx <= 2 + (reach - 1) &&
    cell.cz >= -1 - (reach - 1) &&
    cell.cz <= 2 + (reach - 1);
  const ring: CellAddress[] = [];
  for (let cz = -1 - reach; cz <= 2 + reach; cz += 1) {
    for (let cx = -2 - reach; cx <= 2 + reach; cx += 1) {
      if (!inner({ cx, cz })) ring.push({ cx, cz });
    }
  }
  ring.sort(
    (a, b) =>
      Math.abs(a.cx) + Math.abs(a.cz - 0.5) - (Math.abs(b.cx) + Math.abs(b.cz - 0.5)) ||
      b.cz - a.cz ||
      a.cx - b.cx,
  );
  slotsKnown.push(...ring);
}
