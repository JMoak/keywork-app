import { describe, expect, it } from "vitest";
import { neonKit } from "./kits/index.ts";
import type { CellAddress } from "./layout.ts";
import { doorSegment, layRoads, type RoadRequest, type Segment } from "./roads.ts";
import { blockScene } from "./scene.ts";
import { noon, sketchTown } from "./testing.ts";

const row = landOf([
  [0, 0],
  [1, 0],
  [2, 0],
]);

describe("roads", () => {
  it("runs along cell borders from one door to the next", () => {
    const roads = layRoads([request([0, 0], [2, 0], 2, row)]);
    expect(gradesOf(roads.segments())).toEqual({ "h0,1": 2, "h1,1": 2, "h2,1": 2 });
    expect(roads.routes()[0]?.corners).toEqual([
      { i: 1, j: 1 },
      { i: 2, j: 1 },
    ]);
  });

  it("keeps the highest grade a border was ever given", () => {
    const rising = layRoads([request([0, 0], [2, 0], 1, row), request([0, 0], [2, 0], 3, row)]);
    const falling = layRoads([request([0, 0], [2, 0], 3, row), request([0, 0], [2, 0], 1, row)]);
    expect(gradesOf(rising.segments())).toEqual({ "h0,1": 3, "h1,1": 3, "h2,1": 3 });
    expect(gradesOf(falling.segments())).toEqual(gradesOf(rising.segments()));
  });

  it("goes round, never across water, and lays nothing when there is no way", () => {
    const island = landOf([
      [0, 0],
      [5, 5],
    ]);
    const stranded = layRoads([request([0, 0], [5, 5], 2, island)]);
    expect(stranded.routes()).toEqual([undefined]);
    expect(stranded.segments()).toEqual([]);
    const bend = landOf([
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
    const around = layRoads([
      {
        from: { cell: { cx: 0, cz: 0 }, door: "nz" },
        to: { cell: { cx: 1, cz: 1 }, door: "pz" },
        grade: 1,
        land: bend,
      },
    ]);
    const corners = around.routes()[0]?.corners ?? [];
    expect(corners.length).toBeGreaterThan(2);
    for (const [index, corner] of corners.entries()) {
      const next = corners[index + 1];
      if (next !== undefined)
        expect(Math.abs(next.i - corner.i) + Math.abs(next.j - corner.j)).toBe(1);
    }
  });

  it("reads a corner as the grade of the roads that meet there", () => {
    const roads = layRoads([request([0, 0], [2, 0], 3, row)]);
    expect(roads.cornerGrade({ i: 1, j: 1 })).toBe(3);
    expect(roads.cornerGrade({ i: 1, j: 0 })).toBe(0);
    expect(roads.edgesOf({ cx: 1, cz: 0 })).toMatchObject({ south: 3, north: 0, southWest: 3 });
  });

  it("gives every workshop a path to the porch", () => {
    for (const count of [1, 2, 5, 9, 16, 40]) {
      const scene = blockScene(sketchTown(count), { kit: neonKit, appearance: "night", now: noon });
      const routes = scene.roads.routes();
      expect(routes.length).toBe(count + 1);
      expect(
        routes.every((route) => route !== undefined),
        `${count} creatures`,
      ).toBe(true);
      const porch = doorSegment({ cell: { cx: 0, cz: 0 }, door: "pz" }).segment;
      expect(scene.roads.gradeOf(porch)).toBeGreaterThanOrEqual(1);
      for (const resident of scene.residents) {
        const door = doorSegment({ cell: resident.cell, door: resident.door }).segment;
        expect(scene.roads.gradeOf(door), resident.slug).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

function request(
  from: readonly [number, number],
  to: readonly [number, number],
  grade: 1 | 2 | 3,
  land: (cell: CellAddress) => boolean,
): RoadRequest {
  return {
    from: { cell: { cx: from[0], cz: from[1] }, door: "pz" },
    to: { cell: { cx: to[0], cz: to[1] }, door: "pz" },
    grade,
    land,
  };
}

function landOf(cells: readonly (readonly [number, number])[]): (cell: CellAddress) => boolean {
  const held = new Set(cells.map(([cx, cz]) => `${cx},${cz}`));
  return (cell) => held.has(`${cell.cx},${cell.cz}`);
}

function gradesOf(segments: readonly (readonly [Segment, number])[]): Record<string, number> {
  return Object.fromEntries(
    segments.map(([segment, grade]) => [`${segment.kind}${segment.i},${segment.j}`, grade]),
  );
}
