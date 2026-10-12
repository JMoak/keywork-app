import type { CuringStage, Provenance } from "@keywork-app/protocol";
import type { GaugeCell } from "../../instruments/context.ts";
import type { DensityLevel } from "../../theme/schema.ts";

export const curingStages: readonly CuringStage[] = [0, 1, 2, 3];

export const rampWidth = 8;

export function curingCell(stage: CuringStage): GaugeCell {
  return ramp[stage];
}

export function curingWord(stage: CuringStage): string {
  return curingWords[stage];
}

export function provenanceCell(provenance: Provenance): GaugeCell {
  return provenanceCells[provenance];
}

export function curingRampCells(
  tally: Readonly<Record<CuringStage, number>>,
  width = rampWidth,
): GaugeCell[] {
  const counts = curingStages.map((stage) => tally[stage]);
  if (counts.every((count) => count === 0)) return repeat(emptyCell, width);
  const cells = shareCells(counts, width);
  return curingStages.flatMap((stage, index) => repeat(ramp[stage], cells[index] ?? 0));
}

export function curingReadout(tally: Readonly<Record<CuringStage, number>>): string {
  return curingStages
    .filter((stage) => tally[stage] > 0)
    .map((stage) => `${tally[stage]} ${curingWords[stage]}`)
    .join(" · ");
}

export function budgetCells(used: number, budget: number, width = rampWidth): GaugeCell[] {
  if (budget <= 0) return repeat(emptyCell, width);
  const filled = Math.min(width, Math.round((used / budget) * width));
  return [...repeat(ramp[3], filled), ...repeat(emptyCell, width - filled)];
}

export function budgetReadout(used: number, budget: number): string {
  return `prompt ${used} of ${budget} tokens`;
}

function shareCells(counts: readonly number[], width: number): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const exact = counts.map((count) => (count / total) * width);
  const cells = exact.map((share) => (share === 0 ? 0 : Math.max(1, Math.floor(share))));
  let spare = width - cells.reduce((sum, count) => sum + count, 0);
  const byRemainder = rank(exact.map((share, index) => share - (cells[index] ?? 0)));
  for (const index of byRemainder) {
    if (spare <= 0) break;
    if ((cells[index] ?? 0) === 0) continue;
    cells[index] = (cells[index] ?? 0) + 1;
    spare -= 1;
  }
  while (spare < 0) {
    const largest = rank(cells)[0] ?? 0;
    cells[largest] = (cells[largest] ?? 1) - 1;
    spare += 1;
  }
  return cells;
}

function rank(values: readonly number[]): number[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value)
    .map((entry) => entry.index);
}

function repeat(cell: GaugeCell, times: number): GaugeCell[] {
  return Array.from({ length: Math.max(0, times) }, () => cell);
}

const ramp: Record<CuringStage, GaugeCell> = {
  0: { glyph: "░", level: "light" },
  1: { glyph: "▒", level: "medium" },
  2: { glyph: "▓", level: "heavy" },
  3: { glyph: "█", level: "full" },
};

const curingWords: Record<CuringStage, string> = {
  0: "fresh",
  1: "curing",
  2: "cured",
  3: "settled",
};

const provenanceCells: Record<Provenance, GaugeCell> = {
  user: ramp[3],
  agent: ramp[2],
  untrusted: ramp[0],
};

const emptyCell: GaugeCell = { glyph: "·", level: "empty" satisfies DensityLevel | "empty" };
