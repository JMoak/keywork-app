import type { SettingKind } from "@keywork-app/protocol";
import { minute, parseTs } from "../clock/clock.ts";
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
  Math.max(...Object.values(kindWeights)) + Math.max(...Object.values(focusWeights)) + 1;

export function depthOf(setting: YardSetting, context: YardContext, at: number): number {
  if (!stillShown(setting)) return 0;
  const age = Math.max(0, at - parseTs(setting.at));
  const recency = kindWeights[setting.what.kind] * 0.5 ** (age / depthHalfLife);
  const score = recency + focusWeights[focusRelationOf(setting, context)];
  return hundredths(setting.state === "pinned" ? pinnedDepth + score : score);
}

export function byDepth(a: YardSetting, b: YardSetting): number {
  return b.depth - a.depth || parseTs(b.at) - parseTs(a.at) || byId(a, b);
}

function hundredths(value: number): number {
  return Math.round(value * 100) / 100;
}
