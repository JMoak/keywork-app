import { type Axes, axesOf, type Camera } from "./camera.ts";
import { castItems, standingFor } from "./cast.ts";
import {
  type BlockWorld,
  type Box,
  type Cell,
  type CrownPart,
  cellAt,
  cellKey,
  type FaceKey,
  type FacePaint,
  frontOnGrid,
  type Grid,
  type Item,
  type Part,
  type Point,
  type QuadPaint,
  type RampKey,
  type Side,
  type Sprite,
  type Staging,
  sideOnGrid,
  type Target,
  type Walker,
} from "./model.ts";
import { seenThrough } from "./seen-through.ts";

export type Affine = readonly [number, number, number, number, number, number];

export interface Hit {
  readonly target: Target;
  readonly side?: Side;
  readonly meaning?: string;
}

export interface Quad {
  readonly matrix: Affine;
  readonly width: number;
  readonly height: number;
  readonly paint: QuadPaint;
  readonly ramp: RampKey | undefined;
  readonly light: FaceKey | undefined;
  readonly fog: number;
  readonly haze: number;
  readonly hit: Hit | undefined;
}

export interface View {
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly slab: number;
}

export interface Framing {
  readonly tight?: number | undefined;
  readonly slab?: number | undefined;
}

export interface Pivot {
  readonly x: number;
  readonly y: number;
  readonly rest: boolean;
}

export interface DrawList {
  readonly view: View;
  readonly pivot: Pivot;
  readonly quads: readonly Quad[];
  readonly atRest: boolean;
}

export interface DrawUnit {
  readonly cell: Cell;
  readonly item: Item | undefined;
  readonly quads: readonly Quad[];
  readonly through?: true;
}

export type Projector = (x: number, y: number, z: number) => readonly [number, number];

export const hazeReach = 4;

export function viewOf(
  world: BlockWorld,
  deviceWidth: number,
  deviceHeight: number,
  eye: number,
  framing: Framing = {},
): View {
  const { minX, maxX, minZ, maxZ, height, slab } = world.bounds;
  const across = maxX - minX;
  const deep = maxZ - minZ;
  const tight = framing.tight;
  const wide = tight === undefined ? Math.max(across, deep) : tight % 2 === 0 ? across : deep;
  const depth = tight === undefined ? Math.max(across, deep) : tight % 2 === 0 ? deep : across;
  const floor = framing.slab ?? slab;
  const scale = Math.max(
    1,
    Math.floor(
      Math.min(deviceWidth / (wide + 12), deviceHeight / (height + floor + depth * eye + 10)),
    ),
  );
  return { scale, width: deviceWidth, height: deviceHeight, depth, slab: floor };
}

export function pivotOf(world: BlockWorld, camera: Camera, view: View): Pivot {
  const { c, s, k } = axesOf(camera);
  const rest = (c === 0 || s === 0) && (k === 0 || k === 0.5);
  const top = -world.bounds.height - (view.depth / 2) * k;
  const bottom = view.slab + (view.depth / 2) * k;
  const x = view.width / view.scale / 2;
  const y = view.height / view.scale / 2 - (top + bottom) / 2;
  return rest ? { x: Math.round(x), y: Math.round(y), rest } : { x, y, rest };
}

export function drawList(
  world: BlockWorld,
  camera: Camera,
  view: View,
  tick = 0,
  haze = 0,
  staging: Staging = {},
): DrawList {
  const pivot = pivotOf(world, camera, view);
  const quads = drawUnits(world, camera, view, tick, haze, staging).flatMap((unit) => unit.quads);
  return { view, pivot, quads, atRest: pivot.rest };
}

export function drawUnits(
  world: BlockWorld,
  camera: Camera,
  view: View,
  tick = 0,
  haze = 0,
  staging: Staging = {},
): DrawUnit[] {
  const axes = axesOf(camera);
  const point = projectorOf(world, camera, view);
  const cells = cellOrder(world.cells, axes);
  const standing = staging.standing ?? standingFor(world, camera);
  const moving = byCell(world, [
    ...walkersNow(world, axes, tick),
    ...castItems(world, standing).map((item) => ({ item, tries: [item, ...beside(item, axes)] })),
  ]);
  const farthest = Math.max(...cells.map((cell) => cellDepth(cell, axes)));
  const units = cells.flatMap((cell): DrawUnit[] => {
    const hazed = Math.min(1, (farthest - cellDepth(cell, axes)) / hazeReach) * haze;
    const ground: Quad[] = [];
    for (const box of cell.ground) {
      pushBox(ground, point, axes, box, cell.fog, hazed, undefined, undefined);
    }
    const items = itemOrder([...cell.items, ...(moving.get(cell) ?? [])], axes);
    return [
      { cell, item: undefined, quads: ground },
      ...items.map((item) => {
        const quads: Quad[] = [];
        for (const part of item.parts) {
          pushPart(quads, point, axes, part, item, cell.fog, hazed, tick);
        }
        for (const crowned of crownOrder(item.crown ?? [], axes)) {
          pushPart(quads, point, axes, crowned.part, item, cell.fog, hazed, tick);
        }
        return { cell, item, quads };
      }),
    ];
  });
  const lifted = staging.lifts === undefined ? units : raised(units, staging.lifts);
  return [...lifted, ...seenThrough(lifted)];
}

export function projectorOf(world: BlockWorld, camera: Camera, view: View): Projector {
  const axes = axesOf(camera);
  const pivot = pivotOf(world, camera, view);
  const center = {
    x: (world.bounds.minX + world.bounds.maxX) / 2,
    z: (world.bounds.minZ + world.bounds.maxZ) / 2,
  };
  return (x, y, z) => {
    const dx = x - center.x;
    const dz = z - center.z;
    return [
      pivot.x + dx * axes.c - dz * axes.s,
      pivot.y - y + (dx * axes.s + dz * axes.c) * axes.k,
    ];
  };
}

export function cellOrder(cells: readonly Cell[], axes: Axes): Cell[] {
  const zs = axes.c >= 0 ? 1 : -1;
  const xs = axes.s >= 0 ? 1 : -1;
  return [...cells].sort((a, b) => (a.cz - b.cz) * zs || (a.cx - b.cx) * xs);
}

export function itemOrder(items: readonly Item[], axes: Axes): Item[] {
  return [...items].sort((a, b) => depthOf(a, axes) - depthOf(b, axes));
}

export function depthOf(point: { readonly x: number; readonly z: number }, axes: Axes): number {
  return point.x * axes.s + point.z * axes.c;
}

export function walkerAt(walker: Walker, tick: number): Point {
  const legs = walker.path.slice(1).map((to, index) => {
    const from = walker.path[index] ?? to;
    return Math.abs(to.x - from.x) + Math.abs(to.z - from.z);
  });
  const total = legs.reduce((sum, leg) => sum + leg, 0);
  if (total === 0) return walker.path[0] ?? { x: 0, z: 0 };
  let travelled = (tick * walker.pace + walker.phase) % (2 * total);
  if (travelled > total) travelled = 2 * total - travelled;
  let leg = 0;
  while (leg < legs.length - 1 && travelled > (legs[leg] ?? 0)) {
    travelled -= legs[leg] ?? 0;
    leg += 1;
  }
  const from = walker.path[leg] ?? { x: 0, z: 0 };
  const to = walker.path[leg + 1] ?? from;
  const length = legs[leg] ?? 0;
  const share = length === 0 ? 0 : travelled / length;
  return {
    x: Math.round(from.x + (to.x - from.x) * share),
    z: Math.round(from.z + (to.z - from.z) * share),
  };
}

export function frameIndex(sprite: Sprite, tick: number): number {
  if (tick === 0 && sprite.rest !== undefined) return sprite.rest;
  if (sprite.sequence.length === 0) return 0;
  const length = sprite.sequence.length;
  return sprite.sequence[(((tick + sprite.phase) % length) + length) % length] ?? 0;
}

export function moves(world: BlockWorld): boolean {
  if (world.walkers.length > 0) return true;
  const animated = (part: Part): boolean => "sprite" in part && part.sprite.sequence.length > 1;
  return (
    world.cast.some((member) => member.parts.some(animated)) ||
    world.cells.some((cell) =>
      cell.items.some((item) =>
        [...item.parts, ...(item.crown ?? []).map((crowned) => crowned.part)].some(animated),
      ),
    )
  );
}

const edge = 1e-4;

function cellDepth(cell: Cell, axes: Axes): number {
  return cell.cx * axes.s + cell.cz * axes.c;
}

function crownOrder(crown: readonly CrownPart[], axes: Axes): CrownPart[] {
  return [...crown].sort((a, b) => depthOf(a, axes) - depthOf(b, axes));
}

interface Placed {
  readonly item: Item;
  readonly tries: readonly Point[];
}

function walkersNow(world: BlockWorld, axes: Axes, tick: number): Placed[] {
  return world.walkers.map((walker) => {
    const at = walkerAt(walker, tick);
    const item: Item = {
      what: walker.what,
      x: at.x,
      z: at.z,
      parts: walker.parts.map((part) =>
        "sprite" in part
          ? { sprite: { ...part.sprite, x: part.sprite.x + at.x, z: part.sprite.z + at.z } }
          : part,
      ),
      ...(walker.ramp === undefined ? {} : { ramp: walker.ramp }),
      ...(walker.target === undefined ? {} : { target: walker.target }),
    };
    return { item, tries: beside(at, axes) };
  });
}

function beside(at: Point, axes: Axes): Point[] {
  const stepped = (along: number, across: number): Point => ({
    x: at.x + along * axes.s + across * axes.c,
    z: at.z + along * axes.c - across * axes.s,
  });
  return [stepped(3, 0), stepped(-3, 0), stepped(0, 3), stepped(0, -3)];
}

function byCell(world: BlockWorld, placed: readonly Placed[]): Map<Cell, Item[]> {
  const byAddress = new Map(world.cells.map((cell) => [cellKey(cell), cell]));
  const found = (x: number, z: number): Cell | undefined => byAddress.get(cellKey(cellAt(x, z)));
  const held = new Map<Cell, Item[]>();
  for (const { item, tries } of placed) {
    const cell = tries.map((point) => found(point.x, point.z)).find((each) => each?.land);
    if (cell !== undefined) held.set(cell, [...(held.get(cell) ?? []), item]);
  }
  return held;
}

function raised(units: readonly DrawUnit[], lifts: ReadonlyMap<string, number>): DrawUnit[] {
  return units.map((unit) => {
    const lift = lifts.get(cellKey(unit.cell)) ?? 0;
    if (lift === 0) return unit;
    return {
      ...unit,
      quads: unit.quads.map((quad) => {
        const [a, b, c, d, e, f] = quad.matrix;
        return { ...quad, matrix: [a, b, c, d, e, f + lift] as const };
      }),
    };
  });
}

function pushPart(
  quads: Quad[],
  point: Projector,
  axes: Axes,
  part: Part,
  item: Item,
  fog: number,
  haze: number,
  tick: number,
): void {
  if ("box" in part) {
    pushBox(quads, point, axes, part.box, fog, haze, part.box.ramp ?? item.ramp, item.target);
    return;
  }
  const sprite = part.sprite;
  const texture = sprite.frames[frameIndex(sprite, tick)];
  if (texture === undefined) return;
  const [x, y] = point(sprite.x, sprite.y, sprite.z);
  quads.push({
    matrix: [1, 0, 0, 1, Math.round(x) + sprite.left, Math.round(y) + sprite.top],
    width: texture.width,
    height: texture.height,
    paint: { texture },
    ramp: sprite.ramp ?? item.ramp,
    light: undefined,
    fog,
    haze: 0,
    hit: item.target === undefined ? undefined : { target: item.target },
  });
}

function pushBox(
  quads: Quad[],
  point: Projector,
  axes: Axes,
  box: Box,
  fog: number,
  haze: number,
  ramp: RampKey | undefined,
  target: Target | undefined,
): void {
  const { c, s, k } = axes;
  const across = box.x1 - box.x0;
  const tall = box.y1 - box.y0;
  const deep = box.z1 - box.z0;
  const face = (
    key: FaceKey,
    origin: readonly [number, number],
    u: readonly [number, number],
    v: readonly [number, number],
    width: number,
    height: number,
  ): void => {
    const paint = box.faces[key];
    if (paint === undefined || width <= 0 || height <= 0) return;
    const grid = key === "top" ? topGridSeen(axes) : wallGrid;
    quads.push({
      matrix: [u[0] * grid.x, u[1] * grid.x, v[0] * grid.z, v[1] * grid.z, origin[0], origin[1]],
      width: width / grid.x,
      height: height / grid.z,
      paint: paintSeen(paint, grid),
      ramp,
      light: key,
      fog,
      haze,
      hit: target === undefined ? undefined : hitOf(target, box, key),
    });
  };
  const down: readonly [number, number] = [0, 1];
  if (c > edge) face("pz", point(box.x0, box.y1, box.z1), [c, s * k], down, across, tall);
  if (c < -edge) face("nz", point(box.x1, box.y1, box.z0), [-c, -s * k], down, across, tall);
  if (s > edge) face("px", point(box.x1, box.y1, box.z1), [s, -c * k], down, deep, tall);
  if (s < -edge) face("nx", point(box.x0, box.y1, box.z0), [-s, c * k], down, deep, tall);
  if (k > edge) face("top", point(box.x0, box.y1, box.z0), [c, s * k], [-s, c * k], across, deep);
}

const wallGrid: Grid = { x: 1, z: 1 };

export function topGridSeen(axes: Axes): Grid {
  return Math.abs(axes.c) >= Math.abs(axes.s) ? frontOnGrid : sideOnGrid;
}

function paintSeen(paint: FacePaint, grid: Grid): QuadPaint {
  if (!("texture" in paint)) return paint;
  const sideOn = grid === sideOnGrid ? paint.sideOn : undefined;
  return { texture: sideOn ?? paint.texture };
}

function hitOf(target: Target, box: Box, key: FaceKey): Hit {
  if (key === "top") return { target };
  const meaning = box.meanings?.[key];
  return meaning === undefined ? { target, side: key } : { target, side: key, meaning };
}
