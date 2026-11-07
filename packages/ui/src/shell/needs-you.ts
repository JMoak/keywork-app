import type { PendingAsk, RoutineNeed, RoutineNeedKind } from "@keywork-app/protocol";
import { stampGlyph } from "../chrome/stamp.ts";
import type { HostNotice } from "../host/port.ts";

export type NeedsYouItem =
  | AskWaiting
  | AirlockWaiting
  | InboxWaiting
  | FailedTurn
  | ReviewWaiting
  | ChoreWaiting
  | DecidedForYou;

export type NeedsYouKind = NeedsYouItem["kind"];

export interface AskWaiting extends Waiting {
  readonly kind: "ask";
  readonly sessionId: string;
  readonly callId: string;
  readonly tool: string;
  readonly subject: string;
}

export interface AirlockWaiting extends Waiting {
  readonly kind: "airlock";
  readonly arc: string;
  readonly candidates: number;
  readonly questions: number;
}

export interface InboxWaiting extends Waiting {
  readonly kind: "inbox";
  readonly itemId: string;
  readonly title: string;
}

export interface FailedTurn extends Waiting {
  readonly kind: "failed";
  readonly sessionId: string;
  readonly message: string;
}

export interface ReviewWaiting extends Waiting {
  readonly kind: "review";
  readonly sessionId: string;
  readonly path: string;
  readonly header: string;
  readonly digest: string;
}

export interface ChoreWaiting extends Waiting {
  readonly kind: "chore";
  readonly creature: string;
  readonly routineId: string;
  readonly need: RoutineNeedKind;
  readonly reason: string;
  readonly runId: string | null;
  readonly digest: string | null;
}

export interface DecidedForYou extends Waiting {
  readonly kind: "decided";
  readonly sessionId: string;
  readonly recordId: string;
  readonly ruleClass: string;
  readonly tool: string;
  readonly creature: string | undefined;
}

interface Waiting {
  readonly key: string;
  readonly workspace: string;
  readonly since: string;
}

export const urgency: Readonly<Record<NeedsYouKind, number>> = {
  ask: 0,
  airlock: 1,
  inbox: 2,
  failed: 3,
  review: 4,
  chore: 5,
  decided: 6,
};

export function orderNeedsYou(items: readonly NeedsYouItem[]): NeedsYouItem[] {
  return [...items].sort(compareNeedsYou);
}

export function compareNeedsYou(a: NeedsYouItem, b: NeedsYouItem): number {
  return (
    urgency[a.kind] - urgency[b.kind] ||
    oldestFirst(a.since, b.since) ||
    a.workspace.localeCompare(b.workspace) ||
    a.key.localeCompare(b.key)
  );
}

export function waitingKey(workspace: string, kind: NeedsYouKind, local: string): string {
  return `${workspace}#${kind}:${local}`;
}

export function dismissible(item: NeedsYouItem): boolean {
  return item.kind !== "ask";
}

export const needsYouGlyph = stampGlyph("needs-you");

export const kindMarks: Readonly<Record<NeedsYouKind, string>> = {
  ask: needsYouGlyph,
  airlock: "▓",
  inbox: "▒",
  failed: stampGlyph("failed"),
  review: "▒",
  chore: "▓",
  decided: "░",
};

export function needYouCount(count: number): string {
  return count === 1 ? "1 needs you" : `${count} need you`;
}

export const bubbleWords = {
  finished: "finished",
  blocked: "blocked",
  question: "question",
} as const;

export function decidedForYouLine(item: Pick<DecidedForYou, "tool">): string {
  return `decided for you · approved ${item.tool}`;
}

export const editTools: ReadonlySet<string> = new Set([
  "edit",
  "write",
  "multi_edit",
  "multi-edit",
]);

export const shellTools: ReadonlySet<string> = new Set(["bash"]);

export function askGloss(tool: string, subject = ""): string {
  if (editTools.has(tool))
    return subject === "" ? "asks to edit a file" : `asks to edit ${subject}`;
  if (shellTools.has(tool)) {
    return subject === "" ? "asks to run a command" : `asks to run ${subject}`;
  }
  return bubbleWords.question;
}

export function glossOf(item: NeedsYouItem): string {
  switch (item.kind) {
    case "ask":
      return `ask: ${askSubject(item)}`;
    case "airlock":
      return `airlock: ${airlockTally(item)}`;
    case "inbox":
      return `inbox: ${item.title}`;
    case "failed":
      return `failed: ${item.message}`;
    case "review":
      return `review: ${item.path} ${item.header}`;
    case "chore":
      return `chore: ${item.reason}`;
    case "decided":
      return `${decidedForYouLine(item)} (${item.ruleClass})`;
  }
}

export function whereOf(item: NeedsYouItem, sessionName: (sessionId: string) => string): string {
  switch (item.kind) {
    case "ask":
    case "failed":
    case "review":
    case "decided":
      return sessionName(item.sessionId);
    case "airlock":
      return item.arc;
    case "inbox":
      return "memory";
    case "chore":
      return `${item.creature} · ${item.routineId}`;
  }
}

export function dismissNotice(item: NeedsYouItem): string {
  switch (item.kind) {
    case "ask":
      return "an ask is answered, never dismissed · enter goes to its card";
    case "failed":
      return "dismissed · the transcript keeps the failure";
    case "airlock":
    case "inbox":
      return "dismissed · the memory pane still holds it";
    case "review":
      return "dismissed · the diff pane still holds the hunk until you keep or drop it";
    case "chore":
      return "dismissed · the chores pane still holds it";
    case "decided":
      return "dismissed · the decision stands and the conversation keeps its notice";
  }
}

export const askReason = "needs you · ask";

export function askNotice(item: AskWaiting, title: string): HostNotice {
  return {
    title,
    body: askReason,
    trigger: {
      kind: "ask",
      workspace: item.workspace,
      sessionId: item.sessionId,
      callId: item.callId,
    },
  };
}

export function choreNotice(item: ChoreWaiting): HostNotice {
  return {
    title: `${item.creature} · ${item.routineId}`,
    body: glossOf(item),
    trigger: {
      kind: "chore",
      workspace: item.workspace,
      creature: item.creature,
      routineId: item.routineId,
    },
  };
}

export function choreAcceptedLine(routineId: string): string {
  return `${routineId}: grants accepted, the parked run proceeds`;
}

export function interrupts(item: ChoreWaiting): boolean {
  return item.need !== "grants" || item.runId !== null;
}

export function heldChoresAmong(items: readonly NeedsYouItem[]): RoutineNeed[] {
  return items.flatMap((item) => (item.kind === "chore" ? [routineNeedOf(item)] : []));
}

export function routineNeedOf(item: ChoreWaiting): RoutineNeed {
  return {
    creature: item.creature,
    routineId: item.routineId,
    kind: item.need,
    reason: item.reason,
    runId: item.runId,
    since: item.since === "" ? null : item.since,
    action: item.digest === null ? null : { verb: "accept", digest: item.digest },
  };
}

export function pendingAsksAmong(items: readonly NeedsYouItem[]): PendingAsk[] {
  return items.flatMap((item) => (item.kind === "ask" ? [pendingAskOf(item)] : []));
}

export function pendingAskOf(item: AskWaiting): PendingAsk {
  return {
    sessionId: item.sessionId,
    callId: item.callId,
    tool: item.tool,
    arguments: { subject: item.subject },
    askedAt: item.since,
  };
}

export const inboxNeedsYouAt = 3;

export function risingEdge(threshold = inboxNeedsYouAt): (count: number) => boolean {
  let above = false;
  return (count) => {
    const now = count >= threshold;
    const crossed = now && !above;
    above = now;
    return crossed;
  };
}

export function inboxNotice(workspace: string, pending: number): HostNotice {
  return {
    title: "memory inbox",
    body: `${pending} items wait for review`,
    trigger: { kind: "memory-inbox", workspace, pending },
  };
}

function askSubject(item: AskWaiting): string {
  if (item.subject === "") return item.tool;
  return item.tool === "bash" ? item.subject : `${item.tool} ${item.subject}`;
}

function airlockTally(item: AirlockWaiting): string {
  const parts = [countOf(item.candidates, "candidate"), countOf(item.questions, "question")].filter(
    (part) => part !== undefined,
  );
  return parts.length === 0 ? "ready to close" : parts.join(", ");
}

function countOf(count: number, noun: string): string | undefined {
  if (count === 0) return undefined;
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

function oldestFirst(a: string, b: string): number {
  return (Date.parse(a) || 0) - (Date.parse(b) || 0);
}
