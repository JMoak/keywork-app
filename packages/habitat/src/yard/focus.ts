import { minute, parseTs } from "../clock/clock.ts";
import type { YardContext, YardSetting } from "./types.ts";

export const askedWithinMs = 2 * minute;

export type FocusRelation = "asked" | "focused" | "elsewhere";

export function focusRelationOf(
  setting: Pick<YardSetting, "sessionId" | "at">,
  context: Pick<YardContext, "focusedThread" | "keeperSpokeAt">,
): FocusRelation {
  if (context.focusedThread !== setting.sessionId) return "elsewhere";
  const spokeAt = context.keeperSpokeAt[setting.sessionId];
  if (spokeAt === undefined) return "focused";
  const since = parseTs(setting.at) - spokeAt;
  return since >= 0 && since <= askedWithinMs ? "asked" : "focused";
}
