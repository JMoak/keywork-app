import type { ProposedRung, Rung } from "@keywork-app/protocol";
import { minute, parseTs } from "../clock/clock.ts";
import type { HabitatState } from "../world/types.ts";
import { attendedAt, attentionTuning, flowedScore } from "./attention.ts";
import { byDepth, depthHalfLife, depthOf } from "./depth.ts";
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
  unfoldBudget,
} from "./gate.ts";
import { plotOf, plotSeedOf } from "./lineage.ts";
import { focusWithin, foldPlot, hasLiveDescendants } from "./plot.ts";
import {
  byArrival,
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

export const foldBackAfterMs = depthHalfLife;

export function stepYard(yard: YardState, context: YardContext, at: number): YardState {
  const clocked = attentionClocked(yard, context, at);
  const ruled = sameRules(clocked.rules, context.rules)
    ? clocked
    : { ...clocked, rules: context.rules };
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

export function nextChangeAt(yard: YardState, at: number): number | undefined {
  const { played, lastUnfolds = [] } = yard.budget;
  const moments = [
    ...Object.values(yard.settings).flatMap((setting) => changesOf(yard, setting, at)),
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
    .filter((setting) => ignoredUnfold(yard, setting, context, at))
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

function ignoredUnfold(
  yard: YardState,
  setting: YardSetting,
  context: YardContext,
  at: number,
): boolean {
  const unfolded = foldableUnfold(setting);
  if (unfolded === undefined || !neglectable(yard, setting) || attendedAt(yard, setting.id, at)) {
    return false;
  }
  return (
    unfolded.focus !== context.focusedThread || at >= lastTouchOf(yard, setting) + foldBackAfterMs
  );
}

function foldBackDueAt(yard: YardState, setting: YardSetting, at: number): number | undefined {
  if (foldableUnfold(setting) === undefined || !neglectable(yard, setting)) return undefined;
  if (yard.awaySince !== undefined && attendedAt(yard, setting.id, at)) return undefined;
  const cleared = attentionClearedAt(yard, setting.id, at);
  if (cleared === undefined) return undefined;
  return Math.max(lastTouchOf(yard, setting) + foldBackAfterMs, cleared);
}

function neglectable(yard: YardState, setting: YardSetting): boolean {
  return !plotOf(yard, setting.id).some((id) => yard.settings[id]?.unfolded?.byHand === true);
}

function lastTouchOf(yard: YardState, setting: YardSetting): number {
  return Math.max(
    ...plotOf(yard, setting.id)
      .flatMap((id) => yard.settings[id] ?? [])
      .map(lastTouchedAt),
  );
}

function attentionClearedAt(yard: YardState, id: string, at: number): number | undefined {
  if (focusWithin(yard, id)) return undefined;
  const { halfLifeMs, working } = attentionTuning;
  const flowed = flowedScore(yard, id, at);
  if (flowed <= working.leave) return at;
  const estimate = at + halfLifeMs * Math.log2(flowed / working.leave);
  return firstMoment(at, estimate, (moment) => !attendedAt(yard, id, moment));
}

const momentSearchSteps = 16;

function firstMoment(
  after: number,
  estimate: number,
  reached: (moment: number) => boolean,
): number | undefined {
  let moment = Math.max(after + 1, Math.ceil(estimate));
  for (let step = 0; step < momentSearchSteps && !reached(moment); step += 1) moment += 1;
  if (!reached(moment)) return undefined;
  for (
    let step = 0;
    step < momentSearchSteps && moment - 1 > after && reached(moment - 1);
    step += 1
  ) {
    moment -= 1;
  }
  return moment;
}

function foldableUnfold(setting: YardSetting): Unfolded | undefined {
  const { unfolded } = setting;
  const gatePlayed = unfolded !== undefined && !unfolded.byHand;
  const standing = setting.state === "live" && setting.folded === undefined;
  return setting.shown === "unfold" && standing && gatePlayed ? unfolded : undefined;
}

function lastTouchedAt(setting: YardSetting): number {
  return Math.max(
    setting.unfolded?.at ?? Number.NEGATIVE_INFINITY,
    setting.attention?.lastAt ?? Number.NEGATIVE_INFINITY,
  );
}

function lowersSatellite(setting: YardSetting, rung: ProposedRung): boolean {
  return satellite(setting.shown) && !satellite(rung);
}

function changesOf(yard: YardState, setting: YardSetting, at: number): number[] {
  if (setting.shown === "glyph") return [parseTs(setting.at) + breakpointWaitMs];
  const due = foldBackDueAt(yard, setting, at);
  return due === undefined ? [] : [due];
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
  const { unfolded, size, ...rest } = setting;
  if (!satellite(rung) || unfolding === undefined) return { ...rest, shown: rung };
  const place = unfolded === undefined ? placeFor(yard, setting) : placeKept(unfolded);
  const kept = size === undefined ? rest : { ...rest, size };
  return { ...kept, shown: rung, unfolded: { ...unfolding, ...place } };
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
    const { attention } = setting;
    return attention === undefined
      ? setting
      : { ...setting, attention: { ...attention, lastAt: attention.lastAt + away } };
  });
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
