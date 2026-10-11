import type { CostReport, CostRollup, ModelCost, Usage } from "@keywork-app/protocol";
import { formatCost, formatTokens } from "./format.ts";

export function reportedUsageLine(report: CostReport): string {
  const tokens = report.usage.inputTokens + report.usage.outputTokens;
  if (turnsOf(report.rollup) === 0) return tokens === 0 ? "" : `${formatTokens(tokens)} tokens`;
  return [`${formatTokens(tokens)} tokens`, spendItem(report.rollup)].join(" · ");
}

export function costReadout(report: CostReport, model: string | undefined): string[] {
  if (turnsOf(report.rollup) === 0) return ["no usage yet · send a prompt first"];
  return [
    tokenLine(report.usage),
    spendLine(report, model),
    ...(report.cacheMiss === undefined ? [] : [cacheMissLine(report.cacheMiss)]),
    ...report.models.map(lineageLine),
  ];
}

function spendItem(rollup: CostRollup): string {
  if (rollup.pricedTurns === 0) return "unpriced";
  const spent = formatNanos(rollup.nanos);
  return rollup.unpricedTurns === 0 ? spent : `${spent} + ${rollup.unpricedTurns} unpriced`;
}

function spendLine(report: CostReport, model: string | undefined): string {
  const { rollup } = report;
  if (rollup.pricedTurns > 0 && rollup.unpricedTurns === 0) {
    return `cost ${formatNanos(rollup.nanos)} · ${report.basis}`;
  }
  if (rollup.pricedTurns > 0) {
    return `cost ${formatNanos(rollup.nanos)} across ${rollup.pricedTurns} priced ${plural(rollup.pricedTurns, "turn")} · ${rollup.unpricedTurns} more had no pricing`;
  }
  return `cost unknown · no pricing for ${model ?? "this model"}`;
}

function lineageLine(row: ModelCost): string {
  const spend =
    row.rollup.pricedTurns === 0
      ? "no pricing"
      : row.rollup.unpricedTurns === 0
        ? formatNanos(row.rollup.nanos)
        : `${formatNanos(row.rollup.nanos)} + ${row.rollup.unpricedTurns} unpriced`;
  return `  ${row.reference} · ${row.turns} ${plural(row.turns, "turn")} · ${row.usage.inputTokens}▸${row.usage.outputTokens} · ${spend}`;
}

function tokenLine(usage: Usage): string {
  const read = usage.cacheReadInputTokens ?? 0;
  const written = usage.cacheCreationInputTokens ?? 0;
  return [
    `tokens ${usage.inputTokens}▸${usage.outputTokens}`,
    ...(read > 0 ? [`cache read ${read}`] : []),
    ...(written > 0 ? [`cache write ${written}`] : []),
  ].join(" · ");
}

function cacheMissLine(miss: NonNullable<CostReport["cacheMiss"]>): string {
  const note = `cache missed: ${miss.cause}`;
  return miss.missedTokens === undefined
    ? note
    : `${note} · about ${formatTokens(miss.missedTokens)} tokens past the change`;
}

function turnsOf(rollup: CostRollup): number {
  return rollup.pricedTurns + rollup.unpricedTurns;
}

function formatNanos(nanos: number): string {
  return formatCost(nanos / nanosPerDollar);
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

const nanosPerDollar = 1_000_000_000;
