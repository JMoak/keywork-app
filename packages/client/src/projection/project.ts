import type {
  BusEnvelope,
  EnginePayloads,
  PermissionDecision,
  ToolCallPart,
  TurnDelta,
  Usage,
} from "@keywork-app/protocol";
import { compactJson, toolSubject } from "./tool-row.ts";
import type {
  AssistantEntry,
  SessionProjection,
  ThinkingEntry,
  ToolEntry,
  ToolRun,
  TranscriptEntry,
  UsageLedger,
} from "./types.ts";

export function project(state: SessionProjection, envelope: BusEnvelope): SessionProjection {
  const next = absorb(state, envelope);
  return next.lastEventId === envelope.id ? next : { ...next, lastEventId: envelope.id };
}

export function projectAll(
  state: SessionProjection,
  envelopes: Iterable<BusEnvelope>,
): SessionProjection {
  let current = state;
  for (const envelope of envelopes) current = project(current, envelope);
  return current;
}

export const detailLineLimit = 12;

function absorb(state: SessionProjection, envelope: BusEnvelope): SessionProjection {
  const replay = envelope.payload.replay === true;
  switch (envelope.type) {
    case "turn.started":
      return startTurn(state, envelope.payload, envelope.ts, replay);
    case "turn.delta":
      return streamDelta(state, envelope.payload.delta, envelope.ts, replay);
    case "turn.completed":
      return endTurn(settleUsage(state, envelope.payload.usage, replay));
    case "turn.interrupted":
      return notice(endTurn(state), "info", "· interrupted");
    case "queue.changed":
      return { ...state, queue: envelope.payload.queued };
    case "tool.started":
      return startTool(state, envelope.payload.call, envelope.ts, replay);
    case "tool.output":
      return tailTool(state, envelope.payload.chunk, envelope.payload.callId);
    case "tool.finished":
      return settleTool(state, envelope.payload, envelope.ts);
    case "gate.permission":
      return decide(state, envelope.payload.decision);
    case "gate.preset":
      return { ...state, preset: envelope.payload.to };
    case "session.mode":
      return { ...state, mode: envelope.payload.mode };
    case "context.injected":
      return { ...state, injections: [...state.injections, envelope.payload.injection] };
    case "diagnostics.published":
      return {
        ...state,
        diagnostics: { ...state.diagnostics, [envelope.payload.path]: envelope.payload.count },
      };
    case "shell.reset":
      return replay ? state : notice(state, "info", "· shell reset");
    case "engine.error":
      return notice(
        endTurn({ ...state, lastError: envelope.payload.error.message }),
        "error",
        envelope.payload.error.message,
      );
  }
}

function startTurn(
  state: SessionProjection,
  payload: EnginePayloads["turn.started"],
  ts: string,
  replay: boolean,
): SessionProjection {
  const entry: TranscriptEntry = {
    kind: "user",
    text: payload.userText,
    ...(payload.entryId !== undefined && { entryId: payload.entryId }),
    replay,
  };
  return {
    ...settleStream(state),
    entries: [...state.entries, entry],
    turn: replay ? state.turn : { startedAt: ts, userText: payload.userText },
  };
}

function endTurn(state: SessionProjection): SessionProjection {
  return { ...settleStream(state), turn: undefined };
}

function settleStream(state: SessionProjection): SessionProjection {
  if (state.streaming === undefined) return state;
  const entry = state.entries[state.streaming];
  if (entry?.kind !== "assistant") return { ...state, streaming: undefined };
  return {
    ...state,
    entries: replaceAt(state.entries, state.streaming, { ...entry, settled: true }),
    streaming: undefined,
  };
}

function streamDelta(
  state: SessionProjection,
  delta: TurnDelta,
  ts: string,
  replay: boolean,
): SessionProjection {
  switch (delta.type) {
    case "text":
      return streamText(state, delta.text, replay);
    case "visible-thinking":
      return streamThinking(state, delta.text, replay);
    case "tool-call":
      return proposeTool(state, delta.call, ts, replay);
    default:
      return state;
  }
}

function streamText(state: SessionProjection, text: string, replay: boolean): SessionProjection {
  const last = state.entries.at(-1);
  const index = state.entries.length - 1;
  if (last?.kind === "assistant" && !last.settled && state.streaming === index) {
    return {
      ...state,
      entries: replaceAt(state.entries, index, { ...last, text: last.text + text }),
    };
  }
  const entry: AssistantEntry = { kind: "assistant", text, replay, settled: false };
  const settled = settleStream(state);
  return {
    ...settled,
    entries: [...settled.entries, entry],
    streaming: settled.entries.length,
  };
}

function streamThinking(
  state: SessionProjection,
  text: string,
  replay: boolean,
): SessionProjection {
  const last = state.entries.at(-1);
  const index = state.entries.length - 1;
  if (last?.kind === "thinking" && state.streaming === undefined) {
    return {
      ...state,
      entries: replaceAt(state.entries, index, { ...last, text: last.text + text }),
    };
  }
  const entry: ThinkingEntry = { kind: "thinking", text, replay };
  const settled = settleStream(state);
  return { ...settled, entries: [...settled.entries, entry] };
}

function proposeTool(
  state: SessionProjection,
  call: ToolCallPart,
  ts: string,
  replay: boolean,
): SessionProjection {
  if (state.running[call.callId] !== undefined) return state;
  const run = newRun(call, replay, "proposed", ts);
  return appendRun(settleStream(state), run);
}

function startTool(
  state: SessionProjection,
  call: ToolCallPart,
  ts: string,
  replay: boolean,
): SessionProjection {
  const index = state.running[call.callId];
  if (index !== undefined) {
    return updateRun(state, index, (run) => ({ ...run, phase: "running", startedAt: ts }));
  }
  return appendRun(settleStream(state), newRun(call, replay, "running", ts));
}

function tailTool(
  state: SessionProjection,
  chunk: string,
  callId: string | undefined,
): SessionProjection {
  const index = liveRunIndex(state, callId);
  if (index === undefined) return state;
  return updateRun(state, index, (run) => ({ ...run, live: lastLine(run.live, chunk) }));
}

function settleTool(
  state: SessionProjection,
  payload: EnginePayloads["tool.finished"],
  ts: string,
): SessionProjection {
  const index = state.running[payload.callId];
  if (index === undefined) return state;
  const { [payload.callId]: _, ...running } = state.running;
  const settled = updateRun(state, index, (run) => ({
    ...run,
    phase: run.phase === "refused" ? "refused" : payload.isError ? "failed" : "done",
    live: undefined,
    reason: run.phase !== "refused" && payload.isError ? firstLine(payload.output) : run.reason,
    durationMs:
      run.replay || run.phase === "refused" || run.startedAt === undefined
        ? undefined
        : elapsed(run.startedAt, ts),
    outputChars: payload.spill?.bytes ?? payload.output.length,
    detail: detailLines(payload.output),
    spill: payload.spill,
  }));
  return { ...settled, running };
}

function decide(state: SessionProjection, decision: PermissionDecision): SessionProjection {
  const decisions = { ...state.decisions, [decision.callId]: decision };
  const index = state.running[decision.callId];
  if (index === undefined) return { ...state, decisions };
  const refused = decision.verdict === "denied";
  return {
    ...updateRun(state, index, (run) => ({
      ...run,
      decision,
      phase: refused ? "refused" : run.phase,
      reason: refused ? refusalReason(decision) : run.reason,
    })),
    decisions,
  };
}

function settleUsage(state: SessionProjection, usage: Usage, replay: boolean): SessionProjection {
  if (replay) return state;
  return { ...state, usage: addUsage(state.usage, usage) };
}

function addUsage(ledger: UsageLedger, usage: Usage): UsageLedger {
  return {
    inputTokens: ledger.inputTokens + usage.inputTokens,
    outputTokens: ledger.outputTokens + usage.outputTokens,
    cacheReadInputTokens: ledger.cacheReadInputTokens + (usage.cacheReadInputTokens ?? 0),
    cacheCreationInputTokens:
      ledger.cacheCreationInputTokens + (usage.cacheCreationInputTokens ?? 0),
    turns: ledger.turns + 1,
    unpricedTurns: ledger.unpricedTurns + (usage.costUsd === undefined ? 1 : 0),
    costUsd: ledger.costUsd + (usage.costUsd ?? 0),
  };
}

function notice(
  state: SessionProjection,
  level: "info" | "error",
  text: string,
): SessionProjection {
  return { ...state, entries: [...state.entries, { kind: "notice", level, text }] };
}

function newRun(
  call: ToolCallPart,
  replay: boolean,
  phase: "proposed" | "running",
  ts: string,
): ToolRun {
  return {
    callId: call.callId,
    name: call.name,
    subject: toolSubject(call.arguments),
    args: compactJson(call.arguments),
    replay,
    phase,
    startedAt: phase === "running" ? ts : undefined,
    live: undefined,
    reason: undefined,
    durationMs: undefined,
    outputChars: undefined,
    detail: undefined,
    spill: undefined,
    decision: undefined,
  };
}

function appendRun(state: SessionProjection, run: ToolRun): SessionProjection {
  const entry: ToolEntry = { kind: "tool", run };
  return {
    ...state,
    entries: [...state.entries, entry],
    running: { ...state.running, [run.callId]: state.entries.length },
  };
}

function updateRun(
  state: SessionProjection,
  index: number,
  change: (run: ToolRun) => ToolRun,
): SessionProjection {
  const entry = state.entries[index];
  if (entry?.kind !== "tool") return state;
  return {
    ...state,
    entries: replaceAt(state.entries, index, { kind: "tool", run: change(entry.run) }),
  };
}

function liveRunIndex(state: SessionProjection, callId: string | undefined): number | undefined {
  const index =
    (callId === undefined ? undefined : state.running[callId]) ??
    Object.values(state.running).at(-1);
  if (index === undefined) return undefined;
  const entry = state.entries[index];
  return entry?.kind === "tool" && !entry.run.replay && entry.run.phase === "running"
    ? index
    : undefined;
}

function refusalReason(decision: PermissionDecision): string {
  return decision.gate === "headless" ? "no one to ask" : `denied by ${decision.gate}`;
}

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  const copy = items.slice();
  copy[index] = item;
  return copy;
}

function elapsed(from: string, to: string): number {
  return Math.max(0, Date.parse(to) - Date.parse(from));
}

function lastLine(previous: string | undefined, chunk: string): string {
  const joined = (previous ?? "") + chunk;
  const lines = joined.split("\n");
  const tail = lines.at(-1) === "" ? lines.at(-2) : lines.at(-1);
  return tail ?? "";
}

function detailLines(output: string): string[] {
  const lines = output.split("\n").map((line) => line.replace(/\s+$/, ""));
  while (lines.length > 0 && lines.at(-1) === "") lines.pop();
  if (lines.length <= detailLineLimit) return lines;
  return [...lines.slice(0, detailLineLimit), `… ${lines.length - detailLineLimit} more lines`];
}

function firstLine(output: string): string {
  const line = output.split("\n", 1)[0] ?? "";
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}
