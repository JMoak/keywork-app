import { decidedForYouLine } from "@keywork-app/habitat";
import { askGloss, bubbleWords } from "../shell/needs-you.ts";
import type {
  AnswerPick,
  CompanionSnapshot,
  HeldChoreNeed,
  HeldDecision,
  NeedsYouBubble,
  SemanticState,
  WorkTool,
} from "./port.ts";

export interface ThreadFacts {
  id: string;
  title: string;
  live: boolean;
  working: boolean;
  failed: boolean;
  finishedUnseen: boolean;
  paused: boolean;
  tool: WorkTool;
  ask: { callId: string; tool: string; answers: readonly AnswerPick[] } | undefined;
  crate?: boolean | undefined;
}

export interface CreatureFacts {
  name: string;
  hueStop: number | undefined;
  slug?: string | undefined;
}

export const statePriority: readonly SemanticState[] = [
  "porch",
  "blocked",
  "back",
  "working",
  "paused",
  "idle",
];

export const stateLabels: Readonly<Record<SemanticState, string>> = {
  porch: "at the porch",
  blocked: "blocked",
  back: "back with work",
  working: "working",
  paused: "paused",
  idle: "idle",
};

export function snapshotFrom(
  creature: CreatureFacts,
  threads: readonly ThreadFacts[],
  heldChore?: HeldChoreNeed,
  decided?: HeldDecision,
): CompanionSnapshot {
  const ranked = [...threads].sort((a, b) => rank(stateOf(a)) - rank(stateOf(b)));
  const lead = ranked[0];
  const threadState = lead === undefined ? "idle" : stateOf(lead);
  const state = heldChore !== undefined || decided !== undefined ? "porch" : threadState;
  return {
    creature,
    state,
    stateLabel: stateLabels[state],
    activeThreads: threads.filter((thread) => thread.live || thread.working).length,
    finishedUnseen: threads.filter((thread) => thread.finishedUnseen).length,
    threadId: lead?.id,
    tool: state === "working" ? lead?.tool : undefined,
    needsYou: lead !== undefined && threadState === "porch" ? bubbleOf(lead) : undefined,
    heldChore,
    ...(decided !== undefined && { decided }),
    ...(state === "back" && lead?.crate === true && { crate: true }),
  };
}

export function decidedBubble(decided: HeldDecision): NeedsYouBubble {
  return {
    title: decided.title,
    line: decidedForYouLine(decided.tool),
    callId: undefined,
    answers: [],
    overturn: { recordId: decided.recordId },
  };
}

export function choreBubble(held: HeldChoreNeed): NeedsYouBubble {
  return {
    title: `${held.creature} · ${held.routineId}`,
    line: held.line,
    callId: undefined,
    answers: [],
    accept:
      held.digest === undefined
        ? undefined
        : { creature: held.creature, routineId: held.routineId, digest: held.digest },
  };
}

export function bubbleShown(snapshot: CompanionSnapshot): NeedsYouBubble | undefined {
  if (snapshot.needsYou !== undefined) return snapshot.needsYou;
  if (snapshot.heldChore !== undefined) return choreBubble(snapshot.heldChore);
  return snapshot.decided === undefined ? undefined : decidedBubble(snapshot.decided);
}

export function stateOf(thread: ThreadFacts): SemanticState {
  if (thread.ask !== undefined) return "porch";
  if (thread.failed) return "blocked";
  if (thread.finishedUnseen) return "back";
  if (thread.paused) return "paused";
  if (thread.working) return "working";
  return "idle";
}

export function bubbleLine(thread: ThreadFacts): string {
  if (thread.ask !== undefined) return askLine(thread.ask.tool);
  if (thread.failed) return bubbleWords.blocked;
  if (thread.finishedUnseen) return bubbleWords.finished;
  return bubbleWords.question;
}

export function askLine(tool: string): string {
  return askGloss(tool);
}

function bubbleOf(thread: ThreadFacts) {
  return {
    title: thread.title,
    line: bubbleLine(thread),
    callId: thread.ask?.callId,
    answers: thread.ask?.answers ?? [],
  };
}

function rank(state: SemanticState): number {
  return statePriority.indexOf(state);
}
