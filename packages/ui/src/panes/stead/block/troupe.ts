import {
  aspects,
  type BlockWorld,
  type Camera,
  type CastMember,
  critterOf,
  eighthTurn,
  type FacedStand,
  type Heading,
  headingAtRest,
  headingOnPath,
  journey,
  type Manner,
  mannerOf,
  type Plot,
  type Point,
  pathLength,
  pauseBeforeStrolling,
  pointAlong,
  type Standing,
  standingFor,
  tickMs,
  turnsToDawdle,
  type Walker,
  walkerAt,
} from "@keywork-app/habitat/block";

export interface Troupe {
  town(world: BlockWorld, now: number, reduced: boolean): BlockWorld;
  standing(town: BlockWorld, rest: Camera, now: number, reduced: boolean): Standing;
  walking(): boolean;
}

export const stepMs = 50;
export const strideLength = 4;
export const dawdleMs = 55;
export const dawdles = turnsToDawdle;
export const eighthMs = 70;
export const clearOfTheWall = 2;
export const atItsDoor = 4;

export function createTroupe(): Troupe {
  const tracks = new Map<string, Track>();
  const members = new Map<string, CastMember>();
  const homeward = new Map<string, Point>();
  let held: HeldTown | undefined;

  const goingHome = (world: BlockWorld, walker: Walker, now: number): CastMember | undefined => {
    const slug = walkerSlug(walker);
    const member = slug === undefined ? undefined : members.get(slug);
    const track = slug === undefined ? undefined : tracks.get(slug);
    if (slug === undefined || member === undefined || track === undefined) return undefined;
    if (world.cast.some((each) => each.slug === slug)) return undefined;
    const door =
      homeward.get(slug) ?? (awayFromHome(track, member) ? doorOf(walker, member) : undefined);
    if (door === undefined || joinedItsRoad(track, walker, door, now)) {
      homeward.delete(slug);
      return undefined;
    }
    homeward.set(slug, door);
    const { order, home, road, ramp } = member;
    return { slug, order, home, stands: home, road, still: false, parts: walker.parts, ramp };
  };

  return {
    town: (world, now, reduced) => {
      for (const member of world.cast) members.set(member.slug, member);
      const going = reduced
        ? []
        : world.walkers.flatMap((walker) => goingHome(world, walker, now) ?? []);
      for (const slug of homeward.keys()) {
        if (!going.some((member) => member.slug === slug)) homeward.delete(slug);
      }
      if (going.length === 0) return world;
      const key = going.map((member) => member.slug).join(" ");
      if (held?.world === world && held.key === key) return held.town;
      const leaving = new Set(going.map((member) => member.slug));
      const town: BlockWorld = {
        ...world,
        walkers: world.walkers.filter((walker) => !leaving.has(walkerSlug(walker) ?? "")),
        cast: [...world.cast, ...going],
      };
      held = { world, key, town };
      return town;
    },
    standing: (world, rest, now, reduced) => {
      const wanted = standingFor(world, rest);
      const standing = new Map<string, FacedStand>();
      for (const member of world.cast) {
        const spot = homeward.get(member.slug) ?? wanted.get(member.slug);
        if (spot === undefined) continue;
        const to = reduced ? spot : nearerItsWork(member, spot);
        const track = headedFor(tracks.get(member.slug), member, to, now, reduced);
        tracks.set(member.slug, track);
        standing.set(member.slug, reduced ? track.to : standAt(track, member, now));
      }
      for (const slug of tracks.keys()) if (!standing.has(slug)) tracks.delete(slug);
      return standing;
    },
    walking: () => [...tracks.values()].some((track) => track.walk !== undefined || track.turning),
  };
}

export function paceOf(member: Pick<CastMember, "order" | "still">): number {
  return member.still ? 2 : 3 + (member.order % 2);
}

export function dawdleOf(order: number): number {
  return turnOf(order) * dawdleMs;
}

export function travelledBy(gait: readonly number[], steps: number): number {
  const stride = gait.reduce((sum, step) => sum + step, 0);
  const begun = gait.slice(0, steps % gait.length).reduce((sum, step) => sum + step, 0);
  return Math.floor(steps / gait.length) * stride + begun;
}

interface HeldTown {
  readonly world: BlockWorld;
  readonly key: string;
  readonly town: BlockWorld;
}

interface Walk {
  readonly path: readonly Point[];
  readonly length: number;
  readonly startsAt: number;
  readonly gait: readonly number[];
  readonly bounces: boolean;
}

interface Track {
  readonly to: Point;
  readonly plot: Plot;
  walk: Walk | undefined;
  facing: number | undefined;
  turnedAt: number;
  turning: boolean;
}

function headedFor(
  track: Track | undefined,
  member: CastMember,
  to: Point,
  now: number,
  reduced: boolean,
): Track {
  const fresh = { to, plot: member.stands, walk: undefined, turnedAt: now, turning: false };
  if (track === undefined || reduced) return { ...fresh, facing: undefined };
  if (track.to.x === to.x && track.to.z === to.z) return track;
  const manner = mannerOf(critterOf(member.parts)?.temperament);
  const path = journey(member, track.plot, placeAt(track, now), to);
  return {
    ...fresh,
    facing: track.facing,
    turnedAt: track.turnedAt,
    walk: {
      path,
      length: pathLength(path),
      startsAt:
        now +
        (track.walk === undefined
          ? manner.dawdle(turnOf(member.order)) * dawdleMs + pauseBeforeStrolling(member)
          : 0),
      gait: gaitOf(member, manner),
      bounces: manner.bounces,
    },
  };
}

function standAt(track: Track, member: CastMember, now: number): FacedStand {
  const walk = track.walk;
  const travelled = walk === undefined ? 0 : travelledAt(walk, now);
  if (walk === undefined || travelled >= walk.length) {
    track.walk = undefined;
    return { ...track.to, heading: turnedToward(track, headingAtRest(member, track.to), now) };
  }
  const along = headingOnPath(walk.path, travelled) ?? headingAtRest(member, track.to);
  return {
    ...pointAlong(walk.path, travelled),
    stride: walk.bounces ? Math.floor(travelled / strideLength) : 0,
    heading: turnedToward(track, along, now),
  };
}

function placeAt(track: Track, now: number): Point {
  const walk = track.walk;
  if (walk === undefined) return track.to;
  const travelled = travelledAt(walk, now);
  return travelled >= walk.length ? track.to : pointAlong(walk.path, travelled);
}

function travelledAt(walk: Walk, now: number): number {
  return travelledBy(walk.gait, Math.floor(Math.max(0, now - walk.startsAt) / stepMs));
}

function turnedToward(track: Track, wanted: Heading, now: number): Heading {
  const goal = eighthOf(wanted);
  const facing = track.facing ?? goal;
  const away = ((goal - facing + aspects.length * 1.5) % aspects.length) - aspects.length / 2;
  const steps = Math.min(Math.abs(away), Math.floor((now - track.turnedAt) / eighthMs));
  track.facing = wrapped(facing + Math.sign(away) * steps);
  track.turning = track.facing !== goal;
  if (steps > 0 || !track.turning) track.turnedAt = now;
  return track.facing * eighthTurn;
}

function eighthOf(heading: Heading): number {
  return wrapped(Math.round(heading / eighthTurn));
}

function wrapped(eighths: number): number {
  return ((eighths % aspects.length) + aspects.length) % aspects.length;
}

function gaitOf(member: CastMember, manner: Manner): readonly number[] {
  return member.still || manner.gait === undefined ? [paceOf(member)] : manner.gait;
}

function awayFromHome(track: Track, member: CastMember): boolean {
  const { cell } = member.home;
  return (
    track.walk !== undefined || track.plot.cell.cx !== cell.cx || track.plot.cell.cz !== cell.cz
  );
}

function doorOf(walker: Walker, member: CastMember): Point | undefined {
  const { ground } = member.home;
  const middle = { x: (ground.x0 + ground.x1) / 2, z: (ground.z0 + ground.z1) / 2 };
  const ends = [walker.path[0], walker.path[walker.path.length - 1]].filter(
    (end): end is Point => end !== undefined,
  );
  return ends.sort((a, b) => apart(a, middle) - apart(b, middle))[0];
}

function joinedItsRoad(track: Track, walker: Walker, door: Point, now: number): boolean {
  const home = track.walk === undefined && track.to.x === door.x && track.to.z === door.z;
  return home && apart(walkerAt(walker, Math.floor(now / tickMs)), door) <= atItsDoor;
}

function walkerSlug(walker: Walker): string | undefined {
  return walker.target?.kind === "creature" ? walker.target.creature : undefined;
}

function apart(one: Point, other: Point): number {
  return Math.abs(one.x - other.x) + Math.abs(one.z - other.z);
}

function turnOf(order: number): number {
  return (order * 5) % dawdles;
}

function nearerItsWork(member: CastMember, spot: Point): Point {
  const critter = critterOf(member.parts);
  const nearer = critter?.doing === "work" ? mannerOf(critter.temperament).nearer : 0;
  if (nearer === 0) return spot;
  const { ground } = member.stands;
  const drawnIn = (at: number, low: number, high: number): number => {
    const gap = Math.min(high, Math.max(low, at)) - at;
    return at + Math.sign(gap) * Math.max(0, Math.min(nearer, Math.abs(gap) - clearOfTheWall));
  };
  return { x: drawnIn(spot.x, ground.x0, ground.x1), z: drawnIn(spot.z, ground.z0, ground.z1) };
}
