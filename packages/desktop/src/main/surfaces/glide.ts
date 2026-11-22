import type { ScreenPoint, ScreenRect } from "./channels.ts";
import type { EveryFrame } from "./pacer.ts";

export function easedToRest(progress: number): number {
  return 1 - (1 - Math.min(1, Math.max(0, progress))) ** 5;
}

export interface GlideClock {
  now(): number;
  everyFrame: EveryFrame;
}

export interface Glidable {
  position(): ScreenPoint;
  moveTo(point: ScreenPoint): void;
}

export interface GlideTrack<Key> {
  readonly key: Key;
  readonly body: Glidable;
  readonly to: ScreenPoint;
}

export interface Glider<Key> {
  run(tracks: readonly GlideTrack<Key>[], durationMs: number): Promise<void>;
  gliding(key: Key): boolean;
  drop(key: Key): void;
  stop(): void;
}

export function glider<Key>(clock: GlideClock): Glider<Key> {
  const runs = new Set<Run<Key>>();
  let stopTicking: (() => void) | undefined;

  const finish = (run: Run<Key>): void => {
    if (!runs.delete(run)) return;
    run.settled();
    if (runs.size > 0) return;
    stopTicking?.();
    stopTicking = undefined;
  };

  const drop = (key: Key): void => {
    for (const run of [...runs]) {
      if (run.legs.delete(key) && run.legs.size === 0) finish(run);
    }
  };

  const advance = (run: Run<Key>, now: number): void => {
    const progress = (now - run.startedAt) / run.durationMs;
    for (const leg of [...run.legs.values()]) step(leg, pointAlong(leg, easedToRest(progress)));
    if (progress >= 1) finish(run);
  };

  const tick = (): void => {
    const now = clock.now();
    for (const run of [...runs]) advance(run, now);
  };

  return {
    run: (tracks, durationMs) => {
      for (const track of tracks) drop(track.key);
      if (!(durationMs > 0)) return jumped(tracks);
      const legs = new Map(tracks.map((track) => [track.key, legOf(track)] as const));
      const moving = new Map([...legs].filter(([, leg]) => !samePoint(leg.from, leg.to)));
      if (moving.size === 0) return Promise.resolve();
      return new Promise((settled) => {
        runs.add({ startedAt: clock.now(), durationMs, legs: moving, settled });
        stopTicking ??= clock.everyFrame(tick);
      });
    },
    gliding: (key) => [...runs].some((run) => run.legs.has(key)),
    drop,
    stop: () => {
      for (const run of [...runs]) finish(run);
    },
  };
}

export interface FrameJourney {
  readonly from: ScreenRect;
  readonly to: ScreenRect;
  readonly durationMs: number;
  place(frame: ScreenRect): void;
  arrived(): void;
}

export interface FrameGlide {
  halt(): void;
}

export function glideFrame(clock: GlideClock, journey: FrameJourney): FrameGlide {
  const { from, to, durationMs } = journey;
  if (!(durationMs > 0) || sameFrame(from, to)) {
    journey.place(to);
    journey.arrived();
    return { halt: () => undefined };
  }
  const startedAt = clock.now();
  let at = from;
  let stopTicking: (() => void) | undefined;
  const halt = (): void => {
    stopTicking?.();
    stopTicking = undefined;
  };
  const tick = (): void => {
    const progress = (clock.now() - startedAt) / durationMs;
    const next = progress >= 1 ? to : frameAlong(from, to, easedToRest(progress));
    if (!sameFrame(next, at)) journey.place(next);
    at = next;
    if (progress < 1) return;
    halt();
    journey.arrived();
  };
  stopTicking = clock.everyFrame(tick);
  return { halt };
}

interface Leg {
  readonly body: Glidable;
  readonly from: ScreenPoint;
  readonly to: ScreenPoint;
  at: ScreenPoint;
}

interface Run<Key> {
  readonly startedAt: number;
  readonly durationMs: number;
  readonly legs: Map<Key, Leg>;
  readonly settled: () => void;
}

function jumped<Key>(tracks: readonly GlideTrack<Key>[]): Promise<void> {
  for (const track of tracks) track.body.moveTo(track.to);
  return Promise.resolve();
}

function legOf<Key>(track: GlideTrack<Key>): Leg {
  const from = track.body.position();
  return { body: track.body, from, to: track.to, at: from };
}

function pointAlong(leg: Leg, eased: number): ScreenPoint {
  return {
    x: leg.from.x + Math.round((leg.to.x - leg.from.x) * eased),
    y: leg.from.y + Math.round((leg.to.y - leg.from.y) * eased),
  };
}

function step(leg: Leg, point: ScreenPoint): void {
  if (samePoint(point, leg.at)) return;
  leg.at = point;
  leg.body.moveTo(point);
}

function samePoint(a: ScreenPoint, b: ScreenPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function frameAlong(from: ScreenRect, to: ScreenRect, eased: number): ScreenRect {
  const between = (start: number, end: number): number => start + Math.round((end - start) * eased);
  return {
    x: between(from.x, to.x),
    y: between(from.y, to.y),
    width: between(from.width, to.width),
    height: between(from.height, to.height),
  };
}

function sameFrame(a: ScreenRect, b: ScreenRect): boolean {
  return samePoint(a, b) && a.width === b.width && a.height === b.height;
}
