import { stampGlyph } from "../chrome/stamp.ts";
import type { HostNotice } from "../host/port.ts";

export type NeedsYouItem = AskWaiting | AirlockWaiting | InboxWaiting | FailedTurn;

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
};

export function needYouCount(count: number): string {
  return count === 1 ? "1 needs you" : `${count} need you`;
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
  }
}

export function whereOf(item: NeedsYouItem, sessionName: (sessionId: string) => string): string {
  switch (item.kind) {
    case "ask":
    case "failed":
      return sessionName(item.sessionId);
    case "airlock":
      return item.arc;
    case "inbox":
      return "memory";
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
