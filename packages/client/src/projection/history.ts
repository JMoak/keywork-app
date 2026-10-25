import type {
  BusEnvelope,
  ContextEditMark,
  Message,
  PermissionDecision,
  SessionDetail,
  SessionEntries,
  SummaryKind,
  ToolCallPart,
} from "@keywork-app/protocol";
import { promptIds, readJournal } from "./journal.ts";
import { emptyProjection, type SessionProjection } from "./types.ts";

export function historyEnvelopes(detail: SessionDetail, journal?: SessionEntries): BusEnvelope[] {
  const stamp = { ts: detail.lastActivityAt, sessionId: detail.id };
  const marked = markedEntryIds(detail);
  const forgotten = forgottenPromptsAt(detail);
  const reading = journal === undefined ? undefined : readJournal(journal);
  const placed = reading === undefined ? noIds : promptIds(detail, reading.prompts);
  const decisions = reading?.decisions ?? new Map<string, PermissionDecision>();
  const envelopes: BusEnvelope[] = [];
  const calls = new Map<string, ToolCallPart>();
  let id = 0;
  const emit = (envelope: Omit<BusEnvelope, "id" | "ts" | "sessionId">): void => {
    id -= 1;
    envelopes.push({ ...stamp, id, ...envelope } as BusEnvelope);
  };
  const replayForgottenAt = (index: number): void => {
    for (const edit of forgotten.get(index) ?? []) replayForgotten(edit, emit);
  };
  detail.messages.forEach((message, index) => {
    replayForgottenAt(index);
    const entryId = marked.get(index) ?? placed.get(index);
    if (message.role === "user") replayPrompt(message, entryId, emit);
    else if (message.role === "assistant") replayAssistant(message, calls, emit);
    else replayToolResults(message, calls, decisions, emit);
  });
  replayForgottenAt(detail.messages.length);
  return envelopes;
}

export function replayBase(detail: SessionDetail | undefined): SessionProjection {
  const forkedFrom = detail?.forkedFrom;
  return {
    ...emptyProjection,
    summaries: summaryKindsOf(detail),
    flushes: Object.fromEntries((detail?.flushes ?? []).map((mark) => [mark.entryId, mark.facts])),
    ...(forkedFrom !== undefined && { forkedFrom }),
  };
}

export function summaryKindsOf(detail: SessionDetail | undefined): Record<string, SummaryKind> {
  return Object.fromEntries((detail?.summaries ?? []).map((mark) => [mark.entryId, mark.kind]));
}

type Emit = (envelope: Omit<BusEnvelope, "id" | "ts" | "sessionId">) => void;

const noIds: ReadonlyMap<number, string> = new Map();

function markedEntryIds(detail: SessionDetail): ReadonlyMap<number, string> {
  const marks = [...(detail.summaries ?? []), ...(detail.flushes ?? [])];
  return new Map(marks.map((mark) => [mark.index, mark.entryId]));
}

function forgottenPromptsAt(detail: SessionDetail): ReadonlyMap<number, ContextEditMark[]> {
  const slots = new Map<number, ContextEditMark[]>();
  for (const edit of detail.edits ?? []) {
    if (edit.kind !== "forgotten" || edit.role !== "user") continue;
    slots.set(edit.index, [...(slots.get(edit.index) ?? []), edit]);
  }
  return slots;
}

const zeroUsage = { inputTokens: 0, outputTokens: 0 };

function replayPrompt(message: Message, entryId: string | undefined, emit: Emit): void {
  emit({
    type: "turn.started",
    payload: {
      userText: textOf(message),
      ...(entryId !== undefined && { entryId }),
      replay: true,
    },
  });
}

function replayForgotten(edit: ContextEditMark, emit: Emit): void {
  emit({
    type: "turn.started",
    payload: { userText: edit.text, entryId: edit.entryId, replay: true },
  });
}

function replayAssistant(message: Message, calls: Map<string, ToolCallPart>, emit: Emit): void {
  for (const part of message.parts) {
    if (part.type === "text" || part.type === "visible-thinking") {
      emit({ type: "turn.delta", payload: { delta: part, replay: true } });
    } else if (part.type === "tool-call") {
      const call: ToolCallPart = {
        type: "tool-call",
        callId: part.callId,
        name: part.name,
        arguments: part.arguments,
      };
      calls.set(call.callId, call);
      emit({ type: "turn.delta", payload: { delta: { type: "tool-call", call }, replay: true } });
    }
  }
  if (!message.parts.some((part) => part.type === "tool-call")) {
    emit({ type: "turn.completed", payload: { message, usage: zeroUsage, replay: true } });
  }
}

function replayToolResults(
  message: Message,
  calls: Map<string, ToolCallPart>,
  decisions: ReadonlyMap<string, PermissionDecision>,
  emit: Emit,
): void {
  for (const part of message.parts) {
    if (part.type !== "tool-result") continue;
    const call = calls.get(part.callId);
    if (call !== undefined) emit({ type: "tool.started", payload: { call, replay: true } });
    const decision = decisions.get(part.callId);
    if (decision !== undefined) {
      emit({ type: "gate.permission", payload: { decision, replay: true } });
    }
    emit({
      type: "tool.finished",
      payload: {
        callId: part.callId,
        output: part.output,
        isError: part.isError,
        ...(part.spill !== undefined && { spill: part.spill }),
        replay: true,
      },
    });
  }
}

function textOf(message: Message): string {
  return message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
}
