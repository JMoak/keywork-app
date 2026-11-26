import { type Axes, axesOf, type Camera, cornerTurn, levelEye, raisedEye } from "./camera.ts";
import {
  type DrawUnit,
  depthOf,
  drawUnits,
  type Projector,
  projectorOf,
  type View,
} from "./draw-list.ts";
import { aspectSeen, type Heading, headingAlong, headingOf } from "./facing.ts";
import { critterOf, seenFrom } from "./figures.ts";
import { middleOf, roadBetween, seatPoint } from "./green.ts";
import {
  along,
  type BlockWorld,
  type CastMember,
  cellAt,
  cellCenter,
  type Footprint,
  halfCell,
  type Item,
  type Part,
  type Plot,
  type Point,
  type Side,
  type Sprite,
  type Stand,
  type Standing,
  sideAfter,
  type Walker,
} from "./model.ts";
import { type IndexedTexture, opaqueAt } from "./texture.ts";

export interface FacedStand extends Stand {
  readonly heading?: Heading | undefined;
}

export type Eye = Pick<Axes, "c" | "s">;

export const squareOn: Eye = { c: 1, s: 0 };
export const standOut = 5;
export const plotMargin = 2;
export const spotStep = 2;
export const inTheOpen = 0.9;
export const tooTallToStandIn = 6;

export function standingFor(world: BlockWorld, camera: Camera): Standing {
  if (world.cast.length === 0) return nobody;
  const rest = restNearest(camera);
  const key = `${((Math.round(rest.angle / cornerTurn) % 8) + 8) % 8}|${rest.eye}`;
  const solved = solutions.get(world) ?? new Map<string, Standing>();
  solutions.set(world, solved);
  const known = solved.get(key);
  if (known !== undefined) return known;
  const fresh = standingSpots(world, rest);
  solved.set(key, fresh);
  return fresh;
}

export function restNearest(camera: Camera): Camera {
  return {
    angle: Math.round(camera.angle / cornerTurn) * cornerTurn,
    eye: camera.eye >= (levelEye + raisedEye) / 2 ? raisedEye : levelEye,
  };
}

export function standingSpots(world: BlockWorld, rest: Camera): Standing {
  const axes = axesOf(rest);
  const view = artView(world, axes);
  const town: BlockWorld = { ...world, walkers: [], cast: [] };
  const stage: Stage = {
    axes,
    view,
    units: drawUnits(town, rest, view),
    point: projectorOf(world, rest, view),
    cover: new Int32Array(view.width * view.height).fill(-1),
    taken: new Uint8Array(view.width * view.height),
  };
  stage.units.forEach((unit, index) => {
    for (const quad of unit.quads) if (quad.light !== undefined) stamp(stage, quad, index);
  });
  const spots = new Map<string, Stand>();
  const land = landOf(world);
  for (const member of nearestFirst(world.cast, axes)) {
    const spot = ontoTheLand(
      land,
      member,
      axes,
      member.seat === undefined
        ? bestSpot(stage, world, member, land)
        : seatPoint(member.seat, axes),
    );
    spots.set(member.slug, spot);
    eachTexel(stage, member, spot, (at) => {
      stage.taken[at] = 1;
    });
  }
  return spots;
}

export function shownShare(
  world: BlockWorld,
  rest: Camera,
  wanted: (item: Item) => boolean,
): number {
  const axes = axesOf(rest);
  const view = artView(world, axes);
  const units = drawUnits({ ...world, walkers: [], cast: [] }, rest, view);
  const layer = (): Stage => ({
    axes,
    view,
    units,
    point: projectorOf(world, rest, view),
    cover: new Int32Array(view.width * view.height).fill(-1),
    taken: new Uint8Array(0),
  });
  const everything = layer();
  const alone = layer();
  const sought = units.map((unit) => unit.item !== undefined && wanted(unit.item));
  units.forEach((unit, index) => {
    for (const quad of unit.quads) {
      if (quad.light === undefined) continue;
      stamp(everything, quad, index);
      if (sought[index]) stamp(alone, quad, index);
    }
  });
  let all = 0;
  let shown = 0;
  alone.cover.forEach((own, at) => {
    if (own < 0) return;
    all += 1;
    if (sought[everything.cover[at] ?? -1]) shown += 1;
  });
  return all === 0 ? 0 : shown / all;
}

export function castItems(
  world: BlockWorld,
  standing: ReadonlyMap<string, FacedStand>,
  eye: Eye = squareOn,
): Item[] {
  return world.cast.flatMap((member) => {
    const stand = standing.get(member.slug);
    if (stand === undefined) return [];
    const heading = stand.heading ?? headingAtRest(member, stand);
    return [
      {
        what: "creature",
        x: stand.x,
        z: stand.z,
        parts: seenFrom(member.parts, aspectSeen(heading, eye)).map((part, index) => {
          if (!("sprite" in part)) return part;
          const sprite = index === 0 ? stepping(part.sprite, stand.stride) : part.sprite;
          return { sprite: { ...sprite, x: sprite.x + stand.x, z: sprite.z + stand.z } };
        }),
        ramp: member.ramp,
        target: { kind: "creature", creature: member.slug },
      },
    ];
  });
}

export function headingAtRest(member: CastMember, at?: Point): Heading {
  const seat = member.seat;
  const table =
    seat?.at === "council" && at !== undefined ? headingAlong(at, middleOf(seat.round)) : undefined;
  if (table !== undefined) return table;
  const { door } = member.stands;
  return headingOf(critterOf(member.parts)?.doing === "work" ? sideAfter(door, 1) : door);
}

export function aspectShown(
  world: BlockWorld,
  standing: ReadonlyMap<string, FacedStand>,
  eye: Eye,
  tick: number,
  creature: string,
): number | undefined {
  const member = world.cast.find((each) => each.slug === creature);
  if (member !== undefined) {
    const stand = standing.get(creature);
    return aspectSeen(stand?.heading ?? headingAtRest(member, stand), eye);
  }
  const walker = world.walkers.find(
    ({ target }) => target?.kind === "creature" && target.creature === creature,
  );
  const heading = walker === undefined ? undefined : walkerHeading(walker, tick);
  return heading === undefined ? undefined : aspectSeen(heading, eye);
}

export function walkerParts(walker: Walker, eye: Eye, tick: number): readonly Part[] {
  const heading = walkerHeading(walker, tick);
  return heading === undefined ? walker.parts : seenFrom(walker.parts, aspectSeen(heading, eye));
}

export function walkerHeading(walker: Walker, tick: number): Heading | undefined {
  const total = pathLength(walker.path);
  if (total === 0) return undefined;
  const lap = (tick * walker.pace + walker.phase) % (2 * total);
  const homeward = lap > total;
  const heading = headingOnPath(walker.path, homeward ? 2 * total - lap : lap);
  return heading === undefined || !homeward ? heading : heading + Math.PI;
}

export function headingOnPath(path: readonly Point[], travelled: number): Heading | undefined {
  let left = Math.max(0, travelled);
  let latest: Heading | undefined;
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1] ?? { x: 0, z: 0 };
    const to = path[index] ?? from;
    const leg = legLength(from, to);
    if (leg === 0) continue;
    latest = headingAlong(from, to);
    if (left <= leg) return latest;
    left -= leg;
  }
  return latest;
}

export function journey(member: CastMember, left: Plot, from: Point, to: Point): Point[] {
  if (samePlot(left, member.stands)) return walkRound(left.ground, from, to);
  const road =
    roadBetween(member, left) ??
    (samePlot(member.stands, member.home) ? [...member.road].reverse() : member.road);
  const first = road[0];
  const last = road[road.length - 1];
  if (first === undefined || last === undefined) return distinct([from, to]);
  return distinct([
    ...walkRound(left.ground, from, first),
    ...road,
    ...walkRound(member.stands.ground, last, to),
  ]);
}

export function samePlot(one: Plot, other: Plot): boolean {
  return one.cell.cx === other.cell.cx && one.cell.cz === other.cell.cz;
}

export function nearSides(axes: Axes): Side[] {
  const sides: Side[] = [];
  if (axes.c > edge) sides.push("pz");
  if (axes.c < -edge) sides.push("nz");
  if (axes.s > edge) sides.push("px");
  if (axes.s < -edge) sides.push("nx");
  return sides;
}

export function walkRound(home: Footprint, from: Point, to: Point): Point[] {
  const ring = ringAround(home);
  const start = onRing(ring, from);
  const end = onRing(ring, to);
  const ahead = (end.along - start.along + ring.length) % ring.length;
  const turn = ahead <= ring.length - ahead ? 1 : -1;
  const span = turn > 0 ? ahead : ring.length - ahead;
  const passed = cornersOf(ring)
    .map((corner) => ({
      corner,
      far: ((((corner - start.along) * turn) % ring.length) + ring.length) % ring.length,
    }))
    .filter(({ far }) => far > 0 && far < span)
    .sort((a, b) => a.far - b.far)
    .map(({ corner }) => pointAt(ring, corner));
  return distinct([from, start.point, ...passed, end.point, to]);
}

export function pathLength(path: readonly Point[]): number {
  return path.slice(1).reduce((sum, to, index) => sum + legLength(path[index] ?? to, to), 0);
}

export function pointAlong(path: readonly Point[], travelled: number): Point {
  let left = Math.max(0, travelled);
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1] ?? { x: 0, z: 0 };
    const to = path[index] ?? from;
    const leg = legLength(from, to);
    if (left <= leg && leg > 0) {
      const share = left / leg;
      return {
        x: Math.round(from.x + (to.x - from.x) * share),
        z: Math.round(from.z + (to.z - from.z) * share),
      };
    }
    left -= leg;
  }
  return path[path.length - 1] ?? { x: 0, z: 0 };
}

interface Stage {
  readonly axes: Axes;
  readonly view: View;
  readonly units: readonly DrawUnit[];
  readonly point: Projector;
  readonly cover: Int32Array;
  readonly taken: Uint8Array;
}

interface Ring {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  readonly length: number;
}

const edge = 1e-4;
const nobody: Standing = new Map();
const solutions = new WeakMap<BlockWorld, Map<string, Standing>>();

function artView(world: BlockWorld, axes: Axes): View {
  const { minX, maxX, minZ, maxZ, height, slab } = world.bounds;
  const across = maxX - minX;
  const deep = maxZ - minZ;
  const room = 4 * halfCell;
  return {
    scale: 1,
    width: Math.ceil(across + deep + room),
    height: Math.ceil(height + slab + (across + deep) * axes.k + room),
    depth: Math.max(across, deep),
    slab,
  };
}

function nearestFirst(cast: readonly CastMember[], axes: Axes): CastMember[] {
  const depth = ({ stands }: CastMember): number =>
    stands.cell.cx * axes.s + stands.cell.cz * axes.c;
  return [...cast].sort((a, b) => depth(b) - depth(a) || a.order - b.order);
}

function bestSpot(
  stage: Stage,
  world: BlockWorld,
  member: CastMember,
  land: ReadonlySet<string>,
): Point {
  const spots = candidates(world, member, stage.axes, land);
  let best = spots[0] ?? preferred(member, nearSides(stage.axes));
  let most = -1;
  for (const spot of spots) {
    const share = shownAt(stage, member, spot);
    if (share >= inTheOpen) return spot;
    if (share > most) {
      most = share;
      best = spot;
    }
  }
  return best;
}

function candidates(
  world: BlockWorld,
  member: CastMember,
  axes: Axes,
  land: ReadonlySet<string>,
): Point[] {
  const sides = nearSides(axes);
  const { cell, ground } = member.stands;
  const centre = cellCenter(cell.cx, cell.cz);
  const reach = halfCell;
  const first = preferred(member, sides);
  const spots: Point[] = [first];
  for (const side of sides) {
    for (let offset = -reach; offset <= reach; offset += spotStep) {
      spots.push(
        side === "pz" || side === "nz"
          ? { x: centre.x + offset, z: along(ground, side, 0, standOut).z }
          : { x: along(ground, side, 0, standOut).x, z: centre.z + offset },
      );
    }
  }
  const blocked = builtOn(world, member);
  const far = (spot: Point): number => Math.abs(spot.x - first.x) + Math.abs(spot.z - first.z);
  return spots
    .filter((spot) => !blocked.some((built) => within(built, spot)))
    .filter((spot) => drawnOnTheLand(land, member, spot, axes))
    .sort((a, b) => far(a) - far(b));
}

function landOf(world: BlockWorld): ReadonlySet<string> {
  return new Set(world.cells.filter((cell) => cell.land).map((cell) => `${cell.cx},${cell.cz}`));
}

function ontoTheLand(
  land: ReadonlySet<string>,
  member: CastMember,
  axes: Axes,
  spot: Point,
): Point {
  for (let shift = 0; shift <= halfCell; shift += 1) {
    for (const way of shift === 0 ? [0] : [shift, -shift]) {
      const moved = { x: Math.round(spot.x + way * axes.c), z: Math.round(spot.z - way * axes.s) };
      if (drawnOnTheLand(land, member, moved, axes)) return moved;
    }
  }
  return spot;
}

function drawnOnTheLand(
  land: ReadonlySet<string>,
  member: CastMember,
  spot: Point,
  axes: Axes,
): boolean {
  const { left, right } = breadthOf(member, spot, axes);
  for (let column = left; column < right; column += 1) {
    const across = column + 0.5;
    const under = cellAt(spot.x + across * axes.c, spot.z - across * axes.s);
    if (!land.has(`${under.cx},${under.cz}`)) return false;
  }
  return true;
}

interface Breadth {
  readonly left: number;
  readonly right: number;
}

const breadths = new WeakMap<readonly Part[], Breadth>();

function breadthOf(member: CastMember, spot: Point, axes: Axes): Breadth {
  const parts = seenFrom(member.parts, aspectSeen(headingAtRest(member, spot), axes));
  const known = breadths.get(parts);
  if (known !== undefined) return known;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  for (const part of parts) {
    if (!("sprite" in part)) continue;
    for (const frame of part.sprite.frames) {
      for (let column = 0; column < frame.width; column += 1) {
        if (!columnDrawn(frame, column)) continue;
        left = Math.min(left, part.sprite.left + column);
        right = Math.max(right, part.sprite.left + column + 1);
      }
    }
  }
  const breadth = left < right ? { left, right } : { left: 0, right: 0 };
  breadths.set(parts, breadth);
  return breadth;
}

function columnDrawn(texture: IndexedTexture, column: number): boolean {
  for (let row = 0; row < texture.height; row += 1) {
    if (opaqueAt(texture, column, row)) return true;
  }
  return false;
}

function preferred(member: CastMember, sides: readonly Side[]): Point {
  const { ground, door, beside } = member.stands;
  const [first, second] = sides;
  if (sides.includes(door) || first === undefined) return along(ground, door, beside, standOut);
  const middle = (side: Side): Point => {
    const wall = side === "pz" || side === "nz" ? ground.x1 - ground.x0 : ground.z1 - ground.z0;
    return along(ground, side, wall / 2, standOut);
  };
  if (second === undefined) return middle(first);
  return { x: middle(second).x, z: middle(first).z };
}

function builtOn(world: BlockWorld, member: CastMember): Footprint[] {
  const { cx, cz } = member.stands.cell;
  const cell = world.cells.find((each) => each.cx === cx && each.cz === cz);
  return (cell?.items ?? []).flatMap((item) =>
    item.parts.flatMap((part) =>
      "box" in part && part.box.y0 <= 0 && part.box.y1 > tooTallToStandIn ? [part.box] : [],
    ),
  );
}

function within(built: Footprint, spot: Point): boolean {
  return (
    spot.x > built.x0 - plotMargin &&
    spot.x < built.x1 + plotMargin &&
    spot.z > built.z0 - plotMargin &&
    spot.z < built.z1 + plotMargin
  );
}

function shownAt(stage: Stage, member: CastMember, spot: Point): number {
  const rank = rankOf(stage, spot);
  let all = 0;
  let shown = 0;
  eachTexel(stage, member, spot, (at) => {
    all += 1;
    if (at >= 0 && (stage.cover[at] ?? -1) < rank && stage.taken[at] === 0) shown += 1;
  });
  return all === 0 ? 0 : shown / all;
}

function rankOf(stage: Stage, spot: Point): number {
  const depth = depthOf(spot, stage.axes);
  const drawnIn = cellAt(spot.x, spot.z);
  let after = stage.units.length;
  for (let index = 0; index < stage.units.length; index += 1) {
    const unit = stage.units[index];
    if (unit === undefined) continue;
    if (unit.cell.cx !== drawnIn.cx || unit.cell.cz !== drawnIn.cz) continue;
    after = index + 1;
    if (unit.item !== undefined && depthOf(unit.item, stage.axes) > depth) return index;
  }
  return after;
}

function eachTexel(
  stage: Stage,
  member: CastMember,
  spot: Point,
  visit: (at: number) => void,
): void {
  const body = bodyOf(member, stage.axes);
  if (body === undefined) return;
  const [x, y] = stage.point(spot.x, 0, spot.z);
  const left = Math.round(x) + body.sprite.left;
  const top = Math.round(y) + body.sprite.top;
  const { width, height } = stage.view;
  for (let v = 0; v < body.texture.height; v += 1) {
    for (let u = 0; u < body.texture.width; u += 1) {
      if (!opaqueAt(body.texture, u, v)) continue;
      const px = left + u;
      const py = top + v;
      visit(px < 0 || py < 0 || px >= width || py >= height ? -1 : py * width + px);
    }
  }
}

function bodyOf(
  member: CastMember,
  eye: Eye,
): { readonly sprite: Sprite; readonly texture: IndexedTexture } | undefined {
  const [first] = seenFrom(member.parts, aspectSeen(headingAtRest(member), eye));
  if (first === undefined || !("sprite" in first)) return undefined;
  const texture = first.sprite.frames[0];
  return texture === undefined ? undefined : { sprite: first.sprite, texture };
}

function stamp(stage: Stage, quad: DrawUnit["quads"][number], index: number): void {
  const [a, b, c, d, e, f] = quad.matrix;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9) return;
  const xs = [e, e + a * quad.width, e + c * quad.height, e + a * quad.width + c * quad.height];
  const ys = [f, f + b * quad.width, f + d * quad.height, f + b * quad.width + d * quad.height];
  const { width, height } = stage.view;
  const left = Math.max(0, Math.floor(Math.min(...xs)));
  const right = Math.min(width, Math.ceil(Math.max(...xs)));
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const bottom = Math.min(height, Math.ceil(Math.max(...ys)));
  const texture = "texture" in quad.paint ? quad.paint.texture : undefined;
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const dx = px + 0.5 - e;
      const dy = py + 0.5 - f;
      const u = (d * dx - c * dy) / determinant;
      const v = (a * dy - b * dx) / determinant;
      if (u < 0 || v < 0 || u >= quad.width || v >= quad.height) continue;
      if (texture !== undefined && !opaqueAt(texture, u, v)) continue;
      stage.cover[py * width + px] = index;
    }
  }
}

function stepping(sprite: Sprite, stride: number | undefined): Sprite {
  if (stride === undefined || sprite.frames.length < 2) return sprite;
  const frame = sprite.frames[Math.abs(Math.floor(stride)) % sprite.frames.length];
  return frame === undefined
    ? sprite
    : { ...sprite, frames: [frame], sequence: [], rest: undefined };
}

function ringAround(home: Footprint): Ring {
  const x0 = home.x0 - standOut;
  const x1 = home.x1 + standOut;
  const z0 = home.z0 - standOut;
  const z1 = home.z1 + standOut;
  return { x0, x1, z0, z1, length: 2 * (x1 - x0) + 2 * (z1 - z0) };
}

function onRing(ring: Ring, point: Point): { readonly point: Point; readonly along: number } {
  const x = Math.min(ring.x1, Math.max(ring.x0, point.x));
  const z = Math.min(ring.z1, Math.max(ring.z0, point.z));
  const gaps = [z - ring.z0, ring.x1 - x, ring.z1 - z, x - ring.x0];
  const nearest = gaps.indexOf(Math.min(...gaps));
  const wide = ring.x1 - ring.x0;
  const deep = ring.z1 - ring.z0;
  switch (nearest) {
    case 0:
      return { point: { x, z: ring.z0 }, along: x - ring.x0 };
    case 1:
      return { point: { x: ring.x1, z }, along: wide + (z - ring.z0) };
    case 2:
      return { point: { x, z: ring.z1 }, along: wide + deep + (ring.x1 - x) };
    default:
      return { point: { x: ring.x0, z }, along: 2 * wide + deep + (ring.z1 - z) };
  }
}

function cornersOf(ring: Ring): number[] {
  const wide = ring.x1 - ring.x0;
  const deep = ring.z1 - ring.z0;
  return [0, wide, wide + deep, 2 * wide + deep];
}

function pointAt(ring: Ring, along: number): Point {
  const wide = ring.x1 - ring.x0;
  const deep = ring.z1 - ring.z0;
  const at = ((along % ring.length) + ring.length) % ring.length;
  if (at <= wide) return { x: ring.x0 + at, z: ring.z0 };
  if (at <= wide + deep) return { x: ring.x1, z: ring.z0 + (at - wide) };
  if (at <= 2 * wide + deep) return { x: ring.x1 - (at - wide - deep), z: ring.z1 };
  return { x: ring.x0, z: ring.z1 - (at - 2 * wide - deep) };
}

function distinct(path: readonly Point[]): Point[] {
  return path.filter((point, index) => {
    const before = path[index - 1];
    return before === undefined || before.x !== point.x || before.z !== point.z;
  });
}

function legLength(from: Point, to: Point): number {
  return Math.abs(to.x - from.x) + Math.abs(to.z - from.z);
}
