import type { Lane, Pose, PowerTier } from "@keywork-app/habitat";
import { type SchedulerHost, tierScheduler } from "../../companion/tier-scheduler.ts";

export interface FieldSense {
  hidden(): boolean;
  resting(): boolean;
  lastInputAt(): number;
}

export interface FieldPicture {
  readonly nextWakeAt: number | undefined;
  readonly still: boolean;
}

export type DrawField = (now: number, tier: PowerTier) => FieldPicture;

export interface SteadField {
  tier(): PowerTier;
  wakes(): number;
  frames(): number;
  request(): void;
  redraw(): void;
  stop(): void;
}

export const interactHoldMs = 1000;
export const activeFrameMs = 1000 / 30;

export function tierAt(
  now: number,
  lastInputAt: number,
  hidden: boolean,
  resting: boolean,
): PowerTier {
  if (hidden) return "hidden";
  if (now - lastInputAt < interactHoldMs) return "interact";
  return resting ? "rest" : "ambient";
}

export function standingStill(pose: Pose): boolean {
  return pose.heading === undefined && pose.lift === 0 && pose.gaze === undefined;
}

export function restfulMotion(pose: Pose, lane: Lane): boolean {
  return standingStill(pose) || lane === "ambient";
}

export function samplingTier(tier: PowerTier, everyoneStill: boolean): PowerTier {
  return tier === "ambient" && everyoneStill ? "rest" : tier;
}

export function steadField(host: SchedulerHost, sense: FieldSense, drawAt: DrawField): SteadField {
  let still = true;
  let wakes = 0;
  let frames = 0;
  let queued = false;
  let retiering = false;

  const tierNow = (now: number): PowerTier =>
    tierAt(now, sense.lastInputAt(), sense.hidden(), sense.resting() && still);

  const draw = (now: number): number | undefined => {
    wakes += 1;
    const picture = drawAt(now, tierNow(now));
    still = picture.still;
    if (!retiering && tierNow(now) !== scheduler.tier()) request();
    return picture.nextWakeAt;
  };
  const scheduler = tierScheduler(
    countingFrames(host, () => (frames += 1)),
    draw,
  );

  const retier = (): void => {
    retiering = true;
    try {
      const tier = tierNow(host.now());
      if (tier === scheduler.tier()) scheduler.poke();
      else scheduler.setTier(tier, false);
      const settled = tierNow(host.now());
      if (settled !== scheduler.tier()) scheduler.setTier(settled, false);
    } finally {
      retiering = false;
    }
  };
  const request = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      retier();
    });
  };

  return {
    tier: () => scheduler.tier(),
    wakes: () => wakes,
    frames: () => frames,
    request,
    redraw: retier,
    stop: () => scheduler.stop(),
  };
}

export function browserFieldHost(): SchedulerHost {
  const timeout = (handle: unknown) => handle as ReturnType<typeof setTimeout>;
  return {
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(timeout(handle)),
    requestAnimationFrame: (fn) =>
      displayFrames() ? requestAnimationFrame(fn) : setTimeout(() => fn(Date.now()), activeFrameMs),
    cancelAnimationFrame: (handle) =>
      displayFrames() ? cancelAnimationFrame(handle as number) : clearTimeout(timeout(handle)),
    random: () => Math.random(),
  };
}

function displayFrames(): boolean {
  return typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function";
}

function countingFrames(host: SchedulerHost, count: () => void): SchedulerHost {
  return {
    ...host,
    requestAnimationFrame: (fn) =>
      host.requestAnimationFrame((at) => {
        count();
        fn(at);
      }),
  };
}
