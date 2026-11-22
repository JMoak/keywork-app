import type { RoadEdges, RoadGrade } from "./kit.ts";
import type { CellAddress } from "./layout.ts";
import { cellPitch, halfCell, type Point, type Side } from "./model.ts";

export interface Doorway {
  readonly cell: CellAddress;
  readonly door: Side;
}

export interface RoadRequest {
  readonly from: Doorway;
  readonly to: Doorway;
  readonly grade: RoadGrade;
  readonly land: (cell: CellAddress) => boolean;
}

export interface Corner {
  readonly i: number;
  readonly j: number;
}

export interface Segment {
  readonly kind: "h" | "v";
  readonly i: number;
  readonly j: number;
}

export interface RoadMap {
  gradeOf(segment: Segment): RoadGrade;
  cornerGrade(corner: Corner): RoadGrade;
  edgesOf(cell: CellAddress): RoadEdges;
  segments(): readonly (readonly [Segment, RoadGrade])[];
  routes(): readonly (Route | undefined)[];
}

export interface Route {
  readonly corners: readonly Corner[];
  readonly segments: readonly Segment[];
  readonly points: readonly Point[];
}

export function layRoads(requests: readonly RoadRequest[]): RoadMap {
  const grades = new Map<string, RoadGrade>();
  const routes: (Route | undefined)[] = [];
  const mark = (segment: Segment, grade: RoadGrade): void => {
    const key = keyOf(segment);
    if ((grades.get(key) ?? 0) < grade) grades.set(key, grade);
  };
  for (const request of requests) {
    const route = routeBetween(request);
    routes.push(route);
    if (route === undefined) continue;
    for (const segment of route.segments) mark(segment, request.grade);
  }
  const gradeOf = (segment: Segment): RoadGrade => grades.get(keyOf(segment)) ?? 0;
  const cornerGrade = ({ i, j }: Corner): RoadGrade =>
    Math.max(
      gradeOf({ kind: "h", i: i - 1, j }),
      gradeOf({ kind: "h", i, j }),
      gradeOf({ kind: "v", i, j: j - 1 }),
      gradeOf({ kind: "v", i, j }),
    ) as RoadGrade;
  return {
    gradeOf,
    cornerGrade,
    edgesOf: ({ cx, cz }) => ({
      north: gradeOf({ kind: "h", i: cx, j: cz }),
      south: gradeOf({ kind: "h", i: cx, j: cz + 1 }),
      west: gradeOf({ kind: "v", i: cx, j: cz }),
      east: gradeOf({ kind: "v", i: cx + 1, j: cz }),
      northWest: cornerGrade({ i: cx, j: cz }),
      northEast: cornerGrade({ i: cx + 1, j: cz }),
      southWest: cornerGrade({ i: cx, j: cz + 1 }),
      southEast: cornerGrade({ i: cx + 1, j: cz + 1 }),
    }),
    segments: () =>
      [...grades.entries()].map(([key, grade]) => [segmentOfKey(key), grade] as const),
    routes: () => routes,
  };
}

export function doorSegment(doorway: Doorway): {
  readonly segment: Segment;
  readonly ends: readonly [Corner, Corner];
} {
  const { cx, cz } = doorway.cell;
  switch (doorway.door) {
    case "pz":
      return {
        segment: { kind: "h", i: cx, j: cz + 1 },
        ends: [
          { i: cx, j: cz + 1 },
          { i: cx + 1, j: cz + 1 },
        ],
      };
    case "nz":
      return {
        segment: { kind: "h", i: cx, j: cz },
        ends: [
          { i: cx, j: cz },
          { i: cx + 1, j: cz },
        ],
      };
    case "px":
      return {
        segment: { kind: "v", i: cx + 1, j: cz },
        ends: [
          { i: cx + 1, j: cz },
          { i: cx + 1, j: cz + 1 },
        ],
      };
    case "nx":
      return {
        segment: { kind: "v", i: cx, j: cz },
        ends: [
          { i: cx, j: cz },
          { i: cx, j: cz + 1 },
        ],
      };
  }
}

interface Step {
  readonly from: Corner;
  readonly along: Segment;
}

function routeBetween(request: RoadRequest): Route | undefined {
  const start = doorSegment(request.from);
  const goal = doorSegment(request.to);
  const goals = new Set(goal.ends.map(cornerKey));
  const came = new Map<string, Step | undefined>();
  const queue: Corner[] = [];
  for (const end of start.ends) {
    came.set(cornerKey(end), undefined);
    queue.push(end);
  }
  let reached: Corner | undefined;
  for (let head = 0; head < queue.length; head += 1) {
    const corner = queue[head] as Corner;
    if (goals.has(cornerKey(corner))) {
      reached = corner;
      break;
    }
    for (const [next, along] of neighbours(corner, request.land)) {
      if (came.has(cornerKey(next))) continue;
      came.set(cornerKey(next), { from: corner, along });
      queue.push(next);
    }
  }
  if (reached === undefined) return undefined;
  const corners: Corner[] = [];
  const segments: Segment[] = [start.segment, goal.segment];
  for (let at: Corner | undefined = reached; at !== undefined; ) {
    corners.unshift(at);
    const step: Step | undefined = came.get(cornerKey(at));
    if (step === undefined) break;
    segments.push(step.along);
    at = step.from;
  }
  return {
    corners,
    segments,
    points: [
      middleOf(start.segment),
      ...corners.map(({ i, j }) => ({ x: i * cellPitch - halfCell, z: j * cellPitch - halfCell })),
      middleOf(goal.segment),
    ],
  };
}

function middleOf(segment: Segment): Point {
  return segment.kind === "h"
    ? { x: segment.i * cellPitch, z: segment.j * cellPitch - halfCell }
    : { x: segment.i * cellPitch - halfCell, z: segment.j * cellPitch };
}

function neighbours(
  { i, j }: Corner,
  land: (cell: CellAddress) => boolean,
): (readonly [Corner, Segment])[] {
  const either = (a: CellAddress, b: CellAddress): boolean => land(a) || land(b);
  const found: (readonly [Corner, Segment])[] = [];
  if (either({ cx: i, cz: j - 1 }, { cx: i, cz: j })) {
    found.push([
      { i: i + 1, j },
      { kind: "h", i, j },
    ]);
  }
  if (either({ cx: i - 1, cz: j - 1 }, { cx: i - 1, cz: j })) {
    found.push([
      { i: i - 1, j },
      { kind: "h", i: i - 1, j },
    ]);
  }
  if (either({ cx: i - 1, cz: j }, { cx: i, cz: j })) {
    found.push([
      { i, j: j + 1 },
      { kind: "v", i, j },
    ]);
  }
  if (either({ cx: i - 1, cz: j - 1 }, { cx: i, cz: j - 1 })) {
    found.push([
      { i, j: j - 1 },
      { kind: "v", i, j: j - 1 },
    ]);
  }
  return found;
}

function keyOf(segment: Segment): string {
  return `${segment.kind}${segment.i},${segment.j}`;
}

function segmentOfKey(key: string): Segment {
  const [i, j] = key.slice(1).split(",").map(Number);
  return { kind: key.startsWith("h") ? "h" : "v", i: i ?? 0, j: j ?? 0 };
}

function cornerKey(corner: Corner): string {
  return `${corner.i},${corner.j}`;
}
