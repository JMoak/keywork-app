import type { ProposedRung, Rung } from "@keywork-app/protocol";
import { minute, parseTs } from "../clock/clock.ts";
import type { HabitatState } from "../world/types.ts";
import { byDepth, depthHalfLife, depthOf } from "./depth.ts";
import {
  admitUnfold,
  awayReasons,
  breakpointReasons,
  budgetReasons,
  decideShow,
  outsideFocus,
  recordedShow,
  ruleOf,
  showReasons,
  spendsUnfold,
  unfoldBudget,
} from "./gate.ts";
import {
  byArrival,
  ownerOf,
  rankOf,
  type Unfolded,
  type YardContext,
  type YardDecision,
  type YardRule,
  type YardSetting,
  type YardState,
  yardOf,
} from "./types.ts";

export const breakpointWaitMs = 2 * minute;

export const foldBackAfterMs = depthHalfLife;

export function stepYard(yard: YardState, context: YardContext, at: number): YardState {
  const ruled = sameRules(yard.rules, context.rules) ? yard : { ...yard, rules: context.rules };
  const railStill = context.railFocused === true;
  const folded = railStill ? ruled : foldBackIgnored(ruled, context, at);
  const judged = awaitingGate(folded).reduce(
    (current, setting) => judge(current, setting, context, at),
    folded,
  );
  return railStill ? judged : rescored(judged, context, at);
}

export function withYardStep(state: HabitatState, context: YardContext, at: number): HabitatState {
  const yard = yardOf(state);
  const stepped = stepYard(yard, context, at);
  return stepped === yard ? state : { ...state, yard: stepped };
}

export function moveByHand(yard: YardState, id: string, rung: ProposedRung, at: number): YardState {
  const held = yard.settings[id];
  if (held === undefined || held.shown === rung) return yard;
  const others = rung === "stage" ? staged(yard).filter((setting) => setting.id !== id) : [];
  const offStage = others.reduce((current, setting) => moved(current, setting, "unfold", at), yard);
  return moved(offStage, held, rung, at);
}

export function digestOf(yard: YardState, returnedAt?: number): readonly YardSetting[] {
  const latest = new Map(yard.decisions.map((decision) => [decision.id, decision]));
  const folded = (decision: YardDecision | undefined): boolean =>
    decision !== undefined &&
    (budgetReasons.has(decision.reason) || heldWhileAway(decision, returnedAt));
  return Object.values(yard.settings)
    .filter((setting) => setting.shown === "card" && folded(latest.get(setting.id)))
    .sort(byDepth);
}

export function nextChangeAt(yard: YardState, at: number): number | undefined {
  const { played, lastUnfolds = [] } = yard.budget;
  const moments = [
    ...Object.values(yard.settings).flatMap(changesOf),
    ...played.map((time) => time + unfoldBudget.windowMs),
    ...lastUnfolds.map((last) => last.at + unfoldBudget.cooldownMs),
  ].filter((moment) => moment > at);
  return moments.length === 0 ? undefined : Math.min(...moments);
}

export function awaitsBreakpoint(
  decision: YardDecision,
  setting: YardSetting,
  at: number,
): boolean {
  return breakpointReasons.has(decision.reason) && at - parseTs(setting.at) < breakpointWaitMs;
}

function judge(yard: YardState, setting: YardSetting, context: YardContext, at: number): YardState {
  const decision = decideShow(setting, context, yard.budget, at);
  if (awaitsBreakpoint(decision, setting, at)) return yard;
  const unfolding = { at, focus: context.focusedThread, byHand: false };
  const decided: YardSetting = {
    ...reshown(yard, setting, decision.rung, unfolding),
    ruled: setting.ruled === true || ruleOf(setting, context) !== undefined,
  };
  const spent = { owner: ownerOf(setting), outside: outsideFocus(setting, context) };
  return {
    ...yard,
    settings: { ...yard.settings, [setting.id]: decided },
    budget: spendsUnfold(decision.rung) ? admitUnfold(yard.budget, at, spent) : yard.budget,
    decisions: recordedShow(yard.decisions, decision),
  };
}

function moved(yard: YardState, setting: YardSetting, rung: ProposedRung, at: number): YardState {
  const unfolding = { at, focus: undefined, byHand: true };
  return recordedMove(
    yard,
    { ...reshown(yard, setting, rung, unfolding), ruled: true },
    { verdict: rankOf(rung) < rankOf(setting.shown) ? "reduce" : "play", reason: showReasons.hand },
    at,
  );
}

function foldBackIgnored(yard: YardState, context: YardContext, at: number): YardState {
  return Object.values(yard.settings)
    .filter((setting) => ignoredUnfold(setting, context, at))
    .sort(byArrival)
    .reduce(
      (current, setting) =>
        recordedMove(
          current,
          reshown(current, setting, "card", undefined),
          { verdict: "reduce", reason: showReasons.foldedBack },
          at,
        ),
      yard,
    );
}

function ignoredUnfold(setting: YardSetting, context: YardContext, at: number): boolean {
  const unfolded = foldableUnfold(setting);
  return (
    unfolded !== undefined &&
    (unfolded.focus !== context.focusedThread || at - unfolded.at >= foldBackAfterMs)
  );
}

function foldableUnfold(setting: YardSetting): Unfolded | undefined {
  const { unfolded } = setting;
  const gatePlayed = unfolded !== undefined && !unfolded.byHand;
  return setting.shown === "unfold" && setting.state === "live" && gatePlayed
    ? unfolded
    : undefined;
}

function changesOf(setting: YardSetting): number[] {
  if (setting.shown === "glyph") return [parseTs(setting.at) + breakpointWaitMs];
  const unfolded = foldableUnfold(setting);
  return unfolded === undefined ? [] : [unfolded.at + foldBackAfterMs];
}

function recordedMove(
  yard: YardState,
  setting: YardSetting,
  outcome: Pick<YardDecision, "verdict" | "reason">,
  at: number,
): YardState {
  const decision: YardDecision = {
    at,
    id: setting.id,
    creature: setting.creature,
    kind: setting.what.kind,
    proposed: setting.rung,
    rung: setting.shown,
    ...outcome,
  };
  return {
    ...yard,
    settings: { ...yard.settings, [setting.id]: setting },
    decisions: recordedShow(yard.decisions, decision),
  };
}

function reshown(
  yard: YardState,
  setting: YardSetting,
  rung: Rung,
  unfolding: Omit<Unfolded, "slot"> | undefined,
): YardSetting {
  const { unfolded, ...rest } = setting;
  if (!satellite(rung) || unfolding === undefined) return { ...rest, shown: rung };
  return {
    ...rest,
    shown: rung,
    unfolded: { ...unfolding, slot: unfolded?.slot ?? freeSlotOf(yard) },
  };
}

function freeSlotOf(yard: YardState): number {
  const taken = new Set(
    Object.values(yard.settings).flatMap((setting) =>
      setting.unfolded !== undefined && satellite(setting.shown) ? [setting.unfolded.slot] : [],
    ),
  );
  let slot = 0;
  while (taken.has(slot)) slot += 1;
  return slot;
}

function satellite(rung: Rung): boolean {
  return rankOf(rung) >= rankOf("unfold");
}

function heldWhileAway(decision: YardDecision, returnedAt: number | undefined): boolean {
  return returnedAt !== undefined && awayReasons.has(decision.reason) && decision.at <= returnedAt;
}

function rescored(yard: YardState, context: YardContext, at: number): YardState {
  const settings = Object.fromEntries(
    Object.entries(yard.settings).map(([id, setting]) => {
      const depth = depthOf(setting, context, at);
      return [id, depth === setting.depth ? setting : { ...setting, depth }];
    }),
  );
  const changed = Object.entries(settings).some(([id, setting]) => setting !== yard.settings[id]);
  return changed ? { ...yard, settings } : yard;
}

function awaitingGate(yard: YardState): YardSetting[] {
  return Object.values(yard.settings)
    .filter((setting) => setting.shown === "glyph")
    .sort(byArrival);
}

function staged(yard: YardState): YardSetting[] {
  return Object.values(yard.settings).filter((setting) => setting.shown === "stage");
}

function sameRules(a: readonly YardRule[], b: readonly YardRule[]): boolean {
  return a === b || (a.length === b.length && a.every((rule, index) => sameRule(rule, b[index])));
}

function sameRule(a: YardRule, b: YardRule | undefined): boolean {
  return (
    b !== undefined &&
    a.creature === b.creature &&
    a.kind === b.kind &&
    a.rung === b.rung &&
    a.lasts === b.lasts &&
    a.thread === b.thread
  );
}
