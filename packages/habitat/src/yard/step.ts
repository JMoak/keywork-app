import type { ProposedRung } from "@keywork-app/protocol";
import type { HabitatState } from "../world/types.ts";
import { byDepth, depthOf } from "./depth.ts";
import { admitUnfold, decideShow, recordedShow, showReasons, spendsUnfold } from "./gate.ts";
import {
  byArrival,
  rankOf,
  type YardContext,
  type YardDecision,
  type YardRule,
  type YardSetting,
  type YardState,
  yardOf,
} from "./types.ts";

export function stepYard(yard: YardState, context: YardContext, at: number): YardState {
  const ruled = sameRules(yard.rules, context.rules) ? yard : { ...yard, rules: context.rules };
  const judged = awaitingGate(ruled).reduce(
    (current, setting) => judge(current, setting, context, at),
    ruled,
  );
  return rescored(judged, context, at);
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

export function digestOf(yard: YardState): readonly YardSetting[] {
  const latest = new Map(yard.decisions.map((decision) => [decision.id, decision]));
  return Object.values(yard.settings)
    .filter(
      (setting) =>
        setting.shown === "card" && latest.get(setting.id)?.reason === showReasons.budget,
    )
    .sort(byDepth);
}

function judge(yard: YardState, setting: YardSetting, context: YardContext, at: number): YardState {
  const decision = decideShow(setting, context, yard.budget, at);
  return {
    ...yard,
    settings: { ...yard.settings, [setting.id]: { ...setting, shown: decision.rung } },
    budget: spendsUnfold(decision.rung) ? admitUnfold(yard.budget, at) : yard.budget,
    decisions: recordedShow(yard.decisions, decision),
  };
}

function moved(yard: YardState, setting: YardSetting, rung: ProposedRung, at: number): YardState {
  const decision: YardDecision = {
    at,
    id: setting.id,
    creature: setting.creature,
    kind: setting.what.kind,
    proposed: setting.rung,
    rung,
    verdict: rankOf(rung) < rankOf(setting.shown) ? "reduce" : "play",
    reason: showReasons.hand,
  };
  return {
    ...yard,
    settings: { ...yard.settings, [setting.id]: { ...setting, shown: rung } },
    decisions: recordedShow(yard.decisions, decision),
  };
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
    a.lasts === b.lasts
  );
}
