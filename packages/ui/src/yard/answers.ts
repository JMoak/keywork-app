import type { ConsoleClient } from "@keywork-app/client";
import type { KeeperShowOutcome } from "@keywork-app/protocol";
import { answeredLines, unansweredLine } from "./copy.ts";

export type SettingAnswers = Pick<ConsoleClient, "answerSetting">;

export async function answerSetting(
  answers: SettingAnswers,
  id: string,
  outcome: KeeperShowOutcome,
): Promise<string | undefined> {
  try {
    const refusal = await answers.answerSetting(id, outcome);
    if (refusal === undefined) return answeredLines[outcome];
    return refusal.refused === "conflict" ? undefined : unansweredLine(refusal.detail);
  } catch (cause) {
    return unansweredLine(cause instanceof Error ? cause.message : String(cause));
  }
}

export function pinAnswer(pinned: boolean): KeeperShowOutcome {
  return pinned ? "unpinned" : "pinned";
}
