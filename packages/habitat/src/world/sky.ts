import { localTime } from "../clock/clock.ts";

export type SkyPhase = "night" | "dawn" | "day" | "dusk";

export type Season = "winter" | "spring" | "summer" | "autumn";

export interface Sky {
  readonly hour: number;
  readonly phase: SkyPhase;
  readonly light: number;
  readonly season: Season;
}

export function skyAt(now: number, offsetMinutes: number, southern = false): Sky {
  const { hour, month } = localTime(now, offsetMinutes);
  return { hour, phase: phaseOf(hour), light: lightOf(hour), season: seasonOf(month, southern) };
}

export function phaseOf(hour: number): SkyPhase {
  if (hour < 5 || hour >= 21) return "night";
  if (hour < 8) return "dawn";
  if (hour < 18) return "day";
  return "dusk";
}

export function lightOf(hour: number): number {
  const ramp = (from: number, to: number): number =>
    Math.min(1, Math.max(0, (hour - from) / (to - from)));
  if (hour < 5 || hour >= 21) return 0;
  if (hour < 8) return ramp(5, 8);
  if (hour < 18) return 1;
  return 1 - ramp(18, 21);
}

export function seasonOf(month: number, southern = false): Season {
  const northern: Season =
    month <= 2 || month === 12
      ? "winter"
      : month <= 5
        ? "spring"
        : month <= 8
          ? "summer"
          : "autumn";
  return southern ? flipped[northern] : northern;
}

const flipped: Readonly<Record<Season, Season>> = {
  winter: "summer",
  spring: "autumn",
  summer: "winter",
  autumn: "spring",
};
