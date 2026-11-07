export interface Clock {
  now(): number;
}

export interface FakeClock extends Clock {
  advance(ms: number): number;
  set(ms: number): void;
}

export const second = 1_000;
export const minute = 60 * second;
export const hour = 60 * minute;
export const day = 24 * hour;

export const systemClock: Clock = { now: () => Date.now() };

export function fakeClock(start = 0): FakeClock {
  let at = start;
  return {
    now: () => at,
    advance: (ms) => {
      at += Math.max(0, ms);
      return at;
    },
    set: (ms) => {
      at = ms;
    },
  };
}

export interface LocalTime {
  readonly dayKey: string;
  readonly hour: number;
  readonly month: number;
}

export function localTime(ms: number, offsetMinutes = new Date(ms).getTimezoneOffset()): LocalTime {
  const shifted = new Date(ms - offsetMinutes * minute);
  return {
    dayKey: shifted.toISOString().slice(0, 10),
    hour: (shifted.getTime() % day) / hour,
    month: shifted.getUTCMonth() + 1,
  };
}

export function parseTs(ts: string): number {
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? 0 : parsed;
}
