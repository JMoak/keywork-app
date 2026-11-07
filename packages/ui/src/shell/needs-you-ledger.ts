import { openAsks, toolSubject } from "@keywork-app/client";
import type {
  AirlockDigest,
  BusEnvelope,
  MemoryGarden,
  PendingAsk,
  RoutineNeed,
  StagedItem,
  VerdictMark,
} from "@keywork-app/protocol";
import { stagedWrites, stagingNeedsYou } from "../panes/memory/admission.ts";
import { inboxView } from "../panes/memory/rows.ts";
import {
  type AirlockWaiting,
  type AskWaiting,
  type ChoreWaiting,
  type DecidedForYou,
  type FailedTurn,
  type InboxWaiting,
  type NeedsYouItem,
  type ReviewWaiting,
  waitingKey,
} from "./needs-you.ts";

export interface WireLedger {
  readonly asks: ReadonlyMap<string, AskWaiting>;
  readonly answered: ReadonlySet<string>;
  readonly failures: ReadonlyMap<string, FailedTurn>;
  readonly betweenTurns: ReadonlySet<string>;
  readonly chores: ReadonlyMap<string, ChoreWaiting>;
  readonly reviews: ReadonlyMap<string, ReviewWaiting>;
  readonly decided: ReadonlyMap<string, DecidedForYou>;
}

export const emptyWireLedger: WireLedger = {
  asks: new Map(),
  answered: new Set(),
  failures: new Map(),
  betweenTurns: new Set(),
  chores: new Map(),
  reviews: new Map(),
  decided: new Map(),
};

export const reviewExtension = "review";

export const keeperExtension = "keeper";

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

export function reconcileChores(
  ledger: WireLedger,
  workspace: string,
  needs: readonly RoutineNeed[],
): WireLedger {
  const chores = new Map(needs.map((need) => entryOf(choreWaiting(workspace, need))));
  return { ...ledger, chores };
}

export function freshAsks(before: WireLedger, after: WireLedger): AskWaiting[] {
  return [...after.asks.values()].filter((ask) => !before.asks.has(ask.callId));
}

export function freshChores(before: WireLedger, after: WireLedger): ChoreWaiting[] {
  return [...after.chores.values()].filter((chore) => {
    const held = before.chores.get(chore.key);
    return held === undefined || held.runId !== chore.runId;
  });
}

export function reconcileReviews(
  ledger: WireLedger,
  workspace: string,
  sessionId: string,
  verdicts: readonly VerdictMark[],
): WireLedger {
  const reviews = new Map(
    [...ledger.reviews].filter(([, waiting]) => waiting.sessionId !== sessionId),
  );
  for (const mark of openAsks(verdicts)) {
    const waiting = reviewWaiting(workspace, sessionId, mark);
    reviews.set(waiting.key, waiting);
  }
  return { ...ledger, reviews };
}

export function needsYouCount(items: readonly NeedsYouItem[]): number {
  return new Set(items.map((item) => item.key)).size;
}

export function wireItems(ledger: WireLedger): NeedsYouItem[] {
  return [
    ...ledger.asks.values(),
    ...ledger.failures.values(),
    ...ledger.reviews.values(),
    ...ledger.chores.values(),
    ...ledger.decided.values(),
  ];
}

export function memoryItems(
  workspace: string,
  garden: MemoryGarden,
  firstSeen: (key: string) => string,
): NeedsYouItem[] {
  const staged = new Set<StagedItem>(stagedWrites(garden.inbox));
  return [
    ...garden.airlocks.map((digest) => airlockWaiting(workspace, digest, firstSeen)),
    ...garden.inbox
      .filter((item) => !staged.has(item))
      .map((item) => inboxWaiting(workspace, item)),
    ...stagingNeedsYou(workspace, garden.inbox),
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
  "routine.needs",
  "extension.notice",
]);

interface DraftLedger {
  asks: Map<string, AskWaiting>;
  answered: Set<string>;
  failures: Map<string, FailedTurn>;
  betweenTurns: Set<string>;
  chores: Map<string, ChoreWaiting>;
  reviews: Map<string, ReviewWaiting>;
  decided: Map<string, DecidedForYou>;
}

function draftOf(ledger: WireLedger): DraftLedger {
  return {
    asks: new Map(ledger.asks),
    answered: new Set(ledger.answered),
    failures: new Map(ledger.failures),
    betweenTurns: new Set(ledger.betweenTurns),
    chores: new Map(ledger.chores),
    reviews: new Map(ledger.reviews),
    decided: new Map(ledger.decided),
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
      forgetSession(draft.reviews, envelope.payload.sessionId);
      forgetSession(draft.decided, envelope.payload.sessionId);
      return;
    case "extension.notice":
      absorbNotice(draft, workspace, envelope);
      return;
    case "routine.needs": {
      const { creature, routineId, items } = envelope.payload;
      for (const [key, held] of draft.chores) {
        if (held.creature === creature && held.routineId === routineId) draft.chores.delete(key);
      }
      for (const need of items) {
        const [key, waiting] = entryOf(choreWaiting(workspace, need));
        draft.chores.set(key, waiting);
      }
      return;
    }
  }
}

function absorbNotice(
  draft: DraftLedger,
  workspace: string,
  envelope: BusEnvelope<"extension.notice">,
): void {
  const decision = keeperDecisionOf(envelope.payload);
  if (decision !== undefined) {
    const waiting = decidedForYou(workspace, envelope, decision);
    draft.decided.set(waiting.key, waiting);
    return;
  }
  const mark = verdictMarkOf(envelope.payload);
  if (mark === undefined) return;
  const waiting = reviewWaiting(workspace, envelope.sessionId, mark);
  if (mark.verdict === "ask") draft.reviews.set(waiting.key, waiting);
  else draft.reviews.delete(waiting.key);
}

function forgetSession(held: Map<string, { readonly sessionId: string }>, sessionId: string): void {
  for (const [key, waiting] of held) if (waiting.sessionId === sessionId) held.delete(key);
}

function entryOf(waiting: ChoreWaiting): [string, ChoreWaiting] {
  return [waiting.key, waiting];
}

function verdictMarkOf(
  payload: BusEnvelope<"extension.notice">["payload"],
): VerdictMark | undefined {
  if (payload.extension !== reviewExtension) return undefined;
  const detail = payload.detail as { verdict?: VerdictMark } | undefined;
  const mark = detail?.verdict;
  return mark !== undefined && typeof mark.digest === "string" ? mark : undefined;
}

interface KeeperDecision {
  readonly recordId: string;
  readonly ruleClass: string;
  readonly tool: string;
  readonly creature: string | undefined;
}

function keeperDecisionOf(
  payload: BusEnvelope<"extension.notice">["payload"],
): KeeperDecision | undefined {
  if (payload.extension !== keeperExtension) return undefined;
  const detail = (payload.detail ?? {}) as Partial<Record<keyof KeeperDecision, unknown>>;
  const { recordId, ruleClass, tool, creature } = detail;
  if (typeof recordId !== "string" || typeof ruleClass !== "string" || typeof tool !== "string") {
    return undefined;
  }
  return {
    recordId,
    ruleClass,
    tool,
    creature: typeof creature === "string" ? creature : undefined,
  };
}

function decidedForYou(
  workspace: string,
  envelope: BusEnvelope<"extension.notice">,
  decision: KeeperDecision,
): DecidedForYou {
  return {
    kind: "decided",
    key: waitingKey(workspace, "decided", decision.recordId),
    workspace,
    since: envelope.ts,
    sessionId: envelope.sessionId,
    ...decision,
  };
}

function reviewWaiting(workspace: string, sessionId: string, mark: VerdictMark): ReviewWaiting {
  return {
    kind: "review",
    key: waitingKey(workspace, "review", `${sessionId}#${mark.path}#${mark.digest}`),
    workspace,
    since: mark.at,
    sessionId,
    path: mark.path,
    header: mark.header,
    digest: mark.digest,
  };
}

function choreWaiting(workspace: string, need: RoutineNeed): ChoreWaiting {
  return {
    kind: "chore",
    key: waitingKey(workspace, "chore", `${need.creature}/${need.routineId}/${need.kind}`),
    workspace,
    since: need.since ?? "",
    creature: need.creature,
    routineId: need.routineId,
    need: need.kind,
    reason: need.reason,
    runId: need.runId,
    digest: need.action?.digest ?? null,
  };
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
