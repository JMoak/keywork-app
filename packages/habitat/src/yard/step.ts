import type { ProposedRung, Rung } from "@keywork-app/protocol";
import { minute, parseTs } from "../clock/clock.ts";
import type { HabitatState } from "../world/types.ts";
import { openedAtItsNamedSize } from "./attention.ts";
import { byDepth, depthOf } from "./depth.ts";
import { foldsBackNow } from "./fold-back.ts";
import {
  admitUnfold,
  awayReasons,
  breakpointReasons,
  budgetReasons,
  decideShow,
  keeperPresent,
  outsideFocus,
  recordedShow,
  ruleOf,
  showReasons,
  spendsBudget,
} from "./gate.ts";
import { plotSeedOf } from "./lineage.ts";
import { foldPlot, hasLiveDescendants } from "./plot.ts";
import {
  byArrival,
  type Decaying,
  originOf,
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

export function stepYard(yard: YardState, context: YardContext, at: number): YardState {
  const woken = wakeYard(yard, context, at);
  return context.railFocused === true ? woken : rescored(woken, context, at);
}

export function wakeYard(yard: YardState, context: YardContext, at: number): YardState {
  const clocked = attentionClocked(yard, context, at);
  const ruled = sameRules(clocked.rules, context.rules)
    ? clocked
    : { ...clocked, rules: context.rules };
  const folded = context.railFocused === true ? ruled : foldBackIgnored(ruled, context, at);
  return awaitingGate(folded).reduce(
    (current, setting) => judge(current, setting, context, at),
    folded,
  );
}

export function withYardStep(state: HabitatState, context: YardContext, at: number): HabitatState {
  return withYard(state, (yard) => stepYard(yard, context, at));
}

export function withYardWake(state: HabitatState, context: YardContext, at: number): HabitatState {
  return withYard(state, (yard) => wakeYard(yard, context, at));
}

export function moveByHand(yard: YardState, id: string, rung: ProposedRung, at: number): YardState {
  const held = yard.settings[id];
  if (held === undefined || held.shown === rung || held.folded !== undefined) return yard;
  if (lowersSatellite(held, rung) && hasLiveDescendants(yard, id)) {
    return foldedAway(yard, held, showReasons.hand, at);
  }
  const others = rung === "stage" ? staged(yard).filter((setting) => setting.id !== id) : [];
  const offStage = others.reduce((current, setting) => moved(current, setting, "unfold", at), yard);
  return moved(offStage, held, rung, at);
}

export function restorePlot(yard: YardState, plot: string, at: number): YardState {
  const members = Object.values(yard.settings).filter((setting) => setting.folded === plot);
  if (members.length === 0) return yard;
  const restored = members.map(restoredByHand);
  const settings = reclaimedSlots({ ...yard.settings, ...byIdOf(restored) }, restored);
  const seed = settings[plotSeedOf(plot) ?? plot];
  const back = { ...yard, settings };
  if (seed === undefined) return back;
  const decision = decisionOf(
    seed,
    { verdict: "play", rung: seed.shown, reason: showReasons.hand },
    at,
  );
  return { ...back, decisions: recordedShow(back.decisions, decision) };
}

export function digestOf(yard: YardState, returnedAt?: number): readonly YardSetting[] {
  const latest = new Map(yard.decisions.map((decision) => [decision.id, decision]));
  const heldBack = (decision: YardDecision | undefined): boolean =>
    decision !== undefined &&
    (budgetReasons.has(decision.reason) || heldWhileAway(decision, returnedAt));
  return Object.values(yard.settings)
    .filter(
      (setting) =>
        setting.shown === "card" &&
        setting.folded === undefined &&
        heldBack(latest.get(setting.id)),
    )
    .sort(byDepth);
}

export function plotsFoldedWhileAway(yard: YardState, returnedAt?: number): readonly string[] {
  if (returnedAt === undefined) return [];
  const folds = yard.decisions.flatMap((decision) => {
    const fold = yard.settings[decision.id]?.folded;
    const away = decision.reason === showReasons.foldedAway && decision.at <= returnedAt;
    return away && fold !== undefined ? [fold] : [];
  });
  return [...new Set(folds)];
}

export function awaitsBreakpoint(
  decision: YardDecision,
  setting: YardSetting,
  at: number,
): boolean {
  return breakpointReasons.has(decision.reason) && at - parseTs(setting.at) < breakpointWaitMs;
}

function attentionClocked(yard: YardState, context: YardContext, at: number): YardState {
  const { awaySince } = yard;
  const present = keeperPresent(context);
  if (present && awaySince === undefined) return yard;
  if (awaySince === undefined) return { ...yard, awaySince: at };
  const until = present ? Math.min(at, Math.max(awaySince, context.returnedAt ?? at)) : at;
  const shifted = attentionShifted(yard, until - awaySince);
  if (!present) return { ...shifted, awaySince: at };
  const { awaySince: _, ...back } = shifted;
  return back;
}

function judge(yard: YardState, setting: YardSetting, context: YardContext, at: number): YardState {
  const decision = decideShow(setting, context, yard.budget, at);
  if (awaitsBreakpoint(decision, setting, at)) return yard;
  const unfolding = { at, focus: context.focusedThread, byHand: originOf(setting) === "keeper" };
  const decided: YardSetting = {
    ...reshown(yard, setting, decision.rung, unfolding),
    ruled: setting.ruled === true || ruleOf(setting, context) !== undefined,
  };
  const spent = { owner: ownerOf(setting), outside: outsideFocus(setting, context) };
  return {
    ...yard,
    settings: { ...yard.settings, [setting.id]: decided },
    budget: spendsBudget(setting, decision) ? admitUnfold(yard.budget, at, spent) : yard.budget,
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
    .filter((setting) => foldsBackNow(yard, setting, context, at))
    .sort(byArrival)
    .reduce((current, setting) => {
      const held = current.settings[setting.id];
      return held === undefined || held.folded !== undefined
        ? current
        : foldedBack(current, held, context, at);
    }, yard);
}

function foldedBack(
  yard: YardState,
  setting: YardSetting,
  context: YardContext,
  at: number,
): YardState {
  const reason = keeperPresent(context) ? showReasons.foldedBack : showReasons.foldedAway;
  if (hasLiveDescendants(yard, setting.id)) return foldedAway(yard, setting, reason, at);
  return recordedMove(
    yard,
    reshown(yard, setting, "card", undefined),
    { verdict: "reduce", reason },
    at,
  );
}

function foldedAway(yard: YardState, setting: YardSetting, reason: string, at: number): YardState {
  const folded = foldPlot(yard, setting.id);
  const decision = decisionOf(setting, { verdict: "reduce", rung: "card", reason }, at);
  return { ...folded, decisions: recordedShow(folded.decisions, decision) };
}

function lowersSatellite(setting: YardSetting, rung: ProposedRung): boolean {
  return satellite(setting.shown) && !satellite(rung);
}

function recordedMove(
  yard: YardState,
  setting: YardSetting,
  outcome: Pick<YardDecision, "verdict" | "reason">,
  at: number,
): YardState {
  const decision = decisionOf(setting, { ...outcome, rung: setting.shown }, at);
  return {
    ...yard,
    settings: { ...yard.settings, [setting.id]: setting },
    decisions: recordedShow(yard.decisions, decision),
  };
}

function decisionOf(
  setting: YardSetting,
  outcome: Pick<YardDecision, "verdict" | "rung" | "reason">,
  at: number,
): YardDecision {
  return {
    at,
    id: setting.id,
    creature: setting.creature,
    kind: setting.what.kind,
    proposed: setting.rung,
    ...outcome,
  };
}

function reshown(
  yard: YardState,
  setting: YardSetting,
  rung: Rung,
  unfolding: Omit<Unfolded, "slot" | "lane"> | undefined,
): YardSetting {
  if (!satellite(rung) || unfolding === undefined) return lowered(setting, rung);
  const { unfolded } = setting;
  const place = unfolded === undefined ? placeFor(yard, setting) : placeKept(unfolded);
  const sized =
    unfolded === undefined ? openedAtItsNamedSize(yard, setting, unfolding.at) : setting;
  return { ...sized, shown: rung, unfolded: { ...unfolding, ...place } };
}

function lowered(setting: YardSetting, rung: Rung): YardSetting {
  const { unfolded, size, headStart: _, ...rest } = setting;
  const neverOut = unfolded === undefined && size !== undefined;
  return neverOut ? { ...rest, size, shown: rung } : { ...rest, shown: rung };
}

type Place = Pick<Unfolded, "slot" | "lane">;

function placeKept(unfolded: Unfolded): Place {
  return unfolded.lane === undefined
    ? { slot: unfolded.slot }
    : { slot: unfolded.slot, lane: unfolded.lane };
}

function placeFor(yard: YardState, setting: YardSetting): Place {
  const slot = freeSlotOf(yard.settings);
  const parent = setting.from === null || setting.from === undefined ? undefined : setting.from;
  const beside = parent === undefined ? undefined : yard.settings[parent];
  if (beside === undefined || !satellite(beside.shown)) return { slot };
  return { slot, lane: freeLaneBeside(yard, beside.id) };
}

function freeSlotOf(settings: YardState["settings"]): number {
  const taken = new Set(Object.values(settings).flatMap(slotHeld));
  return lowestFree(taken);
}

function freeLaneBeside(yard: YardState, parent: string): number {
  const taken = new Set(
    Object.values(yard.settings).flatMap((setting) => {
      const lane = setting.unfolded?.lane;
      return setting.from === parent && satellite(setting.shown) && lane !== undefined
        ? [lane]
        : [];
    }),
  );
  return lowestFree(taken);
}

function slotHeld(setting: YardSetting): number[] {
  return setting.unfolded !== undefined && satellite(setting.shown) && setting.folded === undefined
    ? [setting.unfolded.slot]
    : [];
}

function lowestFree(taken: ReadonlySet<number>): number {
  let free = 0;
  while (taken.has(free)) free += 1;
  return free;
}

function restoredByHand(setting: YardSetting): YardSetting {
  const { folded: _, unfolded, ...rest } = setting;
  return unfolded === undefined ? rest : { ...rest, unfolded: { ...unfolded, byHand: true } };
}

function reclaimedSlots(
  settings: YardState["settings"],
  restored: readonly YardSetting[],
): YardState["settings"] {
  const first = new Set(restored.map((setting) => setting.id));
  const claimants = Object.values(settings)
    .filter((setting) => slotHeld(setting).length > 0)
    .sort(
      (a, b) =>
        Number(first.has(b.id)) - Number(first.has(a.id)) ||
        (a.unfolded?.at ?? 0) - (b.unfolded?.at ?? 0) ||
        byArrival(a, b),
    );
  const claimed = new Set<number>();
  const moved: YardSetting[] = [];
  for (const setting of claimants) {
    const unfolded = setting.unfolded;
    if (unfolded === undefined) continue;
    if (!claimed.has(unfolded.slot)) {
      claimed.add(unfolded.slot);
      continue;
    }
    const slot = lowestFree(claimed);
    claimed.add(slot);
    moved.push({ ...setting, unfolded: { ...unfolded, slot } });
  }
  return moved.length === 0 ? settings : { ...settings, ...byIdOf(moved) };
}

function satellite(rung: Rung): boolean {
  return rankOf(rung) >= rankOf("unfold");
}

function heldWhileAway(decision: YardDecision, returnedAt: number | undefined): boolean {
  return returnedAt !== undefined && awayReasons.has(decision.reason) && decision.at <= returnedAt;
}

function rescored(yard: YardState, context: YardContext, at: number): YardState {
  return changedSettings(yard, (setting) => {
    const depth = depthOf(setting, context, at);
    return depth === setting.depth ? setting : { ...setting, depth };
  });
}

function attentionShifted(yard: YardState, away: number): YardState {
  if (away <= 0) return yard;
  return changedSettings(yard, (setting) => {
    const { attention, headStart } = setting;
    if (attention === undefined && headStart === undefined) return setting;
    return {
      ...setting,
      ...(attention !== undefined && { attention: resumedAfter(attention, away) }),
      ...(headStart !== undefined && { headStart: resumedAfter(headStart, away) }),
    };
  });
}

function resumedAfter<Clocked extends Decaying>(decaying: Clocked, away: number): Clocked {
  return { ...decaying, lastAt: decaying.lastAt + away };
}

function changedSettings(
  yard: YardState,
  change: (setting: YardSetting) => YardSetting,
): YardState {
  const settings = Object.fromEntries(
    Object.entries(yard.settings).map(([id, setting]) => [id, change(setting)]),
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

function withYard(state: HabitatState, change: (yard: YardState) => YardState): HabitatState {
  const yard = yardOf(state);
  const changed = change(yard);
  return changed === yard ? state : { ...state, yard: changed };
}

function byIdOf(settings: readonly YardSetting[]): Record<string, YardSetting> {
  return Object.fromEntries(settings.map((setting) => [setting.id, setting]));
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
