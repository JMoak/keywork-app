import type { Camera } from "../camera.ts";
import { type DrawList, drawUnits, pivotOf, type Quad, type View } from "../draw-list.ts";
import { covers } from "../hit.ts";
import { type BlockWorld, cellKey, type Staging } from "../model.ts";
import type { ArtRect } from "../places.ts";

export interface LandList {
  readonly list: DrawList;
  readonly owners: readonly (string | undefined)[];
}

export function drawnLands(
  world: BlockWorld,
  owners: ReadonlyMap<string, string>,
  camera: Camera,
  view: View,
  tick = 0,
  haze = 0,
  staging: Staging = {},
): LandList {
  const pivot = pivotOf(world, camera, view);
  const quads: Quad[] = [];
  const held: (string | undefined)[] = [];
  for (const unit of drawUnits(world, camera, view, tick, haze, staging)) {
    const owner = owners.get(cellKey(unit.cell));
    for (const quad of unit.quads) {
      quads.push(quad);
      held.push(owner);
    }
  }
  return { list: { view, pivot, quads, atRest: pivot.rest }, owners: held };
}

export function shiftedList(list: DrawList, dx: number, dy: number): DrawList {
  if (dx === 0 && dy === 0) return list;
  return {
    ...list,
    pivot: { ...list.pivot, x: list.pivot.x + dx, y: list.pivot.y + dy },
    quads: list.quads.map((quad) => {
      const [a, b, c, d, e, f] = quad.matrix;
      return { ...quad, matrix: [a, b, c, d, e + dx, f + dy] as const };
    }),
  };
}

export function landAt(drawn: LandList, x: number, y: number): string | undefined {
  for (let index = drawn.list.quads.length - 1; index >= 0; index -= 1) {
    const quad = drawn.list.quads[index];
    const owner = drawn.owners[index];
    if (quad !== undefined && owner !== undefined && covers(quad, x, y)) return owner;
  }
  return undefined;
}

export function landRectsOf(drawn: LandList): ReadonlyMap<string, ArtRect> {
  const bounds = new Map<string, Bounds>();
  drawn.list.quads.forEach((quad, index) => {
    const owner = drawn.owners[index];
    if (owner === undefined) return;
    bounds.set(owner, widened(bounds.get(owner), boundsOf(quad)));
  });
  return new Map(
    [...bounds].map(([owner, { left, top, right, bottom }]) => [
      owner,
      { x: left, y: top, width: right - left, height: bottom - top },
    ]),
  );
}

interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function boundsOf(quad: Quad): Bounds {
  const [a, b, c, d, e, f] = quad.matrix;
  const xs = [0, a * quad.width, c * quad.height, a * quad.width + c * quad.height];
  const ys = [0, b * quad.width, d * quad.height, b * quad.width + d * quad.height];
  return {
    left: e + Math.min(...xs),
    top: f + Math.min(...ys),
    right: e + Math.max(...xs),
    bottom: f + Math.max(...ys),
  };
}

function widened(held: Bounds | undefined, more: Bounds): Bounds {
  if (held === undefined) return more;
  return {
    left: Math.min(held.left, more.left),
    top: Math.min(held.top, more.top),
    right: Math.max(held.right, more.right),
    bottom: Math.max(held.bottom, more.bottom),
  };
}
