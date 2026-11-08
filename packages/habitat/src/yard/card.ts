import { cooldownsOf, nextUnfoldFreeAt, unfoldBudget, unfoldsSpent } from "./gate.ts";
import { yardIds } from "./place.ts";
import type { YardDecision, YardOwner, YardState } from "./types.ts";

export interface YardCard {
  readonly id: typeof yardIds.card;
  readonly used: number;
  readonly limit: number;
  readonly windowMs: number;
  readonly nextFreeAt: number;
  readonly cooldowns: readonly YardCooldown[];
  readonly decisions: readonly YardDecision[];
}

export interface YardCooldown {
  readonly owner: YardOwner;
  readonly until: number;
}

export function yardCard(state: YardState, at: number): YardCard {
  const { budget } = state;
  return {
    id: yardIds.card,
    used: unfoldsSpent(budget, at),
    limit: unfoldBudget.unfolds,
    windowMs: unfoldBudget.windowMs,
    nextFreeAt: nextUnfoldFreeAt(budget, at),
    cooldowns: cooldownsOf(budget, at).map(({ owner, at: last }) => ({
      owner,
      until: last + unfoldBudget.cooldownMs,
    })),
    decisions: state.decisions,
  };
}
