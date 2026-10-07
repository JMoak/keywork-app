import type { UsageLedger } from "@keywork-app/client";
import { formatCost, formatTokens } from "./format.ts";

export type CostBasis = "metered" | "estimated" | "mixed";

export function costItem(ledger: UsageLedger, basis?: CostBasis): string | undefined {
  if (ledger.turns === 0) return undefined;
  const priced = ledger.turns - ledger.unpricedTurns;
  if (priced === 0) return "unpriced";
  if (ledger.unpricedTurns > 0)
    return `${formatCost(ledger.costUsd)} + ${ledger.unpricedTurns} unpriced`;
  return basis === undefined
    ? formatCost(ledger.costUsd)
    : `${formatCost(ledger.costUsd)} ${basisWord(basis)}`;
}

export function tokensItem(ledger: UsageLedger): string | undefined {
  if (ledger.turns === 0) return undefined;
  return `${formatTokens(ledger.inputTokens + ledger.outputTokens)} tokens`;
}

export function usageLine(ledger: UsageLedger, basis?: CostBasis): string {
  return [tokensItem(ledger), costItem(ledger, basis)]
    .filter((item): item is string => item !== undefined)
    .join(" · ");
}

function basisWord(basis: CostBasis): string {
  switch (basis) {
    case "metered":
      return "metered by the provider";
    case "estimated":
      return "estimated from list rates";
    case "mixed":
      return "partly estimated";
  }
}
