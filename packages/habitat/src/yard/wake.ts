import { parseTs } from "../clock/clock.ts";
import { foldBackDueAt } from "./fold-back.ts";
import { unfoldBudget } from "./gate.ts";
import { breakpointWaitMs } from "./step.ts";
import type { YardSetting, YardState } from "./types.ts";

// The yard wakes only for what time itself decides: a deferral's bound, a fold-back, a budget window and a
// cooldown. A wake (wakeYard) never rescores depth; the rail re-sorts only at the yard's events and the keeper's
// input (stepYard), as sizes change only at the keeper's notices, so no decay crossing is ever a moment here.
export function nextChangeAt(yard: YardState, at: number): number | undefined {
  const { played, lastUnfolds = [] } = yard.budget;
  const moments = [
    ...Object.values(yard.settings).flatMap((setting) => changesOf(yard, setting, at)),
    ...played.map((time) => time + unfoldBudget.windowMs),
    ...lastUnfolds.map((last) => last.at + unfoldBudget.cooldownMs),
  ].filter((moment) => moment > at);
  return moments.length === 0 ? undefined : Math.min(...moments);
}

function changesOf(yard: YardState, setting: YardSetting, at: number): number[] {
  if (setting.shown === "glyph") return [parseTs(setting.at) + breakpointWaitMs];
  const due = foldBackDueAt(yard, setting, at);
  return due === undefined ? [] : [due];
}
