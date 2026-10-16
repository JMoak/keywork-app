import type { SessionProjection, ToolRun } from "@keywork-app/client";
import { isAskRefusal } from "@keywork-app/protocol";
import { type AskPick, askChoiceFor } from "../page/ask-card.tsx";
import type { QuietSessions } from "./quiet.ts";
import type { SessionStore } from "./session-store.ts";

export interface HeldAsk {
  readonly sessionId: string | undefined;
  readonly callId?: string | undefined;
}

export interface AskAnswering {
  readonly store: Pick<SessionStore, "projection" | "answerAsk">;
  readonly quiet: Pick<QuietSessions, "has"> | undefined;
  readonly approveKey: string;
}

export const nothingAsking = "nothing is waiting for an answer here";

export async function answerHeldAsk(
  answering: AskAnswering,
  held: HeldAsk,
  pick: AskPick,
): Promise<string | undefined> {
  const run = askingRun(answering.store.projection(held.sessionId), held.callId);
  if (run === undefined) return nothingAsking;
  const choice = askChoiceFor(pick, run, answering.quiet?.has(held.sessionId) === true);
  if (choice === undefined) return onceOnlyNotice(answering.approveKey);
  try {
    const outcome = await answering.store.answerAsk(run.callId, choice.verdict, choice.scope);
    return isAskRefusal(outcome) ? outcome.detail : undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function askingRun(projection: SessionProjection, callId?: string): ToolRun | undefined {
  for (const entry of projection.entries) {
    if (entry.kind !== "tool" || entry.run.phase !== "asking") continue;
    if (callId === undefined || entry.run.callId === callId) return entry.run;
  }
  return undefined;
}

export function onceOnlyNotice(approveKey: string): string {
  return `this ask can only be answered once · ${approveKey} approves it`;
}
