import type { CellAddress } from "../layout.ts";
import type { LaneAxis } from "./kit.ts";

export interface HomeRect {
  readonly minCx: number;
  readonly maxCx: number;
  readonly minCz: number;
  readonly maxCz: number;
}

export interface LandPlace {
  readonly cell: CellAddress;
  readonly axis: LaneAxis;
  readonly lane: readonly CellAddress[];
}

export const homeReach = 1;
export const nearPlaces = 8;
export const farPlaces = 4;

export function homeRectOf(cells: readonly CellAddress[]): HomeRect {
  return {
    minCx: Math.min(-homeReach, ...cells.map((cell) => cell.cx)),
    maxCx: Math.max(homeReach, ...cells.map((cell) => cell.cx)),
    minCz: Math.min(-homeReach, ...cells.map((cell) => cell.cz)),
    maxCz: Math.max(homeReach, ...cells.map((cell) => cell.cz)),
  };
}

export function cellsOf(rect: HomeRect): CellAddress[] {
  return span(rect.minCz, rect.maxCz).flatMap((cz) =>
    span(rect.minCx, rect.maxCx).map((cx) => ({ cx, cz })),
  );
}

export function landPlace(index: number, home: HomeRect): LandPlace {
  const { minCx, maxCx, minCz, maxCz } = home;
  const middleRow = Math.round((minCz + maxCz) / 2);
  const middleColumn = Math.round((minCx + maxCx) / 2);
  switch (index) {
    case 0:
      return across(maxCx, 1, minCz, 1);
    case 1:
      return across(minCx, -1, minCz, 1);
    case 2:
      return across(maxCx, 1, maxCz, 1);
    case 3:
      return across(minCx, -1, maxCz, 1);
    case 4:
      return along(minCz, -1, minCx, 1);
    case 5:
      return along(minCz, -1, maxCx, 1);
    case 6:
      return along(maxCz, 1, minCx, 1);
    case 7:
      return along(maxCz, 1, maxCx, 1);
    case 8:
      return across(maxCx, 1, middleRow, 3);
    case 9:
      return across(minCx, -1, middleRow, 3);
    case 10:
      return along(minCz, -1, middleColumn, 3);
    case 11:
      return along(maxCz, 1, middleColumn, 3);
    default:
      return outer(index - nearPlaces - farPlaces, home);
  }
}

function across(edge: number, side: number, row: number, gap: number): LandPlace {
  return {
    cell: { cx: edge + side * (gap + 1), cz: row },
    axis: "x",
    lane: span(1, gap).map((step) => ({ cx: edge + side * step, cz: row })),
  };
}

function along(edge: number, side: number, column: number, gap: number): LandPlace {
  return {
    cell: { cx: column, cz: edge + side * (gap + 1) },
    axis: "z",
    lane: span(1, gap).map((step) => ({ cx: column, cz: edge + side * step })),
  };
}

function outer(beyond: number, home: HomeRect): LandPlace {
  const ring = Math.floor(beyond / 4);
  const reach = 6 + 2 * ring;
  switch (beyond % 4) {
    case 0:
      return lonely({ cx: home.maxCx + reach, cz: home.minCz - 2 - ring });
    case 1:
      return lonely({ cx: home.minCx - reach, cz: home.minCz - 2 - ring });
    case 2:
      return lonely({ cx: home.maxCx + reach, cz: home.maxCz + 2 + ring });
    default:
      return lonely({ cx: home.minCx - reach, cz: home.maxCz + 2 + ring });
  }
}

function lonely(cell: CellAddress): LandPlace {
  return { cell, axis: "x", lane: [] };
}

function span(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
}
