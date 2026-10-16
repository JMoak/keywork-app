import { toolSubject } from "@keywork-app/client";
import type {
  AirlockDigest,
  BusEnvelope,
  MemoryGarden,
  PendingAsk,
  StagedItem,
} from "@keywork-app/protocol";
import { inboxView } from "../panes/memory/rows.ts";
import {
  type AirlockWaiting,
  type AskWaiting,
  type FailedTurn,
  type InboxWaiting,
  type NeedsYouItem,
  waitingKey,
} from "./needs-you.ts";

export interface WireLedger {
  readonly asks: ReadonlyMap<string, AskWaiting>;
  readonly answered: ReadonlySet<string>;
  readonly failures: ReadonlyMap<string, FailedTurn>;
  readonly betweenTurns: ReadonlySet<string>;
}

export const emptyWireLedger: WireLedger = {
  asks: new Map(),
  answered: new Set(),
  failures: new Map(),
  betweenTurns: new Set(),
};

export function foldWire(
  ledger: WireLedger,
  workspace: string,
  envelopes: readonly BusEnvelope[],
): WireLedger {
  const moving = envelopes.filter((envelope) => queueEvents.has(envelope.type));
  if (moving.length === 0) return ledger;
  const draft = draftOf(ledger);
  for (const envelope of moving) absorb(draft, workspace, envelope);
  return draft;
}

export function reconcileAsks(
  ledger: WireLedger,
  workspace: string,
  pending: readonly PendingAsk[],
  knownBeforeAsking: ReadonlySet<string> = new Set(),
): WireLedger {
  const asks = new Map(ledger.asks);
  const stillPending = new Set(pending.map((ask) => ask.callId));
  for (const callId of knownBeforeAsking) if (!stillPending.has(callId)) asks.delete(callId);
  for (const ask of pending) {
    if (!ledger.answered.has(ask.callId) && !asks.has(ask.callId)) {
      asks.set(ask.callId, askWaiting(workspace, ask.sessionId, ask.askedAt, ask));
    }
  }
  return { ...ledger, asks };
}

export function freshAsks(before: WireLedger, after: WireLedger): AskWaiting[] {
  return [...after.asks.values()].filter((ask) => !before.asks.has(ask.callId));
}

export function wireItems(ledger: WireLedger): NeedsYouItem[] {
  return [...ledger.asks.values(), ...ledger.failures.values()];
}

export function memoryItems(
  workspace: string,
  garden: MemoryGarden,
  firstSeen: (key: string) => string,
): NeedsYouItem[] {
  return [
    ...garden.airlocks.map((digest) => airlockWaiting(workspace, digest, firstSeen)),
    ...garden.inbox.map((item) => inboxWaiting(workspace, item)),
  ];
}

const queueEvents: ReadonlySet<BusEnvelope["type"]> = new Set([
  "gate.ask",
  "gate.permission",
  "turn.started",
  "turn.completed",
  "turn.interrupted",
  "engine.error",
  "session.removed",
]);

interface DraftLedger {
  asks: Map<string, AskWaiting>;
  answered: Set<string>;
  failures: Map<string, FailedTurn>;
  betweenTurns: Set<string>;
}

function draftOf(ledger: WireLedger): DraftLedger {
  return {
    asks: new Map(ledger.asks),
    answered: new Set(ledger.answered),
    failures: new Map(ledger.failures),
    betweenTurns: new Set(ledger.betweenTurns),
  };
}

function absorb(draft: DraftLedger, workspace: string, envelope: BusEnvelope): void {
  if (envelope.type === "gate.permission") {
    draft.asks.delete(envelope.payload.decision.callId);
    draft.answered.add(envelope.payload.decision.callId);
    return;
  }
  if (envelope.payload.replay === true) return;
  const session = envelope.sessionId;
  switch (envelope.type) {
    case "gate.ask": {
      const ask = envelope.payload.ask;
      if (!draft.answered.has(ask.callId)) {
        draft.asks.set(ask.callId, askWaiting(workspace, session, envelope.ts, ask));
      }
      return;
    }
    case "turn.started":
      draft.failures.delete(session);
      draft.betweenTurns.delete(session);
      return;
    case "turn.completed":
    case "turn.interrupted":
      draft.betweenTurns.add(session);
      return;
    case "engine.error":
      if (session === "" || draft.betweenTurns.has(session)) return;
      draft.failures.set(session, failedTurn(workspace, envelope));
      draft.betweenTurns.add(session);
      return;
    case "session.removed":
      draft.failures.delete(envelope.payload.sessionId);
      return;
  }
}

function askWaiting(
  workspace: string,
  sessionId: string,
  since: string,
  ask: { callId: string; tool: string; arguments: unknown },
): AskWaiting {
  return {
    kind: "ask",
    key: waitingKey(workspace, "ask", ask.callId),
    workspace,
    since,
    sessionId,
    callId: ask.callId,
    tool: ask.tool,
    subject: toolSubject(ask.arguments),
  };
}

function failedTurn(workspace: string, envelope: BusEnvelope<"engine.error">): FailedTurn {
  return {
    kind: "failed",
    key: waitingKey(workspace, "failed", `${envelope.sessionId}:${envelope.id}`),
    workspace,
    since: envelope.ts,
    sessionId: envelope.sessionId,
    message: firstLine(envelope.payload.error.message),
  };
}

function inboxWaiting(workspace: string, item: StagedItem): InboxWaiting {
  return {
    kind: "inbox",
    key: waitingKey(workspace, "inbox", item.id),
    workspace,
    since: item.created,
    itemId: item.id,
    title: inboxView(item).title,
  };
}

function airlockWaiting(
  workspace: string,
  digest: AirlockDigest,
  firstSeen: (key: string) => string,
): AirlockWaiting {
  const key = waitingKey(workspace, "airlock", digest.arc);
  const created = [...digest.candidates, ...digest.questions]
    .flatMap((entry) => (entry.created === undefined ? [] : [entry.created]))
    .sort();
  return {
    kind: "airlock",
    key,
    workspace,
    since: created[0] ?? firstSeen(key),
    arc: digest.arc,
    candidates: digest.candidates.filter((candidate) => candidate.choice === undefined).length,
    questions: digest.questions.filter((question) => question.choice === undefined).length,
  };
}

function firstLine(text: string): string {
  return text.split("\n", 1)[0]?.trim() ?? "";
}
