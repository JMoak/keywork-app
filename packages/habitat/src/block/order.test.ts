import { describe, expect, it } from "vitest";
import { type Axes, axesOf, levelEye, raisedEye, restCamera } from "./camera.ts";
import { cellOrder, type DrawUnit, depthOf, drawUnits, viewOf } from "./draw-list.ts";
import { covers } from "./hit.ts";
import { neonKit } from "./kits/index.ts";
import type { BlockWorld, Cell, Part } from "./model.ts";
import { blockScene } from "./scene.ts";
import { noon, sketchPartnerships, sketchTown } from "./testing.ts";

const quarters = [0, 1, 2, 3] as const;

describe("draw order at the four rest positions", () => {
  it("draws cells in lexicographic order by view quadrant, as the sketch does", () => {
    const world = worldOf(16);
    for (const quarter of quarters) {
      const axes = axesOf(restCamera(quarter, raisedEye));
      const drawn = cellOrder(world.cells, axes).map(addressOf);
      expect(drawn, `quarter ${quarter}`).toEqual(sketchCellOrder(world.cells, quarter));
    }
  });

  it("never draws a nearer thing before a farther one it overlaps, except what stands on a cell border as in the sketch, and the overlaps form no cycle", () => {
    for (const count of [1, 5, 9, 16]) {
      const world = worldOf(count);
      for (const quarter of quarters) {
        for (const eye of [levelEye, raisedEye]) {
          const units = drawUnits(world, restCamera(quarter, eye), viewOf(world, 1008, 580, eye));
          const axes = axesOf(restCamera(quarter, eye));
          const findings = occlusionFindings(units, axes);
          expect(findings.wrong, `${count} creatures, quarter ${quarter}, eye ${eye}`).toEqual([]);
          expect(findings.cyclic, `${count} creatures, quarter ${quarter}, eye ${eye}`).toBe(false);
        }
      }
    }
  });
});

function worldOf(count: number): BlockWorld {
  return blockScene(sketchTown(count), {
    kit: neonKit,
    appearance: "night",
    now: noon,
    partnerships: sketchPartnerships(count),
  }).world;
}

function addressOf(cell: Cell): string {
  return `${cell.cx},${cell.cz}`;
}

function sketchCellOrder(cells: readonly Cell[], quarter: number): string[] {
  const c = [1, 0, -1, 0][quarter] ?? 1;
  const s = [0, 1, 0, -1][quarter] ?? 0;
  const zs = c >= 0 ? 1 : -1;
  const xs = s >= 0 ? 1 : -1;
  return [...cells].sort((a, b) => (a.cz - b.cz) * zs || (a.cx - b.cx) * xs).map(addressOf);
}

interface Extent {
  readonly near: number;
  readonly far: number;
  readonly low: number;
  readonly high: number;
}

interface Findings {
  readonly wrong: string[];
  readonly cyclic: boolean;
}

function occlusionFindings(units: readonly DrawUnit[], axes: Axes): Findings {
  const coverage = units.map(coverageOf);
  const extents = units.map((unit) => extentOf(unit, axes));
  const before = new Map<number, Set<number>>();
  const wrong: string[] = [];
  for (let a = 0; a < units.length; a += 1) {
    for (let b = a + 1; b < units.length; b += 1) {
      const overlap = shared(coverage[a] as Set<number>, coverage[b] as Set<number>);
      if (overlap === 0) continue;
      const front = inFront(extents[a] as Extent, extents[b] as Extent, axes.k > 0);
      if (front === undefined) continue;
      const [farther, nearer] = front === "b" ? [a, b] : [b, a];
      if (!before.has(farther)) before.set(farther, new Set());
      before.get(farther)?.add(nearer);
      if (nearer < farther && !straddles(units[nearer]) && !straddles(units[farther]))
        wrong.push(`${named(units[nearer])} drawn before ${named(units[farther])} (${overlap} px)`);
    }
  }
  return { wrong, cyclic: hasCycle(units.length, before) };
}

function inFront(a: Extent, b: Extent, raised: boolean): "a" | "b" | undefined {
  if (a.near <= b.far) return "b";
  if (b.near <= a.far) return "a";
  if (!raised) return undefined;
  if (a.high <= b.low) return "b";
  if (b.high <= a.low) return "a";
  return undefined;
}

function extentOf(unit: DrawUnit, axes: Axes): Extent {
  const parts: readonly Part[] =
    unit.item === undefined ? unit.cell.ground.map((box) => ({ box })) : unit.item.parts;
  let far = Number.POSITIVE_INFINITY;
  let near = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const part of parts) {
    if ("box" in part) {
      const { x0, x1, z0, z1, y0, y1 } = part.box;
      for (const x of [x0, x1]) {
        for (const z of [z0, z1]) {
          const depth = depthOf({ x, z }, axes);
          far = Math.min(far, depth);
          near = Math.max(near, depth);
        }
      }
      low = Math.min(low, y0);
      high = Math.max(high, y1);
    } else {
      const depth = depthOf(part.sprite, axes);
      far = Math.min(far, depth);
      near = Math.max(near, depth);
      low = Math.min(low, part.sprite.y);
      high = Math.max(high, part.sprite.y + Math.max(0, -part.sprite.top));
    }
  }
  return { far, near, low, high };
}

function coverageOf(unit: DrawUnit): Set<number> {
  const covered = new Set<number>();
  for (const quad of unit.quads) {
    const [a, b, c, d, e, f] = quad.matrix;
    const xs = [e, e + a * quad.width, e + c * quad.height, e + a * quad.width + c * quad.height];
    const ys = [f, f + b * quad.width, f + d * quad.height, f + b * quad.width + d * quad.height];
    for (let y = Math.floor(Math.min(...ys)); y < Math.ceil(Math.max(...ys)); y += 1) {
      for (let x = Math.floor(Math.min(...xs)); x < Math.ceil(Math.max(...xs)); x += 1) {
        if (covers(quad, x + 0.5, y + 0.5)) covered.add(y * 100_000 + x);
      }
    }
  }
  return covered;
}

function shared(a: Set<number>, b: Set<number>): number {
  let count = 0;
  for (const pixel of a.size < b.size ? a : b) if ((a.size < b.size ? b : a).has(pixel)) count += 1;
  return count;
}

function hasCycle(count: number, edges: ReadonlyMap<number, ReadonlySet<number>>): boolean {
  const state = new Uint8Array(count);
  const visit = (node: number): boolean => {
    if (state[node] === 1) return true;
    if (state[node] === 2) return false;
    state[node] = 1;
    for (const next of edges.get(node) ?? []) if (visit(next)) return true;
    state[node] = 2;
    return false;
  };
  for (let node = 0; node < count; node += 1) if (visit(node)) return true;
  return false;
}

function straddles(unit: DrawUnit | undefined): boolean {
  const item = unit?.item;
  if (unit === undefined || item === undefined) return false;
  const localX = item.x - unit.cell.cx * 56;
  const localZ = item.z - unit.cell.cz * 56;
  return Math.abs(localX) > 20 || Math.abs(localZ) > 20;
}

function named(unit: DrawUnit | undefined): string {
  if (unit === undefined) return "nothing";
  const where = addressOf(unit.cell);
  if (unit.item === undefined) return `ground ${where}`;
  const target = unit.item.target;
  const what =
    target === undefined
      ? unit.item.what
      : "creature" in target
        ? `${target.kind} ${target.creature}`
        : target.kind;
  return `${what} at ${unit.item.x},${unit.item.z} in ${where}`;
}
