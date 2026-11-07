import type { Tier } from "./port.ts";

export interface SchedulerHost {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  requestAnimationFrame(fn: (t: number) => void): unknown;
  cancelAnimationFrame(handle: unknown): void;
  random(): number;
}

export type Draw = (now: number) => number | undefined;

export interface TierScheduler {
  tier(): Tier;
  setTier(tier: Tier, onBattery: boolean): void;
  setStill(still: boolean): void;
  poke(): void;
  takeWakeups(): number;
  stop(): void;
}

export const tierOrder: readonly Tier[] = ["hidden", "rest", "ambient", "active", "interact"];

export function effectiveTier(ceiling: Tier, desire: Tier): Tier {
  switch (ceiling) {
    case "hidden":
      return "hidden";
    case "rest":
      return desire === "interact" ? "interact" : lowest(desire, "rest");
    default:
      return desire;
  }
}

export interface Cadence {
  minGapMs: number;
  tolerance: number;
  frameLoop: boolean;
}

export function cadenceOf(tier: Tier, onBattery: boolean): Cadence {
  switch (tier) {
    case "interact":
      return { minGapMs: 0, tolerance: 0, frameLoop: true };
    case "active":
      return { minGapMs: 1000 / (onBattery ? 24 : 30), tolerance: 0, frameLoop: false };
    case "ambient":
      return { minGapMs: 1000 / (onBattery ? 8 : 15), tolerance: 0, frameLoop: false };
    case "rest":
      return { minGapMs: 1000, tolerance: 0.1, frameLoop: false };
    case "hidden":
      return { minGapMs: Number.POSITIVE_INFINITY, tolerance: 0, frameLoop: false };
  }
}

export function tierScheduler(host: SchedulerHost, draw: Draw): TierScheduler {
  let tier: Tier = "hidden";
  let cadence = cadenceOf("hidden", false);
  let still = false;
  let wakeups = 0;
  let lastDraw = Number.NEGATIVE_INFINITY;
  let timer: unknown;
  let frame: unknown;
  let stopped = false;

  const cancel = (): void => {
    if (timer !== undefined) host.clearTimeout(timer);
    if (frame !== undefined) host.cancelAnimationFrame(frame);
    timer = undefined;
    frame = undefined;
  };

  const paint = (): number | undefined => {
    const now = host.now();
    lastDraw = now;
    return draw(now);
  };

  const schedule = (nextChangeAt: number | undefined): void => {
    cancel();
    if (stopped || tier === "hidden") return;
    if (cadence.frameLoop) {
      frame = host.requestAnimationFrame(() => {
        wakeups += 1;
        schedule(paint());
      });
      return;
    }
    if (still || nextChangeAt === undefined) return;
    const earliest = lastDraw + cadence.minGapMs * (1 + cadence.tolerance * host.random());
    const delay = Math.max(0, Math.max(nextChangeAt, earliest) - host.now());
    timer = host.setTimeout(() => {
      wakeups += 1;
      schedule(paint());
    }, delay);
  };

  const restart = (): void => {
    if (stopped || tier === "hidden") {
      cancel();
      return;
    }
    schedule(paint());
  };

  return {
    tier: () => tier,
    setTier: (next, onBattery) => {
      const changed = next !== tier;
      tier = next;
      cadence = cadenceOf(next, onBattery);
      if (changed || !cadence.frameLoop) restart();
    },
    setStill: (next) => {
      still = next;
      restart();
    },
    poke: restart,
    takeWakeups: () => {
      const count = wakeups;
      wakeups = 0;
      return count;
    },
    stop: () => {
      stopped = true;
      cancel();
    },
  };
}

function lowest(a: Tier, b: Tier): Tier {
  return tierOrder.indexOf(a) < tierOrder.indexOf(b) ? a : b;
}
