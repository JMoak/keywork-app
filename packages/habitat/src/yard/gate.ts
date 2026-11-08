import type { Rung, SettingKind } from "@keywork-app/protocol";
import { minute } from "../clock/clock.ts";
import { type Budget, decisionLogLimit, type Verdict } from "../creature/gate.ts";
import { focusRelationOf } from "./focus.ts";
import {
  rankOf,
  type YardContext,
  type YardDecision,
  type YardRule,
  type YardSetting,
} from "./types.ts";

export const unfoldBudget = { windowMs: 10 * minute, unfolds: 6 } as const;

export const showReasons = {
  proposed: "as proposed",
  rule: "your rule",
  hand: "by hand",
  asked: "you asked, it shows",
  delivery: "a delivery in your thread",
  unasked: "a card unless you asked",
  stage: "stage needs a rule or your hand",
  budget: "unfold budget",
  notShown: "not shown",
  fullscreen: "fullscreen",
  doNotDisturb: "do not disturb",
  quietHours: "quiet hours",
} as const;

export function decideShow(
  setting: YardSetting,
  context: YardContext,
  budget: Budget,
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
  const wanted = atLeastLantern(rule?.rung ?? proposed);
  if (rankOf(wanted) <= rankOf("card")) {
    return decided(
      wanted,
      verdictOf(proposed, wanted),
      rule ? showReasons.rule : showReasons.proposed,
    );
  }
  const earned = rule === undefined ? earnedUnfold(setting, context) : showReasons.rule;
  const held = heldOnTheRail(context, earned, budget, at);
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
      (rule.lasts === "always" || keeperPresent(context)),
  );
}

export function unfoldsSpent(budget: Budget, at: number): number {
  return budget.played.filter((time) => withinWindow(time, at)).length;
}

export function admitUnfold(budget: Budget, at: number): Budget {
  return { played: [...budget.played.filter((time) => withinWindow(time, at)), at] };
}

export function spendsUnfold(rung: Rung): boolean {
  return rankOf(rung) >= rankOf("unfold");
}

export function recordedShow(
  log: readonly YardDecision[],
  decision: YardDecision,
): readonly YardDecision[] {
  return [...log, decision].slice(-decisionLogLimit);
}

function heldOnTheRail(
  context: YardContext,
  earned: string | undefined,
  budget: Budget,
  at: number,
): string | undefined {
  const ceiling = attentionCeiling(context);
  if (ceiling !== undefined) return ceiling;
  if (earned === undefined) return showReasons.unasked;
  if (unfoldsSpent(budget, at) >= unfoldBudget.unfolds) return showReasons.budget;
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
  if (context.fullscreen) return showReasons.fullscreen;
  if (context.doNotDisturb) return showReasons.doNotDisturb;
  if (context.quietHours) return showReasons.quietHours;
  return undefined;
}

function keeperPresent(context: YardContext): boolean {
  return context.visible && context.tier !== "hidden";
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

const deliveries: ReadonlySet<SettingKind> = new Set<SettingKind>(["diff", "report"]);
