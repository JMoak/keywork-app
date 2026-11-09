import { attendedAt, attentionTuning, flowedScore } from "./attention.ts";
import { depthHalfLife } from "./depth.ts";
import { plotOf } from "./lineage.ts";
import { focusWithin } from "./plot.ts";
import type { Unfolded, YardContext, YardSetting, YardState } from "./types.ts";

export const foldBackAfterMs = depthHalfLife;

export function foldsBackNow(
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

export function foldBackDueAt(
  yard: YardState,
  setting: YardSetting,
  at: number,
): number | undefined {
  if (foldableUnfold(setting) === undefined || !neglectable(yard, setting)) return undefined;
  if (yard.awaySince !== undefined && attendedAt(yard, setting.id, at)) return undefined;
  const cleared = attentionClearedAt(yard, setting.id, at);
  if (cleared === undefined) return undefined;
  return Math.max(lastTouchOf(yard, setting) + foldBackAfterMs, cleared);
}

function foldableUnfold(setting: YardSetting): Unfolded | undefined {
  const { unfolded } = setting;
  const gatePlayed = unfolded !== undefined && !unfolded.byHand;
  const standing = setting.state === "live" && setting.folded === undefined;
  return setting.shown === "unfold" && standing && gatePlayed ? unfolded : undefined;
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

function lastTouchedAt(setting: YardSetting): number {
  return Math.max(
    setting.unfolded?.at ?? Number.NEGATIVE_INFINITY,
    setting.attention?.lastAt ?? Number.NEGATIVE_INFINITY,
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
