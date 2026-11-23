import {
  type BlockWorld,
  type Camera,
  type CastMember,
  journey,
  type Plot,
  type Point,
  pathLength,
  pointAlong,
  type Stand,
  type Standing,
  standingFor,
} from "@keywork-app/habitat/block";

export interface Troupe {
  standing(world: BlockWorld, rest: Camera, now: number, reduced: boolean): Standing;
  walking(): boolean;
}

export const stepMs = 50;
export const strideLength = 4;
export const dawdleMs = 55;
export const dawdles = 8;

export function createTroupe(): Troupe {
  const tracks = new Map<string, Track>();
  return {
    standing: (world, rest, now, reduced) => {
      const wanted = standingFor(world, rest);
      const standing = new Map<string, Stand>();
      for (const member of world.cast) {
        const to = wanted.get(member.slug);
        if (to === undefined) continue;
        const track = headedFor(tracks.get(member.slug), member, to, now, reduced);
        tracks.set(member.slug, track);
        standing.set(member.slug, standAt(track, now));
      }
      for (const slug of tracks.keys()) if (!standing.has(slug)) tracks.delete(slug);
      return standing;
    },
    walking: () => [...tracks.values()].some((track) => track.walk !== undefined),
  };
}

export function paceOf(member: Pick<CastMember, "order" | "still">): number {
  return member.still ? 2 : 3 + (member.order % 2);
}

export function dawdleOf(order: number): number {
  return ((order * 5) % dawdles) * dawdleMs;
}

interface Walk {
  readonly path: readonly Point[];
  readonly length: number;
  readonly startsAt: number;
  readonly pace: number;
}

interface Track {
  readonly to: Point;
  readonly plot: Plot;
  walk: Walk | undefined;
}

function headedFor(
  track: Track | undefined,
  member: CastMember,
  to: Point,
  now: number,
  reduced: boolean,
): Track {
  if (track === undefined || reduced) return { to, plot: member.stands, walk: undefined };
  if (track.to.x === to.x && track.to.z === to.z) return track;
  const path = journey(member, track.plot, standAt(track, now), to);
  return {
    to,
    plot: member.stands,
    walk: {
      path,
      length: pathLength(path),
      startsAt: now + (track.walk === undefined ? dawdleOf(member.order) : 0),
      pace: paceOf(member),
    },
  };
}

function standAt(track: Track, now: number): Stand {
  const walk = track.walk;
  if (walk === undefined) return track.to;
  const travelled = Math.floor(Math.max(0, now - walk.startsAt) / stepMs) * walk.pace;
  if (travelled >= walk.length) {
    track.walk = undefined;
    return track.to;
  }
  return { ...pointAlong(walk.path, travelled), stride: Math.floor(travelled / strideLength) };
}
