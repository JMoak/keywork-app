import type { SessionProjection, ToolRun } from "@keywork-app/client";
import { type DenyReason, isAskRefusal } from "@keywork-app/protocol";
import { redoLastUndo } from "../composer/undoable.ts";
import { isTextField } from "../keys/typing.ts";
import { type AskPick, askChoiceFor } from "../page/ask-card.tsx";
import { type AnswerBy, admitsAnswer } from "../page/ask-card-guard.ts";
import { askWhy, stopAskingWhy } from "../page/ask-card-why.ts";
import { focusedWindow } from "../surfaces/runtime/windows.ts";
import type { SessionStore } from "./session-store.ts";

export interface HeldAsk {
  readonly sessionId: string | undefined;
  readonly callId?: string | undefined;
}

export type AskStore = Pick<SessionStore, "projection" | "answerAsk">;

export interface AskAnswering {
  readonly store: AskStore;
  readonly approveKey: string;
}

export interface AskReach {
  readonly store: AskStore;
  root(): HTMLElement | undefined;
  held(): HeldAsk | undefined;
}

export interface ReachedAsk {
  readonly store: AskStore;
  readonly run: ToolRun;
}

export const nothingAsking = "nothing is waiting for an answer here";

export async function answerHeldAsk(
  answering: AskAnswering,
  held: HeldAsk,
  pick: AskPick,
  by: AnswerBy,
  reason?: DenyReason,
  note?: string,
): Promise<string | undefined> {
  const asked = askInReach(answering.store, held);
  if (asked === undefined)
    return pick === "approve" && redoWhileTyping() ? undefined : nothingAsking;
  if (!admitsAnswer(by)) return undefined;
  const { run, store } = asked;
  const choice = askChoiceFor(pick, run);
  if (choice === undefined) return onceOnlyNotice(answering.approveKey);
  if (choice.verdict === "denied" && reason === undefined) {
    askWhy(run.callId);
    return undefined;
  }
  try {
    const outcome = await store.answerAsk(run.callId, choice.verdict, choice.scope, reason, note);
    if (isAskRefusal(outcome)) return outcome.detail;
    stopAskingWhy(run.callId);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function askInReach(store: AskStore, held: HeldAsk): ReachedAsk | undefined {
  const own = askingRun(store.projection(held.sessionId), held.callId);
  if (own !== undefined) return { store, run: own };
  return held.callId === undefined ? askReachedFromFocus() : undefined;
}

export function reachAsk(reach: AskReach): () => void {
  reaches.add(reach);
  return () => reaches.delete(reach);
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

const reaches = new Set<AskReach>();

function askReachedFromFocus(): ReachedAsk | undefined {
  const focused = focusedWindow().document.activeElement;
  for (const reach of reaches) {
    const held = reach.held();
    if (held?.callId === undefined || reach.root()?.contains(focused) !== true) continue;
    const run = askingRun(reach.store.projection(held.sessionId), held.callId);
    if (run !== undefined) return { store: reach.store, run };
  }
  return undefined;
}

function redoWhileTyping(): boolean {
  const page = focusedWindow().document;
  return isTextField(page.activeElement) && redoLastUndo(page);
}
