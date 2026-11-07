import { between, hashSeed, jittered, mulberry32 } from "../clock/random.ts";
import { directionRows, fallbackOf, type PoseName, type Row, rowDuration } from "./skin.ts";
import { nudge, retarget, type Spring, settled, snapped, spring, stepSpring } from "./spring.ts";
import { quickMs, tempos } from "./tempo.ts";

export type Lane = "input" | "needs-you" | "agent" | "ambient";

export const laneRank: Readonly<Record<Lane, number>> = {
  input: 0,
  "needs-you": 1,
  agent: 2,
  ambient: 3,
};

export type Facing = "left" | "right";

export type Place =
  | "tree"
  | "fence"
  | "storehouse"
  | "porch"
  | "door"
  | "bench"
  | "board"
  | "hay"
  | "mill"
  | "gate"
  | `parcel:${string}`;

export type PowerTier = "interact" | "active" | "ambient" | "rest" | "hidden";

export interface MotionPrefs {
  readonly reducedMotion: boolean;
  readonly tier: PowerTier;
}

export type Rows = Readonly<Record<PoseName, Row>>;

export interface Beat {
  readonly clip: PoseName;
  readonly lane: Lane;
  readonly walkTo?: Place;
  readonly stride?: PoseName;
  readonly cycles?: number;
  readonly facing?: Facing;
  readonly after?: Beat;
}

export interface Playing {
  readonly name: PoseName;
  readonly lane: Lane;
  readonly startedAt: number;
  readonly cycleStartedAt: number;
  readonly cycle: number;
  readonly cycles: number;
  readonly seed: number;
  readonly after: Beat | undefined;
}

export interface Walk {
  readonly from: number;
  readonly to: Place;
  readonly startedAt: number;
  readonly duration: number;
  readonly after: Beat;
}

export interface Blink {
  readonly closesAt: number;
  readonly opensAt: number;
}

export interface Gaze {
  readonly direction: number | undefined;
  readonly x: Spring;
  readonly y: Spring;
}

export interface Body {
  readonly at: number;
  readonly seed: number;
  readonly clip: Playing;
  readonly pending: { readonly beat: Beat; readonly switchAt: number } | undefined;
  readonly walk: Walk | undefined;
  readonly x: number;
  readonly place: Place | undefined;
  readonly facing: Facing;
  readonly squash: Spring;
  readonly lift: Spring;
  readonly gaze: Gaze;
  readonly blink: Blink;
  readonly blinks: number;
  readonly accumulator: number;
}

export interface BodyPose {
  readonly clip: PoseName;
  readonly frame: number;
  readonly facing: Facing;
  readonly x: number;
  readonly place: Place | undefined;
  readonly heading: Place | undefined;
  readonly scale: { readonly x: number; readonly y: number };
  readonly lift: number;
  readonly blink: boolean;
  readonly gaze: { readonly direction: number; readonly x: number; readonly y: number } | undefined;
  readonly nextFrameAt: number | undefined;
}

export const stepMs = 1000 / 60;
export const maxFrameMs = 250;
export const slotWalkMs = tempos.drift.min;
export const breathAmplitude = 0.015;
export const gazeDirections = 8;
export const parcelSlot = 11;

export const placeSlots: Readonly<Record<Exclude<Place, `parcel:${string}`>, number>> = {
  tree: 0,
  fence: 1,
  storehouse: 2,
  porch: 3,
  door: 4,
  bench: 5,
  board: 6,
  hay: 7,
  mill: 8,
  gate: 9,
};

export function slotOf(place: Place): number {
  return place.startsWith("parcel:") ? parcelSlot : placeSlots[place as keyof typeof placeSlots];
}

export function createBody(
  at: number,
  seed: number,
  place: Place = "bench",
  facing: Facing = "right",
): Body {
  return {
    at,
    seed,
    clip: playing("idle", "ambient", at, hashSeed(seed, "idle", at), 1, undefined),
    pending: undefined,
    walk: undefined,
    x: slotOf(place),
    place,
    facing,
    squash: spring(1, tempos.settle.min / 4),
    lift: spring(0, tempos.settle.min / 4),
    gaze: {
      direction: undefined,
      x: spring(0, tempos.drift.min / 4),
      y: spring(0, tempos.drift.min / 4),
    },
    blink: scheduleBlink(seed, 0, at),
    blinks: 0,
    accumulator: 0,
  };
}

export function play(body: Body, beat: Beat, prefs: MotionPrefs, rows: Rows): Body {
  const continues = beat.clip === body.clip.name && !answersAfresh(beat, rows);
  if (continues && nothingInFlight(body, beat) && standsAt(body, beat)) {
    return relabeled(body, beat.lane, rows);
  }
  if (!outranks(beat.lane, body, rows)) return body;
  if (alreadyWalkingFor(body, beat) || alreadyPending(body, beat)) return body;
  if (beat.walkTo !== undefined && slotOf(beat.walkTo) !== body.x) {
    return startWalk(body, beat, prefs, rows);
  }
  const standing: Body = {
    ...body,
    facing: beat.facing ?? body.facing,
    walk: undefined,
    pending: undefined,
    place: beat.walkTo ?? body.place,
  };
  if (continues) return relabeled(standing, beat.lane, rows);
  const switchAt = prefs.reducedMotion
    ? body.at
    : Math.min(nextBoundary(body.clip, rows, body.at), body.at + quickMs);
  if (switchAt <= body.at) return begin(standing, beat, body.at);
  return { ...standing, pending: { beat, switchAt } };
}

export function lookToward(body: Body, direction: number | undefined): Body {
  if (direction === body.gaze.direction) return body;
  const target = direction === undefined ? { x: 0, y: 0 } : gazeOffset(direction);
  return {
    ...body,
    gaze: { direction, x: retarget(body.gaze.x, target.x), y: retarget(body.gaze.y, target.y) },
  };
}

export function jolt(body: Body, strength = 0.08): Body {
  return {
    ...body,
    squash: nudge(body.squash, -strength / 50),
    lift: nudge(body.lift, strength * 60),
  };
}

export function advance(body: Body, now: number, prefs: MotionPrefs, rows: Rows): Body {
  let current = body;
  while (current.at < now) {
    const until = Math.min(now, nextEventAt(current, rows) ?? now);
    current = settleEvents(integrate(current, until, prefs), prefs, rows);
  }
  return current;
}

export function bodyPose(body: Body, rows: Rows, prefs: MotionPrefs): BodyPose {
  const row = rows[body.clip.name];
  const frame = prefs.reducedMotion ? 0 : frameAt(body.clip, rows, body.at);
  const breath = prefs.reducedMotion ? 1 : 1 + breathAmplitude * Math.sin(breathPhase(body));
  const squash = prefs.reducedMotion ? 1 : body.squash.value;
  const y = breath * squash;
  const shown = directionRows.has(body.clip.name) ? (body.gaze.direction ?? 0) : frame;
  return {
    clip: body.clip.name,
    frame: Math.min(shown, row.frames - 1),
    facing: body.facing,
    x: body.x,
    place: body.place,
    heading: body.walk?.to,
    scale: { x: 1 / y, y },
    lift: prefs.reducedMotion ? 0 : body.lift.value,
    blink: !prefs.reducedMotion && body.at >= body.blink.closesAt && body.at < body.blink.opensAt,
    gaze:
      body.gaze.direction === undefined
        ? undefined
        : { direction: body.gaze.direction, x: body.gaze.x.value, y: body.gaze.y.value },
    nextFrameAt: nextFrameAt(body, rows, prefs),
  };
}

export function nextFrameAt(body: Body, rows: Rows, prefs: MotionPrefs): number | undefined {
  if (prefs.tier === "hidden") return undefined;
  if (prefs.reducedMotion) return meaningfulChange(body, rows);
  return earliest(
    [nextEventAt(body, rows), body.at + samplingInterval(prefs.tier), nextBlinkEdge(body)],
    body.at,
  );
}

export function frameAt(clip: Playing, rows: Rows, at: number): number {
  const holds = cycleHolds(clip, rows);
  let elapsed = at - clip.cycleStartedAt;
  for (const [index, hold] of holds.entries()) {
    if (elapsed < hold) return index;
    elapsed -= hold;
  }
  return holds.length - 1;
}

export function cycleHolds(clip: Playing, rows: Rows): number[] {
  const random = mulberry32(hashSeed(clip.seed, clip.cycle));
  return rows[clip.name].ms.map((hold) => jittered(random, hold));
}

export function outranks(lane: Lane, body: Body, rows: Rows): boolean {
  const held = body.pending === undefined ? body.clip.lane : body.pending.beat.lane;
  if (laneRank[lane] <= Math.min(laneRank[held], laneRank[body.clip.lane])) return true;
  return body.pending === undefined && finished(body.clip, rows);
}

export function finished(clip: Playing, rows: Rows): boolean {
  return !rows[clip.name].loop && clip.cycle >= clip.cycles;
}

export function sameBeat(a: Beat, b: Beat): boolean {
  return (
    a.clip === b.clip &&
    a.lane === b.lane &&
    a.walkTo === b.walkTo &&
    a.stride === b.stride &&
    (a.cycles ?? 1) === (b.cycles ?? 1) &&
    a.facing === b.facing &&
    sameChain(a.after, b.after)
  );
}

function sameChain(a: Beat | undefined, b: Beat | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return sameBeat(a, b);
}

export function afoot(beat: Beat): Beat {
  const { walkTo: _, ...rest } = beat;
  return rest;
}

export function release(body: Body, lanes: readonly Lane[] = ["needs-you", "agent"]): Body {
  const lowered = (lane: Lane): Lane => (lanes.includes(lane) ? "ambient" : lane);
  return {
    ...body,
    clip: { ...body.clip, lane: lowered(body.clip.lane) },
    pending:
      body.pending === undefined
        ? undefined
        : {
            ...body.pending,
            beat: { ...body.pending.beat, lane: lowered(body.pending.beat.lane) },
          },
    walk:
      body.walk === undefined
        ? undefined
        : { ...body.walk, after: { ...body.walk.after, lane: lowered(body.walk.after.lane) } },
  };
}

export function flying(body: Body, beat: Beat): boolean {
  const bare = afoot(beat);
  if (body.walk !== undefined && sameBeat(body.walk.after, bare)) return true;
  if (body.pending !== undefined && sameBeat(afoot(body.pending.beat), bare)) return true;
  if (body.clip.name === beat.clip && body.clip.lane === beat.lane) return true;
  return beat.after !== undefined && flying(body, { ...beat.after, lane: beat.lane });
}

function alreadyWalkingFor(body: Body, beat: Beat): boolean {
  return (
    body.walk !== undefined &&
    body.walk.to === beat.walkTo &&
    sameBeat(body.walk.after, afoot(beat))
  );
}

function alreadyPending(body: Body, beat: Beat): boolean {
  return body.pending !== undefined && sameBeat(body.pending.beat, beat);
}

function standsAt(body: Body, beat: Beat): boolean {
  return beat.walkTo === undefined || slotOf(beat.walkTo) === body.x;
}

function nothingInFlight(body: Body, beat: Beat): boolean {
  return (
    body.walk === undefined &&
    body.pending === undefined &&
    (beat.facing === undefined || beat.facing === body.facing)
  );
}

function answersAfresh(beat: Beat, rows: Rows): boolean {
  return beat.lane === "input" && !rows[beat.clip].loop;
}

function relabeled(body: Body, lane: Lane, rows: Rows): Body {
  if (body.clip.lane === lane || !rows[body.clip.name].loop) return body;
  return { ...body, clip: { ...body.clip, lane } };
}

function startWalk(body: Body, beat: Beat, prefs: MotionPrefs, rows: Rows): Body {
  const to = beat.walkTo as Place;
  const facing: Facing = slotOf(to) < body.x ? "left" : "right";
  const after = afoot(beat);
  const faced = { ...body, facing, place: undefined };
  if (prefs.reducedMotion) {
    return begin({ ...faced, x: slotOf(to), place: to, walk: undefined }, after, body.at);
  }
  const walk: Walk = {
    from: body.x,
    to,
    startedAt: body.at,
    duration: Math.max(slotWalkMs, Math.abs(slotOf(to) - body.x) * slotWalkMs),
    after,
  };
  const stride: Beat = {
    clip: beat.stride ?? (facing === "left" ? "walk-left" : "walk-right"),
    lane: beat.lane,
  };
  return { ...play({ ...faced, walk: undefined }, stride, prefs, rows), walk };
}

function begin(body: Body, beat: Beat, at: number): Body {
  const seed = hashSeed(body.seed, beat.clip, at);
  const clip = playing(beat.clip, beat.lane, at, seed, beat.cycles ?? 1, beat.after);
  return { ...body, clip, pending: undefined };
}

function playing(
  name: PoseName,
  lane: Lane,
  at: number,
  seed: number,
  cycles: number,
  after: Beat | undefined,
): Playing {
  return { name, lane, startedAt: at, cycleStartedAt: at, cycle: 0, cycles, seed, after };
}

function integrate(body: Body, until: number, prefs: MotionPrefs): Body {
  if (prefs.reducedMotion) {
    return {
      ...body,
      at: until,
      accumulator: 0,
      squash: snapped(body.squash),
      lift: snapped(body.lift),
      gaze: { ...body.gaze, x: snapped(body.gaze.x), y: snapped(body.gaze.y) },
      x: body.walk === undefined ? body.x : slotOf(body.walk.to),
    };
  }
  const elapsed = until - body.at;
  const skipped = Math.max(0, elapsed - maxFrameMs);
  let accumulator = body.accumulator + elapsed - skipped;
  let squash = stepSpring(body.squash, skipped);
  let lift = stepSpring(body.lift, skipped);
  let gazeX = stepSpring(body.gaze.x, skipped);
  let gazeY = stepSpring(body.gaze.y, skipped);
  while (accumulator >= stepMs) {
    accumulator -= stepMs;
    squash = stepSpring(squash, stepMs);
    lift = stepSpring(lift, stepMs);
    gazeX = stepSpring(gazeX, stepMs);
    gazeY = stepSpring(gazeY, stepMs);
  }
  return {
    ...body,
    at: until,
    accumulator,
    squash: restIfSettled(squash),
    lift: restIfSettled(lift),
    gaze: { ...body.gaze, x: restIfSettled(gazeX), y: restIfSettled(gazeY) },
    x: body.walk === undefined ? body.x : walkPosition(body.walk, until),
  };
}

function restIfSettled(current: Spring): Spring {
  return settled(current) ? snapped(current) : current;
}

function settleEvents(body: Body, prefs: MotionPrefs, rows: Rows): Body {
  let current = rollCycles(body, rows);
  if (current.pending !== undefined && current.at >= current.pending.switchAt) {
    current = begin(current, current.pending.beat, current.pending.switchAt);
  }
  if (current.walk !== undefined && current.x === slotOf(current.walk.to)) {
    const arrived = { ...current, walk: undefined, place: current.walk.to };
    current = jolt(play(arrived, current.walk.after, prefs, rows), 0.04);
  }
  if (current.at >= current.blink.opensAt) {
    const blinks = current.blinks + 1;
    current = { ...current, blinks, blink: scheduleBlink(current.seed, blinks, current.at) };
  }
  return current;
}

function rollCycles(body: Body, rows: Rows): Body {
  let clip = body.clip;
  for (;;) {
    const endsAt = clip.cycleStartedAt + sum(cycleHolds(clip, rows));
    if (body.at < endsAt) break;
    const finished = clip.cycle + 1;
    if (!rows[clip.name].loop && finished >= clip.cycles) {
      const next: Beat = clip.after ?? { clip: fallbackOf(rows, clip.name), lane: "ambient" };
      const lane: Lane = clip.after === undefined ? "ambient" : clip.lane;
      const seed = hashSeed(body.seed, next.clip, endsAt);
      const chained = playing(next.clip, lane, endsAt, seed, next.cycles ?? 1, next.after);
      return rollCycles({ ...body, clip: chained }, rows);
    }
    clip = { ...clip, cycle: finished, cycleStartedAt: endsAt };
  }
  return clip === body.clip ? body : { ...body, clip };
}

function nextEventAt(body: Body, rows: Rows): number | undefined {
  return earliest(
    [
      nextBoundary(body.clip, rows, body.at),
      body.pending?.switchAt,
      body.walk === undefined ? undefined : body.walk.startedAt + body.walk.duration,
    ],
    body.at,
  );
}

function meaningfulChange(body: Body, rows: Rows): number | undefined {
  const clip = body.clip;
  if (rows[clip.name].loop && clip.after === undefined) return body.pending?.switchAt;
  const endsAt = clip.startedAt + rowDuration(rows[clip.name]) * clip.cycles;
  return endsAt > body.at ? endsAt : undefined;
}

function nextBoundary(clip: Playing, rows: Rows, at: number): number {
  let boundary = clip.cycleStartedAt;
  for (const hold of cycleHolds(clip, rows)) {
    boundary += hold;
    if (boundary > at) return boundary;
  }
  return boundary;
}

function earliest(candidates: readonly (number | undefined)[], after: number): number | undefined {
  const ahead = candidates.filter((at): at is number => at !== undefined && at > after);
  return ahead.length === 0 ? undefined : Math.min(...ahead);
}

function walkPosition(walk: Walk, at: number): number {
  const progress = Math.min(1, Math.max(0, (at - walk.startedAt) / walk.duration));
  const eased = progress * progress * (3 - 2 * progress);
  return walk.from + (slotOf(walk.to) - walk.from) * eased;
}

function breathPhase(body: Body): number {
  const period = between(
    mulberry32(hashSeed(body.seed, "breath")),
    tempos.breath.min,
    tempos.breath.max,
  );
  return (2 * Math.PI * body.at) / period;
}

function scheduleBlink(seed: number, count: number, from: number): Blink {
  const random = mulberry32(hashSeed(seed, "blink", count));
  const closesAt = from + between(random, 2000, 7000);
  const duration = between(random, 120, 180);
  const double = random() < 0.15;
  return { closesAt, opensAt: closesAt + duration + (double ? 200 + duration : 0) };
}

function nextBlinkEdge(body: Body): number | undefined {
  if (body.at < body.blink.closesAt) return body.blink.closesAt;
  if (body.at < body.blink.opensAt) return body.blink.opensAt;
  return undefined;
}

function samplingInterval(tier: PowerTier): number {
  switch (tier) {
    case "interact":
      return stepMs;
    case "active":
      return 1000 / 30;
    case "ambient":
      return 1000 / 15;
    case "rest":
      return 1000;
    case "hidden":
      return Number.POSITIVE_INFINITY;
  }
}

function gazeOffset(direction: number): { x: number; y: number } {
  const angle = (direction / gazeDirections) * 2 * Math.PI;
  return {
    x: Math.round(Math.cos(angle) * 100) / 100,
    y: Math.round(Math.sin(angle) * 100) / 100,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
