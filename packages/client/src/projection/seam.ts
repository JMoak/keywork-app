import type { BusEnvelope, PendingAsk, SessionDetail, SessionEntries } from "@keywork-app/protocol";
import { historyEnvelopes, textOf } from "./history.ts";

export interface SnapshotSeam {
  readonly detail: SessionDetail;
  readonly journal?: SessionEntries | undefined;
  readonly pending: readonly PendingAsk[];
  readonly heard: readonly BusEnvelope[];
  readonly arrived: readonly BusEnvelope[];
}

export function joinSnapshot(seam: SnapshotSeam): BusEnvelope[] {
  const { detail } = seam;
  const running = turnAtSnapshot(detail, seam.heard);
  const history = historyEnvelopes(detail, seam.journal, running?.prompt);
  const retold = running?.retold ?? [];
  const live = seam.arrived.filter(arrivedAfterSnapshot(detail.asOf, retold));
  const told = callIdsIn([...retold, ...live]);
  const asks = askEnvelopes(
    detail,
    seam.pending.filter((ask) => !told.has(ask.callId)),
  );
  return [...history, ...asks, ...retold, ...live];
}

export function opensTurn(envelope: BusEnvelope): boolean {
  return envelope.type === "turn.started" && envelope.payload.replay !== true;
}

export function closesTurn(envelope: BusEnvelope): boolean {
  return envelope.type === "turn.completed" || envelope.type === "turn.interrupted";
}

interface TurnAtSnapshot {
  readonly prompt: number;
  readonly retold: readonly BusEnvelope[];
}

function turnAtSnapshot(
  detail: SessionDetail,
  heard: readonly BusEnvelope[],
): TurnAtSnapshot | undefined {
  const started = heard.findLast((envelope) => opensTurn(envelope) && envelope.id <= detail.asOf);
  if (started?.type !== "turn.started") return undefined;
  const prompt = detail.messages.findLastIndex((message) => message.role === "user");
  const message = detail.messages[prompt];
  if (message === undefined || textOf(message) !== started.payload.userText) return undefined;
  const retold = heard.filter(
    (envelope) => envelope.id >= started.id && envelope.id <= detail.asOf,
  );
  return { prompt, retold };
}

function arrivedAfterSnapshot(
  asOf: number,
  retold: readonly BusEnvelope[],
): (envelope: BusEnvelope) => boolean {
  const retelling = new Set(retold.map((envelope) => envelope.id));
  return (envelope) =>
    !retelling.has(envelope.id) && (envelope.id > asOf || envelope.type === "session.state");
}

function callIdsIn(envelopes: readonly BusEnvelope[]): ReadonlySet<string> {
  return new Set(envelopes.flatMap(callIdOf));
}

function callIdOf(envelope: BusEnvelope): string[] {
  switch (envelope.type) {
    case "gate.ask":
      return [envelope.payload.ask.callId];
    case "tool.started":
      return [envelope.payload.call.callId];
    case "turn.delta":
      return envelope.payload.delta.type === "tool-call"
        ? [envelope.payload.delta.call.callId]
        : [];
    default:
      return [];
  }
}

function askEnvelopes(detail: SessionDetail, pending: readonly PendingAsk[]): BusEnvelope[] {
  return pending
    .filter((ask) => ask.sessionId === detail.id)
    .map((ask, index) => ({
      id: -1_000_000 - index,
      ts: ask.askedAt,
      sessionId: detail.id,
      type: "gate.ask" as const,
      payload: {
        ask: {
          tool: ask.tool,
          callId: ask.callId,
          arguments: ask.arguments,
          rule: "default" as const,
          rules: ask.rules ?? [],
          ...(ask.preview === undefined ? {} : { preview: ask.preview }),
        },
      },
    }));
}
