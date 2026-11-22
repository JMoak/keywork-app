import { pick, type Random } from "@keywork-app/habitat";
import type { Mood } from "@keywork-app/protocol";
import type { SurfaceId } from "../port.ts";
import type { Start } from "./choreography.ts";

export type { Mood };

export type TurnOrder = "in-line" | "varied" | "at-once";

export interface Pace {
  readonly glide: number;
  readonly gaps: number;
  readonly landing: number;
  readonly order: TurnOrder;
}

export interface Pacing {
  readonly mood: Mood;
  readonly lead?: SurfaceId | undefined;
  readonly random?: Random | undefined;
}

export const paces: Readonly<Record<Mood, Pace>> = {
  calm: { glide: 1.75, gaps: 1.6, landing: 2, order: "in-line" },
  brisk: { glide: 1, gaps: 1, landing: 1, order: "in-line" },
  eager: { glide: 0.7, gaps: 0.5, landing: 0.75, order: "in-line" },
  playful: { glide: 1, gaps: 1, landing: 1, order: "varied" },
  urgent: { glide: 0.8, gaps: 0, landing: 0.75, order: "at-once" },
  decisive: { glide: 0.9, gaps: 0, landing: 1.6, order: "at-once" },
  tentative: { glide: 1.2, gaps: 1.8, landing: 0.5, order: "in-line" },
};

export const paceMetrics = {
  leadAheadMs: 40,
  rhythms: [
    [0.5, 1.5],
    [0.4, 0.4, 2.2],
    [1.6, 0.4],
  ],
} as const;

export const defaultMood: Mood = "brisk";

export const briskly: Pacing = { mood: defaultMood };

export function paceOf(mood: Mood | undefined): Pace {
  return paces[mood ?? defaultMood];
}

export function pacedStarts(starts: readonly Start[], pacing: Pacing): readonly Start[] {
  const pace = paceOf(pacing.mood);
  if (pace.order === "at-once") return atOnce(starts, pacing.lead);
  if (pace.order === "varied") return varied(starts, pacing.random ?? Math.random);
  return pace.gaps === 1 ? starts : starts.map(({ id, atMs }) => ({ id, atMs: beat(atMs, pace) }));
}

export function pacedMs(durationMs: number, pacing: Pacing): number {
  return Math.round(durationMs * paceOf(pacing.mood).glide);
}

export function turnOrders(count: number): readonly (readonly number[])[] {
  return [fromTheMiddle(count), fromBothEnds(count)];
}

function beat(atMs: number, pace: Pace): number {
  return Math.round(atMs * pace.gaps);
}

function atOnce(starts: readonly Start[], lead: SurfaceId | undefined): readonly Start[] {
  const led = starts.some((start) => start.id === lead);
  const together = led ? paceMetrics.leadAheadMs : 0;
  const leadFirst = starts.toSorted((one, other) => rankOf(one, lead) - rankOf(other, lead));
  return leadFirst.map(({ id }) => ({ id, atMs: id === lead ? 0 : together }));
}

function rankOf(start: Start, lead: SurfaceId | undefined): number {
  return start.id === lead ? 0 : 1;
}

function varied(starts: readonly Start[], random: Random): readonly Start[] {
  const inLine = starts.toSorted((one, other) => one.atMs - other.atMs);
  const order = pick(random, turnOrders(inLine.length)) ?? [];
  const beats = beatsOf(inLine, pick(random, paceMetrics.rhythms) ?? [1]);
  return order.flatMap((place, turn) => {
    const start = inLine[place];
    return start === undefined ? [] : [{ id: start.id, atMs: beats[turn] ?? 0 }];
  });
}

function beatsOf(inLine: readonly Start[], rhythm: readonly number[]): number[] {
  const first = inLine[0]?.atMs ?? 0;
  const span = (inLine.at(-1)?.atMs ?? first) - first;
  const gaps = inLine.slice(1).map((_, turn) => rhythm[turn % rhythm.length] ?? 1);
  const whole = gaps.reduce((sum, gap) => sum + gap, 0);
  let elapsed = 0;
  return [
    first,
    ...gaps.map((gap) => {
      elapsed += gap;
      return first + Math.round((span * elapsed) / whole);
    }),
  ];
}

function fromTheMiddle(count: number): number[] {
  const middle = Math.floor((count - 1) / 2);
  return Array.from(
    { length: count },
    (_, turn) => middle + (turn % 2 === 1 ? 1 : -1) * Math.ceil(turn / 2),
  );
}

function fromBothEnds(count: number): number[] {
  return Array.from({ length: count }, (_, turn) =>
    turn % 2 === 0 ? turn / 2 : count - 1 - (turn - 1) / 2,
  );
}
