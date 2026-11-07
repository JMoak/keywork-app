import type { Random } from "../clock/random.ts";

export type Tempo = "snap" | "quick" | "settle" | "express" | "drift" | "breath";

export interface TempoRange {
  readonly min: number;
  readonly max: number;
}

export const tempos: Readonly<Record<Tempo, TempoRange>> = {
  snap: { min: 90, max: 90 },
  quick: { min: 160, max: 160 },
  settle: { min: 260, max: 260 },
  express: { min: 420, max: 420 },
  drift: { min: 700, max: 1200 },
  breath: { min: 4200, max: 5000 },
};

export const ambientTempos: readonly Tempo[] = ["drift", "breath"];

export const quickMs = tempos.quick.min;

export function tempoMs(name: Tempo, random: Random = () => 0.5): number {
  const range = tempos[name];
  return range.min + (range.max - range.min) * random();
}

export function isAmbientTempo(name: Tempo): boolean {
  return ambientTempos.includes(name);
}
