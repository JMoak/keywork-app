import type { Tier } from "./channels.ts";

export const tierOrder: readonly Tier[] = ["hidden", "rest", "ambient", "active", "interact"];

export type ThermalState = "unknown" | "nominal" | "fair" | "serious" | "critical";

export interface TierContext {
  windowShown: boolean;
  locked: boolean;
  foregroundBusy: boolean;
  systemIdle: boolean;
  onBattery: boolean;
  thermal: ThermalState;
  speedLimit: number;
}

export const calmContext: TierContext = {
  windowShown: true,
  locked: false,
  foregroundBusy: false,
  systemIdle: false,
  onBattery: false,
  thermal: "unknown",
  speedLimit: 100,
};

export function ceilingFor(context: TierContext): Tier {
  if (!context.windowShown || context.locked || context.foregroundBusy) return "hidden";
  if (context.systemIdle || throttled(context)) return "rest";
  return "ambient";
}

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

function lowest(a: Tier, b: Tier): Tier {
  return tierOrder.indexOf(a) < tierOrder.indexOf(b) ? a : b;
}

export type Cadence =
  | { kind: "frame"; fps: number }
  | { kind: "event"; maxFps: number }
  | { kind: "timer"; minMs: number; tolerance: number }
  | { kind: "none" };

export function cadenceOf(tier: Tier, onBattery: boolean): Cadence {
  switch (tier) {
    case "interact":
      return { kind: "frame", fps: Number.POSITIVE_INFINITY };
    case "active":
      return { kind: "frame", fps: onBattery ? 24 : 30 };
    case "ambient":
      return { kind: "event", maxFps: onBattery ? 8 : 15 };
    case "rest":
      return { kind: "timer", minMs: 1000, tolerance: 0.1 };
    case "hidden":
      return { kind: "none" };
  }
}

export interface TierBudget {
  cpuPercent: number;
  wakeupsPerSecond: number;
}

export const tierBudgets: Readonly<Record<Tier, TierBudget>> = {
  interact: { cpuPercent: 8, wakeupsPerSecond: Number.POSITIVE_INFINITY },
  active: { cpuPercent: 3, wakeupsPerSecond: 35 },
  ambient: { cpuPercent: 1, wakeupsPerSecond: 16 },
  rest: { cpuPercent: 0.2, wakeupsPerSecond: 1 },
  hidden: { cpuPercent: 0, wakeupsPerSecond: 0 },
};

export const privateMemoryBudgetMb = 80;
export const firstPaintBudgetMs = 500;
export const idlePollSeconds = 300;
export const idlePollEveryMs = 30_000;
export const busyPollEveryMs = 5000;

function throttled(context: TierContext): boolean {
  return (
    context.thermal === "serious" || context.thermal === "critical" || context.speedLimit < 100
  );
}
