import type { BusEnvelope, Message, SessionDetail, ToolCallPart } from "@keywork-app/protocol";

export function historyEnvelopes(detail: SessionDetail): BusEnvelope[] {
  const stamp = { ts: detail.lastActivityAt, sessionId: detail.id };
  const envelopes: BusEnvelope[] = [];
  const calls = new Map<string, ToolCallPart>();
  let id = 0;
  const emit = (envelope: Omit<BusEnvelope, "id" | "ts" | "sessionId">): void => {
    id -= 1;
    envelopes.push({ ...stamp, id, ...envelope } as BusEnvelope);
  };
  for (const message of detail.messages) {
    if (message.role === "user") {
      emit({ type: "turn.started", payload: { userText: textOf(message), replay: true } });
    } else if (message.role === "assistant") {
      replayAssistant(message, calls, emit);
    } else {
      replayToolResults(message, calls, emit);
    }
  }
  return envelopes;
}

type Emit = (envelope: Omit<BusEnvelope, "id" | "ts" | "sessionId">) => void;

const zeroUsage = { inputTokens: 0, outputTokens: 0 };

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

function replayToolResults(message: Message, calls: Map<string, ToolCallPart>, emit: Emit): void {
  for (const part of message.parts) {
    if (part.type !== "tool-result") continue;
    const call = calls.get(part.callId);
    if (call !== undefined) emit({ type: "tool.started", payload: { call, replay: true } });
    emit({
      type: "tool.finished",
      payload: { callId: part.callId, output: part.output, isError: part.isError, replay: true },
    });
  }
}

function textOf(message: Message): string {
  return message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
}
