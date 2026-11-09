import type { SettingKind } from "@keywork-app/protocol";
import { minute, parseTs } from "../clock/clock.ts";
import { attentionTuning, scoreAt } from "./attention.ts";
import { type FocusRelation, focusRelationOf } from "./focus.ts";
import { byId, stillShown, type YardContext, type YardSetting } from "./types.ts";

export const depthHalfLife = 10 * minute;

export const kindWeights: Readonly<Record<SettingKind, number>> = {
  diff: 5,
  report: 4,
  thread: 4,
  chore: 3,
  file: 3,
  url: 2,
  note: 2,
};

export const focusWeights: Readonly<Record<FocusRelation, number>> = {
  asked: 6,
  focused: 4,
  elsewhere: 0,
};

export const pinnedDepth =
  Math.max(...Object.values(kindWeights)) +
  Math.max(...Object.values(focusWeights)) +
  attentionTuning.depthShare +
  1;

export function depthOf(setting: YardSetting, context: YardContext, at: number): number {
  if (!stillShown(setting)) return 0;
  const age = Math.max(0, at - parseTs(setting.at));
  const recency = kindWeights[setting.what.kind] * 0.5 ** (age / depthHalfLife);
  const focus = focusWeights[focusRelationOf(setting, context)];
  const score = recency + focus + attentionDepth(setting, at);
  return hundredths(setting.state === "pinned" ? pinnedDepth + score : score);
}

export function byDepth(
  a: Pick<YardSetting, "depth" | "at" | "id">,
  b: Pick<YardSetting, "depth" | "at" | "id">,
): number {
  return b.depth - a.depth || parseTs(b.at) - parseTs(a.at) || byId(a, b);
}

export function attentionDepth(setting: Pick<YardSetting, "attention">, at: number): number {
  const { ceiling, depthShare } = attentionTuning;
  return (depthShare * Math.min(scoreAt(setting.attention, at), ceiling)) / ceiling;
}

function hundredths(value: number): number {
  return Math.round(value * 100) / 100;
}
