import type { Rung, SettingKind } from "@keywork-app/protocol";
import { minute } from "../clock/clock.ts";
import { decisionLogLimit, type Verdict } from "../creature/gate.ts";
import { focusRelationOf } from "./focus.ts";
import {
  type OwnerUnfold,
  originOf,
  ownerOf,
  type RuleLasts,
  rankOf,
  sameOwner,
  type YardBudget,
  type YardContext,
  type YardDecision,
  type YardOwner,
  type YardRule,
  type YardSetting,
} from "./types.ts";

export const unfoldBudget = {
  windowMs: 10 * minute,
  unfolds: 6,
  cooldownMs: 2 * minute,
  outsideFocus: 1,
} as const;

export const showReasons = {
  proposed: "as proposed",
  rule: "your rule",
  hand: "by hand",
  opened: "you opened it",
  asked: "you asked, it shows",
  delivery: "a delivery in your thread",
  unasked: "a card unless you asked",
  stage: "the whole view needs your say",
  budget: "too many opened lately",
  outside: "one already opened outside your thread",
  cooldown: "its owner just opened another",
  writing: "while you write",
  streaming: "while a reply arrives",
  foldedBack: "closed again",
  foldedAway: "closed while you were away",
  notShown: "not shown",
  fullscreenElsewhere: "another app fullscreen",
  displayShared: "screen shared",
  doNotDisturb: "do not disturb",
  quietHours: "quiet hours",
} as const;

export const budgetReasons: ReadonlySet<string> = new Set([
  showReasons.budget,
  showReasons.outside,
  showReasons.cooldown,
]);

export const awayReasons: ReadonlySet<string> = new Set([
  showReasons.notShown,
  showReasons.doNotDisturb,
  showReasons.quietHours,
]);

export const breakpointReasons: ReadonlySet<string> = new Set([
  showReasons.writing,
  showReasons.streaming,
]);

export interface UnfoldBy {
  readonly owner: YardOwner;
  readonly outside: boolean;
}

export function decideShow(
  setting: YardSetting,
  context: YardContext,
  budget: YardBudget,
  at: number,
): YardDecision {
  const proposed = setting.rung;
  const rule = ruleOf(setting, context);
  const decided = (rung: Rung, verdict: Verdict, reason: string): YardDecision => ({
    at,
    id: setting.id,
    creature: setting.creature,
    kind: setting.what.kind,
    proposed,
    rung,
    verdict,
    reason,
  });
  if (originOf(setting) === "keeper") {
    return decided(atLeastLantern(proposed), "play", showReasons.opened);
  }
  const wanted = atLeastLantern(rule?.rung ?? proposed);
  if (rankOf(wanted) <= rankOf("card")) {
    return decided(
      wanted,
      verdictOf(proposed, wanted),
      rule ? showReasons.rule : showReasons.proposed,
    );
  }
  const earned = rule === undefined ? earnedUnfold(setting, context) : showReasons.rule;
  const held = heldOnTheRail(setting, context, earned, budget, at);
  if (held !== undefined) return decided("card", "hold", held);
  if (rule === undefined && wanted === "stage") {
    return decided("unfold", "reduce", showReasons.stage);
  }
  return decided(wanted, verdictOf(proposed, wanted), earned ?? showReasons.proposed);
}

export function ruleOf(setting: YardSetting, context: YardContext): YardRule | undefined {
  return context.rules.findLast(
    (rule) =>
      rule.creature === setting.creature &&
      rule.kind === setting.what.kind &&
      (rule.thread === undefined || rule.thread === setting.sessionId) &&
      (rule.lasts === "always" || keeperPresent(context) || setting.ruled === true),
  );
}

export function ruleFromHand(
  setting: Pick<YardSetting, "creature" | "sessionId" | "what">,
  rung: Rung,
  lasts: RuleLasts = "while-present",
): YardRule {
  const rule: YardRule = { creature: setting.creature, kind: setting.what.kind, rung, lasts };
  return setting.creature === null ? { ...rule, thread: setting.sessionId } : rule;
}

export function outsideFocus(
  setting: Pick<YardSetting, "sessionId">,
  context: Pick<YardContext, "focusedThread">,
): boolean {
  return setting.sessionId !== context.focusedThread;
}

export function unfoldsSpent(budget: YardBudget, at: number): number {
  return budget.played.filter((time) => withinWindow(time, at)).length;
}

export function unfoldsOutsideSpent(budget: YardBudget, at: number): number {
  return (budget.outside ?? []).filter((time) => withinWindow(time, at)).length;
}

export function cooldownsOf(budget: YardBudget, at: number): readonly OwnerUnfold[] {
  return (budget.lastUnfolds ?? []).filter((last) => cooling(last.at, at));
}

export function nextUnfoldFreeAt(budget: YardBudget, at: number): number {
  const spent = budget.played.filter((time) => withinWindow(time, at)).toSorted((a, b) => a - b);
  const expiring = spent[spent.length - unfoldBudget.unfolds];
  return expiring === undefined ? at : expiring + unfoldBudget.windowMs;
}

export function admitUnfold(budget: YardBudget, at: number, by?: UnfoldBy): YardBudget {
  const played = [...budget.played.filter((time) => withinWindow(time, at)), at];
  const lastUnfolds = cooldownsOf(budget, at).filter(
    (last) => by === undefined || !sameOwner(last.owner, by.owner),
  );
  const outside = (budget.outside ?? []).filter((time) => withinWindow(time, at));
  if (by === undefined) return { played, lastUnfolds, outside };
  return {
    played,
    lastUnfolds: [...lastUnfolds, { owner: by.owner, at }],
    outside: by.outside ? [...outside, at] : outside,
  };
}

export function spendsUnfold(rung: Rung): boolean {
  return rankOf(rung) >= rankOf("unfold");
}

export function spendsBudget(
  setting: Pick<YardSetting, "origin" | "folded">,
  decision: Pick<YardDecision, "rung">,
): boolean {
  return (
    spendsUnfold(decision.rung) && originOf(setting) === "creature" && setting.folded === undefined
  );
}

export function recordedShow(
  log: readonly YardDecision[],
  decision: YardDecision,
): readonly YardDecision[] {
  return [...log, decision].slice(-decisionLogLimit);
}

export function keeperPresent(context: Pick<YardContext, "visible" | "tier">): boolean {
  return context.visible && context.tier !== "hidden";
}

function heldOnTheRail(
  setting: YardSetting,
  context: YardContext,
  earned: string | undefined,
  budget: YardBudget,
  at: number,
): string | undefined {
  const ceiling = attentionCeiling(context);
  if (ceiling !== undefined) return ceiling;
  if (earned === undefined) return showReasons.unasked;
  return budgetSpent(setting, context, budget, at) ?? midThought(context);
}

function budgetSpent(
  setting: YardSetting,
  context: YardContext,
  budget: YardBudget,
  at: number,
): string | undefined {
  if (unfoldsSpent(budget, at) >= unfoldBudget.unfolds) return showReasons.budget;
  const outside = outsideFocus(setting, context);
  if (outside && unfoldsOutsideSpent(budget, at) >= unfoldBudget.outsideFocus) {
    return showReasons.outside;
  }
  if (coolingDown(setting, context, budget, at)) return showReasons.cooldown;
  return undefined;
}

function coolingDown(
  setting: YardSetting,
  context: YardContext,
  budget: YardBudget,
  at: number,
): boolean {
  const owner = ownerOf(setting);
  const last = cooldownsOf(budget, at).find((unfold) => sameOwner(unfold.owner, owner));
  if (last === undefined) return false;
  const spokeAt = context.keeperSpokeAt[setting.sessionId];
  return spokeAt === undefined || spokeAt <= last.at;
}

function midThought(context: YardContext): string | undefined {
  if (context.draftOpen === true) return showReasons.writing;
  if (context.streaming === true) return showReasons.streaming;
  return undefined;
}

function earnedUnfold(setting: YardSetting, context: YardContext): string | undefined {
  const relation = focusRelationOf(setting, context);
  if (relation === "asked") return showReasons.asked;
  if (relation === "focused" && deliveries.has(setting.what.kind)) return showReasons.delivery;
  return undefined;
}

function attentionCeiling(context: YardContext): string | undefined {
  if (!keeperPresent(context)) return showReasons.notShown;
  if (context.fullscreenElsewhere === true) return showReasons.fullscreenElsewhere;
  if (context.displayShared === true) return showReasons.displayShared;
  if (context.doNotDisturb) return showReasons.doNotDisturb;
  if (context.quietHours) return showReasons.quietHours;
  return undefined;
}

function verdictOf(proposed: Rung, used: Rung): Verdict {
  return rankOf(used) < rankOf(proposed) ? "reduce" : "play";
}

function atLeastLantern(rung: Rung): Rung {
  return rung === "glyph" ? "lantern" : rung;
}

function withinWindow(time: number, at: number): boolean {
  return at - time < unfoldBudget.windowMs;
}

function cooling(time: number, at: number): boolean {
  return at - time < unfoldBudget.cooldownMs;
}

const deliveries: ReadonlySet<SettingKind> = new Set<SettingKind>(["diff", "report"]);
