import {
  type AirlockWaiting,
  type AskWaiting,
  type FailedTurn,
  type InboxWaiting,
  waitingKey,
} from "./needs-you.ts";

export function askItem(callId: string, overrides: Partial<AskWaiting> = {}): AskWaiting {
  const workspace = overrides.workspace ?? "C:/work";
  return {
    kind: "ask",
    key: waitingKey(workspace, "ask", callId),
    workspace,
    since: "2026-10-15T10:00:00.000Z",
    sessionId: "s1",
    callId,
    tool: "bash",
    subject: "rm -rf dist",
    ...overrides,
  };
}

export function airlockItem(arc: string, overrides: Partial<AirlockWaiting> = {}): AirlockWaiting {
  const workspace = overrides.workspace ?? "C:/work";
  return {
    kind: "airlock",
    key: waitingKey(workspace, "airlock", arc),
    workspace,
    since: "2026-10-15T09:00:00.000Z",
    arc,
    candidates: 2,
    questions: 1,
    ...overrides,
  };
}

export function inboxItem(id: string, overrides: Partial<InboxWaiting> = {}): InboxWaiting {
  const workspace = overrides.workspace ?? "C:/work";
  return {
    kind: "inbox",
    key: waitingKey(workspace, "inbox", id),
    workspace,
    since: "2026-10-15T08:00:00.000Z",
    itemId: id,
    title: "entities/pricing.md",
    ...overrides,
  };
}

export function failedItem(sessionId: string, overrides: Partial<FailedTurn> = {}): FailedTurn {
  const workspace = overrides.workspace ?? "C:/work";
  return {
    kind: "failed",
    key: waitingKey(workspace, "failed", `${sessionId}:9`),
    workspace,
    since: "2026-10-15T07:00:00.000Z",
    sessionId,
    message: "provider answered 529 overloaded",
    ...overrides,
  };
}
