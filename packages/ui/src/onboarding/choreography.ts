import { type PoseName, type Row, type Rows, rowDuration } from "@keywork-app/habitat";
import {
  cropped,
  type EggFrame,
  eggGroundLine,
  eggSprite,
  type RoleSprite,
  type Shard,
  shardsOf,
} from "./egg.ts";
import { type Beat, hatchScore } from "./onboarding.ts";

export interface Scene {
  readonly egg: EggPose | undefined;
  readonly creature: CreaturePose | undefined;
  readonly shards: readonly PlacedShard[];
  readonly light: readonly Span[];
  readonly rests: number;
}

export interface EggPose {
  readonly frame: EggFrame;
  readonly lift: number;
  readonly shift: number;
}

export interface CreaturePose {
  readonly clip: PoseName;
  readonly frame: number;
  readonly lift: number;
  readonly asLight: boolean;
}

export interface PlacedShard {
  readonly sprite: RoleSprite;
  readonly left: number;
  readonly top: number;
  readonly thin: boolean;
}

export interface Span {
  readonly from: number;
  readonly to: number;
}

export interface Room {
  readonly rows: Rows | undefined;
  readonly halfWidth: number;
  readonly reach: number;
}

export type Cue = "egg" | Beat | "met" | "turned";

export interface Performance {
  cue(cue: Cue, now: number): void;
  sceneAt(now: number, room: Room): Scene;
}

export const moving = 0;
export const settled = Number.POSITIVE_INFINITY;

export const rock: readonly Key<EggPose>[] = [
  { shown: eggPose("tilt-left"), ms: 250 },
  { shown: eggPose("tilt-right"), ms: 250 },
];
export const rockBack: readonly Key<EggPose>[] = [...rock].reverse();
export const squashAndHop: readonly Key<EggPose>[] = [
  { shown: eggPose("squash"), ms: 190 },
  { shown: eggPose("rest", 2), ms: 110 },
  { shown: eggPose("rest", 1), ms: 70 },
];
export const fidgets: readonly (readonly Key<EggPose>[])[] = [rock, rockBack, squashAndHop, rock];
export const firstFidgetMs = [1100, 2300] as const;
export const fidgetGapMs = [1700, 5200] as const;

export const jolts: Readonly<Partial<Record<Beat, readonly Key<EggPose>[]>>> = {
  crack: [{ shown: eggPose("crack", 0, 1), ms: 60 }],
  split: [
    { shown: eggPose("split", 0, -1), ms: 50 },
    { shown: eggPose("split", 0, 1), ms: 50 },
  ],
  open: [{ shown: eggPose("open", 1), ms: 60 }],
};

export const heldGlow: readonly Key<EggFrame>[] = [
  { shown: "glow", ms: 380 },
  { shown: "split", ms: 120 },
];

export const lookHop: readonly Key<number>[] = [
  { shown: 3, ms: 70 },
  { shown: 1, ms: 60 },
];

export const shellThinsMs = 625;
export const shellGoneMs = 1000;
export const lightRunsMs = 750;
export const lightTailStartsMs = 300;
export const waveForMs = 1400;
export const glanceGapMs = [5200, 9800] as const;
export const glanceFrames = 2;

export function createPerformance(random: () => number, reduced: () => boolean): Performance {
  let stage: Exclude<Cue, "turned"> = "egg";
  let stageAt = 0;
  let releasedAt: number | undefined;
  let idleAt: number | undefined;
  let hopAt: number | undefined;
  let fidget: readonly Key<EggPose>[] | undefined;
  let fidgetAt: number | undefined;
  let glance: readonly number[] = [];
  let glanceAt: number | undefined;

  const between = ([least, most]: readonly [number, number]): number =>
    least + random() * (most - least);

  const forget = (): void => {
    releasedAt = undefined;
    idleAt = undefined;
    hopAt = undefined;
    fidget = undefined;
    fidgetAt = undefined;
    glance = [];
    glanceAt = undefined;
  };

  const waitingEgg = (now: number): Moment<EggPose> => {
    fidgetAt ??= now + between(firstFidgetMs);
    if (now < fidgetAt) return { shown: restingEgg, rests: fidgetAt - now };
    fidget ??= fidgets[Math.floor(random() * fidgets.length)] ?? rock;
    const held = keyAt(fidget, now - fidgetAt);
    if (held !== undefined) return held;
    fidget = undefined;
    fidgetAt = now + between(fidgetGapMs);
    return { shown: restingEgg, rests: fidgetAt - now };
  };

  const hatchingEgg = (now: number, beat: Beat, frame: EggFrame): Moment<EggPose> => {
    const jolted = keyAt(jolts[beat] ?? [], now - stageAt);
    if (jolted !== undefined) return jolted;
    const overtime = now - stageAt - msOf(beat);
    if (beat !== "glow") return { shown: eggPose(frame), rests: settled };
    if (overtime < 0) return { shown: eggPose(frame), rests: -overtime };
    const flicker = keyAt(heldGlow, overtime % totalOf(heldGlow));
    return { shown: eggPose(flicker?.shown ?? frame), rests: flicker?.rests ?? moving };
  };

  const eggAt = (now: number): Moment<EggPose> | undefined => {
    if (stage === "egg") return reduced() ? { shown: restingEgg, rests: settled } : waitingEgg(now);
    if (stage === "met") return undefined;
    const frame = beatFrames[stage];
    return frame === undefined ? undefined : hatchingEgg(now, stage, frame);
  };

  const glancing = (now: number, look: Row): Moment<Clip> | undefined => {
    glanceAt ??= now + between(glanceGapMs);
    if (now < glanceAt) return undefined;
    if (glance.length === 0) glance = glancesIn(look, random);
    const hold = look.ms[0] ?? settled;
    const frame = glance[Math.floor((now - glanceAt) / hold)];
    if (frame !== undefined) {
      return { shown: { clip: "look", frame }, rests: hold - ((now - glanceAt) % hold) };
    }
    glance = [];
    glanceAt = now + between(glanceGapMs);
    idleAt = now;
    return undefined;
  };

  const idling = (now: number, rows: Rows): Moment<Clip> => {
    idleAt ??= now;
    const glanced = glancing(now, rows.look);
    if (glanced !== undefined) return glanced;
    const held = loopAt(rows.idle, now - idleAt);
    return {
      shown: { clip: "idle", frame: held.shown },
      rests: Math.min(held.rests, (glanceAt ?? settled) - now),
    };
  };

  const meeting = (now: number, rows: Rows): Moment<Clip> => {
    const waved = now - stageAt;
    if (idleAt !== undefined || waved >= wavingMs(rows.wave)) return idling(now, rows);
    const held = loopAt(rows.wave, waved);
    return { shown: { clip: "wave", frame: held.shown }, rests: held.rests };
  };

  const creatureAt = (now: number, rows: Rows | undefined): Moment<CreaturePose> | undefined => {
    if (rows === undefined) return undefined;
    if (stage === "light") {
      return { shown: { clip: "celebrate", frame: 0, lift: 0, asLight: true }, rests: settled };
    }
    if (stage === "arrive") {
      const held = loopAt(rows.celebrate, now - stageAt);
      const shown = { clip: "celebrate" as const, frame: held.shown, lift: 0, asLight: false };
      return { shown, rests: held.rests };
    }
    if (stage !== "met") return undefined;
    if (reduced()) return { shown: stillCreature, rests: settled };
    const hop = hopAt === undefined ? undefined : keyAt(lookHop, now - hopAt);
    const pose = meeting(now, rows);
    return {
      shown: { ...pose.shown, lift: hop?.shown ?? 0, asLight: false },
      rests: Math.min(pose.rests, hop?.rests ?? settled),
    };
  };

  const shardsAt = (now: number, halfWidth: number): Moment<readonly PlacedShard[]> => {
    const flown = releasedAt === undefined ? shellGoneMs : now - releasedAt;
    if (stage === "light" || flown >= shellGoneMs) return { shown: [], rests: settled };
    const thin = flown >= shellThinsMs;
    return {
      shown: flightsFor(halfWidth).map((flight) => ({
        sprite: flight.sprite,
        ...placeAt(flight, flown),
        thin,
      })),
      rests: moving,
    };
  };

  const lightAt = (now: number, reach: number): Moment<readonly Span[]> => {
    const run = releasedAt === undefined ? lightRunsMs : now - releasedAt;
    if (run >= lightRunsMs) return { shown: [], rests: settled };
    const lead = Math.round((reach * run) / lightRunsMs);
    const tail = Math.round(
      (lead * Math.max(0, run - lightTailStartsMs)) / (lightRunsMs - lightTailStartsMs),
    );
    const lit =
      tail === 0
        ? [{ from: -lead, to: lead }]
        : [
            { from: -lead, to: -tail },
            { from: tail, to: lead },
          ];
    return { shown: lit, rests: moving };
  };

  return {
    cue: (cue, now) => {
      if (cue === "turned") {
        hopAt = now;
        idleAt = now;
        glance = [];
        glanceAt = undefined;
        return;
      }
      if (cue === "egg") forget();
      if (cue === "light") releasedAt = now;
      stage = cue;
      stageAt = now;
    },
    sceneAt: (now, room) => {
      const egg = eggAt(now);
      const creature = creatureAt(now, room.rows);
      const shards = shardsAt(now, room.halfWidth);
      const light = lightAt(now, room.reach);
      return {
        egg: egg?.shown,
        creature: creature?.shown,
        shards: shards.shown,
        light: light.shown,
        rests: Math.min(
          egg?.rests ?? settled,
          creature?.rests ?? settled,
          shards.rests,
          light.rests,
        ),
      };
    },
  };
}

export function eggPose(frame: EggFrame, lift = 0, shift = 0): EggPose {
  return { frame, lift, shift };
}

export interface Key<Shown> {
  readonly shown: Shown;
  readonly ms: number;
}

export interface Moment<Shown> {
  readonly shown: Shown;
  readonly rests: number;
}

export function keyAt<Shown>(
  keys: readonly Key<Shown>[],
  elapsed: number,
): Moment<Shown> | undefined {
  let ends = 0;
  for (const key of keys) {
    ends += key.ms;
    if (elapsed < ends) return { shown: key.shown, rests: ends - elapsed };
  }
  return undefined;
}

export function loopAt(row: Row, elapsed: number): Moment<number> {
  const keys = row.ms.map((ms, frame) => ({ shown: frame, ms }));
  const around = Math.max(1, rowDuration(row));
  return keyAt(keys, ((elapsed % around) + around) % around) ?? { shown: 0, rests: settled };
}

export function wavingMs(wave: Row): number {
  const once = Math.max(1, rowDuration(wave));
  return Math.max(1, Math.round(waveForMs / once)) * once;
}

type Clip = Pick<CreaturePose, "clip" | "frame">;

interface Flight {
  readonly sprite: Shard;
  readonly from: Point;
  readonly to: Point;
  readonly ms: number;
  readonly rise: number;
}

interface Point {
  readonly left: number;
  readonly top: number;
}

const restingEgg = eggPose("rest");
const stillCreature: CreaturePose = { clip: "idle", frame: 0, lift: 0, asLight: false };

const beatFrames: Readonly<Record<Beat, EggFrame | undefined>> = {
  still: "rest",
  crack: "crack",
  split: "split",
  glow: "glow",
  open: "open",
  light: undefined,
  arrive: undefined,
};

const cap = cropped(eggSprite("shell-cap"));
const fragments = shardsOf(eggSprite("fragments"));
const capLiftedTo = 23;
const seamHeight = 17;
const landingGap = 4;
const capFlight = { ms: 330, rise: 8 } as const;
const fragmentFlight = { ms: 230, laterBy: 45, rise: 6, higherBy: 2 } as const;

function flightsFor(halfWidth: number): Flight[] {
  const firstFragment = Math.min(...fragments.map((piece) => piece.left));
  return [
    {
      sprite: cap,
      from: { left: -Math.ceil(cap.width / 2), top: -capLiftedTo - cap.height },
      to: { left: -halfWidth - landingGap - cap.width, top: -cap.height },
      ...capFlight,
    },
    ...fragments.map((piece, index) => ({
      sprite: piece,
      from: { left: -Math.ceil(piece.width / 2), top: -seamHeight - piece.height },
      to: {
        left: halfWidth + landingGap + piece.left - firstFragment,
        top: piece.top - eggGroundLine,
      },
      ms: fragmentFlight.ms + index * fragmentFlight.laterBy,
      rise: fragmentFlight.rise + index * fragmentFlight.higherBy,
    })),
  ];
}

function placeAt(flight: Flight, elapsed: number): Point {
  const along = Math.min(1, Math.max(0, elapsed / flight.ms));
  const arc = flight.rise * 4 * along * (1 - along);
  return {
    left: Math.round(flight.from.left + (flight.to.left - flight.from.left) * along),
    top: Math.round(flight.from.top + (flight.to.top - flight.from.top) * along - arc),
  };
}

function glancesIn(look: Row, random: () => number): number[] {
  return Array.from({ length: glanceFrames }, () => Math.floor(random() * look.frames));
}

function msOf(beat: Beat): number {
  return hatchScore.find((step) => step.beat === beat)?.ms ?? 0;
}

function totalOf(keys: readonly Key<unknown>[]): number {
  return keys.reduce((sum, key) => sum + key.ms, 0);
}
