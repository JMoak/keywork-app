import { minute } from "../clock/clock.ts";
import type { Beat, Lane, PowerTier } from "../pose/pose.ts";
import type { PoseName } from "../pose/skin.ts";

export interface GateContext {
  readonly visible: boolean;
  readonly focused: boolean;
  readonly fullscreen: boolean;
  readonly doNotDisturb: boolean;
  readonly tier: PowerTier;
  readonly reducedMotion: boolean;
  readonly quietHours: boolean;
}

export interface Proposal {
  readonly beat: Beat;
  readonly reason: string;
}

export type Verdict = "play" | "hold" | "reduce";

export interface Decision {
  readonly at: number;
  readonly lane: Lane;
  readonly clip: PoseName;
  readonly verdict: Verdict;
  readonly reason: string;
}

export interface Budget {
  readonly played: readonly number[];
}

export const emptyBudget: Budget = { played: [] };

export const ambientBudget = { windowMs: 5 * minute, beats: 8 } as const;

export const decisionLogLimit = 32;

export const restfulClips: ReadonlySet<PoseName> = new Set<PoseName>([
  "nap",
  "sit",
  "stretch",
  "idle",
]);

export function decide(
  proposal: Proposal,
  context: GateContext,
  budget: Budget,
  at: number,
): Decision {
  const { beat } = proposal;
  const verdict = (outcome: Verdict, why: string): Decision => ({
    at,
    lane: beat.lane,
    clip: beat.clip,
    verdict: outcome,
    reason: why,
  });
  if (beat.lane === "ambient") {
    if (context.tier === "hidden" || !context.visible) return verdict("hold", "not shown");
    if (context.reducedMotion) return verdict("hold", "reduced motion");
    if (context.fullscreen) return verdict("hold", "fullscreen");
    if (context.doNotDisturb) return verdict("hold", "do not disturb");
    if (context.quietHours && !restfulClips.has(beat.clip)) return verdict("hold", "quiet hours");
    if (spent(budget, at) >= ambientBudget.beats) return verdict("hold", "ambient budget");
    return verdict("play", proposal.reason);
  }
  if (beat.lane === "input" && (context.tier === "hidden" || !context.visible)) {
    return verdict("hold", "not shown");
  }
  if (context.reducedMotion && (beat.walkTo !== undefined || largeClips.has(beat.clip))) {
    return verdict("reduce", `${proposal.reason} · snapped`);
  }
  return verdict("play", proposal.reason);
}

export function admit(budget: Budget, at: number): Budget {
  return { played: [...budget.played.filter((time) => at - time < ambientBudget.windowMs), at] };
}

export function spent(budget: Budget, at: number): number {
  return budget.played.filter((time) => at - time < ambientBudget.windowMs).length;
}

export function recorded(log: readonly Decision[], decision: Decision): Decision[] {
  return [...log, decision].slice(-decisionLogLimit);
}

const largeClips: ReadonlySet<PoseName> = new Set<PoseName>(["greet", "celebrate", "raise"]);
