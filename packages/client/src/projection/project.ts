import {
  type BusEnvelope,
  type CacheMiss,
  type ChildFinished,
  type ChildProvenance,
  type ChildStarted,
  childAnswerOf,
  childProvenanceOf,
  type DenyReason,
  delegateToolName,
  type EnginePayloads,
  type ExtensionNotice,
  type ExtensionNoticeLevel,
  type MemoryDecision,
  type Message,
  type ModelFallback,
  type PermissionAsk,
  type PermissionDecision,
  type SessionSettlement,
  type ToolCallPart,
  type TurnDelta,
  type Usage,
} from "@keywork-app/protocol";
import { withDecision } from "./decisions.ts";
import { isReviewNotice } from "./review.ts";
import { compactJson, toolSubject } from "./tool-row.ts";
import type {
  AssistantEntry,
  ChildMark,
  EndingEntry,
  NoticeEntry,
  NoticeLevel,
  SessionProjection,
  ThinkingEntry,
  ToolEntry,
  ToolRun,
  TranscriptEntry,
  TurnEnding,
  UsageLedger,
  UserEntry,
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
      return endTurn(
        settleUsage(
          noteEmptyReply(state, envelope.payload.message),
          envelope.payload.usage,
          replay,
        ),
      );
    case "turn.interrupted":
      return endTurnWith(state, "interrupted", undefined, replay);
    case "turn.waiting":
      return notice(
        state,
        "info",
        `· waiting · ${envelope.payload.reason} · attempt ${envelope.payload.attempt}`,
      );
    case "turn.resumed":
      return notice(state, "info", `· resumed · attempt ${envelope.payload.attempt}`);
    case "queue.changed":
      return { ...state, queue: envelope.payload.queued };
    case "tool.started":
      return startTool(state, envelope.payload.call, envelope.ts, replay);
    case "tool.output":
      return tailTool(state, envelope.payload.chunk, envelope.payload.callId);
    case "tool.finished":
      return settleTool(state, envelope.payload, envelope.ts);
    case "gate.ask":
      return replay ? state : askFor(state, envelope.payload.ask, envelope.ts);
    case "gate.permission":
      return decide(state, envelope.payload.decision, envelope.ts);
    case "gate.preset":
      return { ...state, preset: envelope.payload.to };
    case "session.mode":
      return { ...state, mode: envelope.payload.mode };
    case "session.state":
      return { ...state, standing: envelope.payload };
    case "context.injected":
      return { ...state, injections: [...state.injections, envelope.payload.injection] };
    case "memory.decided":
      return recordDecision(state, envelope.payload.decision);
    case "child.started":
    case "child.finished":
      return markChild(state, envelope.payload);
    case "diagnostics.published":
      return {
        ...state,
        diagnostics: { ...state.diagnostics, [envelope.payload.path]: envelope.payload.count },
      };
    case "shell.reset":
      return replay ? state : notice(state, "info", "· shell reset");
    case "session.settled":
      return replay ? state : settled(state, envelope.payload);
    case "session.tree":
    case "changes.updated":
    case "workspace.changed":
    case "memory.inbox":
    case "surface.changed":
    case "session.removed":
    case "session.restored":
    case "creature.changed":
    case "routine.fired":
    case "routine.finished":
    case "routine.needs":
    case "workshop.changed":
    case "models.changed":
    case "mesh.listener":
    case "mesh.pairing":
    case "mesh.pair":
    case "mesh.grant":
    case "mesh.revocation":
    case "mesh.walked":
    case "mesh.peers":
    case "show.proposed":
    case "show.settled":
      return state;
    case "model.fallback":
      return replay ? state : notice(state, "info", fallbackLine(envelope.payload));
    case "extension.notice":
      return (replay && !bareLine(envelope.payload)) || isFrame(envelope.payload)
        ? state
        : journaledNotice(state, envelope.payload, envelope.sessionId);
    case "engine.error":
      return failTurn(state, envelope.payload.error.message, replay);
  }
}

export const emptyReplyLine = "· the model returned nothing";

function startTurn(
  state: SessionProjection,
  payload: EnginePayloads["turn.started"],
  ts: string,
  replay: boolean,
): SessionProjection {
  const origin = payload.origin !== undefined && { origin: payload.origin };
  const settled = settleFlush(settleStream(state));
  const framed = payload.origin?.kind === "creature";
  const retold = replayedEntriesRetold(settled, payload, replay);
  const told = retold === 0 ? settled.entries : settled.entries.slice(0, -retold);
  return {
    ...settled,
    entries: framed ? told : [...told, promptEntry(state, payload, replay)],
    turn: replay ? state.turn : { startedAt: ts, userText: payload.userText, ...origin },
    usage: replay ? state.usage : withoutCacheMiss(state.usage),
  };
}

function promptEntry(
  state: SessionProjection,
  payload: EnginePayloads["turn.started"],
  replay: boolean,
): TranscriptEntry {
  const facts = payload.entryId === undefined ? undefined : state.flushes[payload.entryId];
  if (facts !== undefined) {
    return { kind: "flush", text: payload.userText, facts, replay, settled: false };
  }
  return {
    kind: "user",
    text: payload.userText,
    ...(payload.entryId !== undefined && { entryId: payload.entryId }),
    ...(payload.origin !== undefined && { origin: payload.origin }),
    replay,
  };
}

function replayedEntriesRetold(
  state: SessionProjection,
  payload: EnginePayloads["turn.started"],
  replay: boolean,
): number {
  if (replay || state.turn !== undefined) return 0;
  const tail = state.entries.at(-1);
  const ending = tail?.kind === "ending" && tail.replay ? 1 : 0;
  const prompt = state.entries.at(-1 - ending);
  if (prompt?.kind !== "user" || !prompt.replay) return 0;
  const sameEntry =
    prompt.entryId === undefined ||
    payload.entryId === undefined ||
    prompt.entryId === payload.entryId;
  return sameEntry && prompt.text === payload.userText ? 1 + ending : 0;
}

function endTurn(state: SessionProjection): SessionProjection {
  return { ...settleFlush(settleStream(state)), turn: undefined };
}

function endTurnWith(
  state: SessionProjection,
  outcome: TurnEnding,
  error: string | undefined,
  replay: boolean,
): SessionProjection {
  const ended = endTurn(state);
  return { ...ended, entries: [...ended.entries, endingOf(state, outcome, error, replay)] };
}

function failTurn(state: SessionProjection, message: string, replay: boolean): SessionProjection {
  const told = { ...state, lastError: message };
  return replay || state.turn !== undefined
    ? endTurnWith(told, "failed", message, replay)
    : notice(endTurn(told), "error", message);
}

function endingOf(
  state: SessionProjection,
  outcome: TurnEnding,
  error: string | undefined,
  replay: boolean,
): EndingEntry {
  const prompt = state.entries.findLast(isUserEntry);
  const recorded = prompt?.entryId === undefined ? undefined : state.outcomes[prompt.entryId];
  const ended = recorded?.outcome === "shutdown" ? "shutdown" : outcome;
  return {
    kind: "ending",
    outcome: ended,
    text:
      ended === "failed" ? (recorded?.error ?? error ?? endingLines.failed) : endingLines[ended],
    prompt: resendablePrompt(state, prompt),
    replay,
  };
}

export const endingLines: Readonly<Record<TurnEnding, string>> = {
  interrupted: "interrupted",
  failed: "the turn failed",
  shutdown: "the server stopped while this turn ran",
};

function resendablePrompt(
  state: SessionProjection,
  prompt: UserEntry | undefined,
): string | undefined {
  const asked = state.turn ?? prompt;
  if (asked === undefined || asked.origin?.kind === "creature") return undefined;
  return "userText" in asked ? asked.userText : asked.text;
}

function isUserEntry(entry: TranscriptEntry): entry is UserEntry {
  return entry.kind === "user";
}

function noteEmptyReply(state: SessionProjection, message: Message): SessionProjection {
  const said = message.parts.some(
    (part) => (part.type === "text" && part.text.trim() !== "") || part.type === "tool-call",
  );
  return said || state.entries.at(-1)?.kind !== "user"
    ? state
    : notice(state, "info", emptyReplyLine);
}

function settleFlush(state: SessionProjection): SessionProjection {
  const index = openFlushIndex(state);
  const flush = index === undefined ? undefined : state.entries[index];
  if (index === undefined || flush?.kind !== "flush") return state;
  return { ...state, entries: replaceAt(state.entries, index, { ...flush, settled: true }) };
}

function openFlushIndex(state: SessionProjection): number | undefined {
  const last = state.entries.at(-1);
  return last?.kind === "flush" && !last.settled ? state.entries.length - 1 : undefined;
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
    case "redacted-thinking":
      return sealThinking(state);
    case "tool-call":
      return proposeTool(state, delta.call, ts, replay);
    case "progress":
      return notice(settleStream(state), "progress", delta.text);
    case "done":
      return noteCacheMiss(state, delta.cacheMiss);
  }
}

function streamText(state: SessionProjection, text: string, replay: boolean): SessionProjection {
  if (openFlushIndex(state) !== undefined) return state;
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
  if (openFlushIndex(state) !== undefined) return state;
  const last = state.entries.at(-1);
  const index = state.entries.length - 1;
  if (last?.kind === "thinking" && last.sealed !== true && state.streaming === undefined) {
    return {
      ...state,
      entries: replaceAt(state.entries, index, { ...last, text: last.text + text }),
    };
  }
  const entry: ThinkingEntry = { kind: "thinking", text, replay };
  const settled = settleStream(state);
  return { ...settled, entries: [...settled.entries, entry] };
}

function sealThinking(state: SessionProjection): SessionProjection {
  const last = state.entries.at(-1);
  if (last?.kind === "thinking" && last.sealed !== true) {
    const sealed: ThinkingEntry = { ...last, sealed: true };
    return { ...state, entries: replaceAt(state.entries, state.entries.length - 1, sealed) };
  }
  if (last?.kind === "notice" && last.level === "progress") return state;
  return notice(settleStream(state), "info", sealedThinkingLine);
}

const sealedThinkingLine = "· thinking the provider kept sealed";

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
  return updateRun(state, index, (run) => streamedInto(run, chunk));
}

function settleTool(
  state: SessionProjection,
  payload: EnginePayloads["tool.finished"],
  ts: string,
): SessionProjection {
  const index = state.running[payload.callId];
  if (index === undefined) return state;
  const { [payload.callId]: _, ...running } = state.running;
  const settled = updateRun(state, index, (run) => settledRun(run, payload, ts));
  return { ...settled, running };
}

function settledRun(run: ToolRun, payload: EnginePayloads["tool.finished"], ts: string): ToolRun {
  const provenance = run.child === undefined ? undefined : childProvenanceOf(payload.output);
  const stopped = run.phase !== "refused" && payload.isError && isStop(payload.output);
  const answer = provenance === undefined ? payload.output : childAnswerOf(payload.output);
  const shown = stopped ? (run.streamed ?? "") : answer;
  const unexplained =
    run.phase !== "refused" && payload.isError && !stopped && provenance === undefined;
  const { streamed: _, ...settling } = run;
  const exitNote = payload.isError ? undefined : exitNoteOf(run.name, payload);
  return {
    ...settling,
    phase: run.phase === "refused" ? "refused" : payload.isError ? "failed" : "done",
    ...(stopped && { stopped }),
    ...(exitNote !== undefined && { exitNote }),
    live: undefined,
    reason: unexplained ? plainFailure(firstLine(payload.output), run.subject) : run.reason,
    durationMs:
      run.replay || run.phase === "refused" || run.startedAt === undefined
        ? undefined
        : Math.max(0, elapsed(run.startedAt, ts) - (run.waitedMs ?? 0)),
    outputChars: payload.spill?.bytes ?? payload.output.length,
    detail: detailLines(shown),
    spill: payload.spill,
    child: childSettledBy(run.child, provenance),
  };
}

function streamedInto(run: ToolRun, chunk: string): ToolRun {
  const joined = (run.streamed ?? "") + chunk;
  const streamed = joined.length > streamedLimit ? joined.slice(-streamedLimit) : joined;
  return { ...run, streamed, live: lastLineOf(streamed) };
}

const streamedLimit = 64_000;

function isStop(output: string): boolean {
  return firstLine(output) === abortedCommand;
}

const abortedCommand = "Command aborted";

function exitNoteOf(
  tool: string,
  { output, exitCode }: EnginePayloads["tool.finished"],
): string | undefined {
  if (exitCode !== undefined) return exitCode === 0 ? undefined : `exit ${exitCode}`;
  const diedWithItsShell = tool === "bash" && lastLineOf(output).startsWith(shellExitedTrailer);
  return diedWithItsShell ? "shell exited" : undefined;
}

const shellExitedTrailer = "(shell exited;";

function plainFailure(line: string, subject: string): string {
  const named = subject === "" ? "that path" : subject;
  const plain = systemErrors.find(([code]) => line.startsWith(`${code}:`));
  return plain === undefined ? line : plain[1](named);
}

const systemErrors: readonly (readonly [string, (named: string) => string])[] = [
  ["ENOENT", (named) => `${named} not found`],
  ["EACCES", (named) => `no permission to open ${named}`],
  ["EPERM", (named) => `the system refused ${named}`],
  ["EISDIR", (named) => `${named} is a folder, not a file`],
  ["ENOTDIR", (named) => `part of ${named} is not a folder`],
];

function markChild(
  state: SessionProjection,
  news: ChildStarted | ChildFinished,
): SessionProjection {
  const index = state.running[news.callId];
  if (index === undefined) return state;
  const { callId: _, ...told } = news;
  return updateRun(state, index, (run) =>
    run.child === undefined ? run : { ...run, child: { ...run.child, ...told } },
  );
}

function recordDecision(state: SessionProjection, decision: MemoryDecision): SessionProjection {
  const recorded = { ...state, memoryDecisions: withDecision(state.memoryDecisions, decision) };
  if (decision.about.kind !== "call") return recorded;
  const index = runIndexOf(recorded, decision.about.callId);
  if (index === undefined) return recorded;
  return updateRun(recorded, index, (run) => ({ ...run, recall: decision }));
}

function runIndexOf(state: SessionProjection, callId: string): number | undefined {
  const running = state.running[callId];
  if (running !== undefined) return running;
  const settled = state.entries.findLastIndex(
    (entry) => entry.kind === "tool" && entry.run.callId === callId,
  );
  return settled === -1 ? undefined : settled;
}

function childSettledBy(
  child: ChildMark | undefined,
  provenance: ChildProvenance | undefined,
): ChildMark | undefined {
  if (child === undefined || provenance === undefined) return child;
  return {
    ...child,
    outcome: provenance.outcome,
    sessionId: provenance.sessionId ?? child.sessionId,
    bot: provenance.bot ?? child.bot,
  };
}

function askFor(state: SessionProjection, ask: PermissionAsk, ts: string): SessionProjection {
  const index = state.running[ask.callId];
  if (index !== undefined) {
    return updateRun(state, index, (run) => ({ ...run, phase: "asking", ask, askedAt: ts }));
  }
  const call: ToolCallPart = {
    type: "tool-call",
    callId: ask.callId,
    name: ask.tool,
    arguments: argumentsOf(ask.arguments),
  };
  return appendRun(settleStream(state), {
    ...newRun(call, false, "proposed", ts),
    phase: "asking",
    ask,
    askedAt: ts,
  });
}

function decide(
  state: SessionProjection,
  decision: PermissionDecision,
  ts: string,
): SessionProjection {
  const decisions = { ...state.decisions, [decision.callId]: decision };
  const index = state.running[decision.callId];
  if (index === undefined) return { ...state, decisions };
  const refused = decision.verdict === "denied";
  return {
    ...updateRun(state, index, (run) => ({
      ...run,
      decision,
      ask: undefined,
      ...answeredAt(run, ts),
      phase: refused ? "refused" : run.phase === "asking" ? "running" : run.phase,
      reason: refused ? refusalReason(decision) : run.reason,
    })),
    decisions,
  };
}

function answeredAt(run: ToolRun, ts: string): Pick<ToolRun, "askedAt" | "waitedMs"> {
  if (run.askedAt === undefined) return { askedAt: undefined, waitedMs: run.waitedMs };
  return { askedAt: undefined, waitedMs: (run.waitedMs ?? 0) + elapsed(run.askedAt, ts) };
}

function argumentsOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function settleUsage(state: SessionProjection, usage: Usage, replay: boolean): SessionProjection {
  if (replay) return state;
  return { ...state, usage: addUsage(state.usage, usage) };
}

function noteCacheMiss(state: SessionProjection, miss: CacheMiss | undefined): SessionProjection {
  return miss === undefined ? state : { ...state, usage: { ...state.usage, cacheMiss: miss } };
}

function withoutCacheMiss(ledger: UsageLedger): UsageLedger {
  if (ledger.cacheMiss === undefined) return ledger;
  const { cacheMiss: _, ...rest } = ledger;
  return rest;
}

function addUsage(ledger: UsageLedger, usage: Usage): UsageLedger {
  return {
    ...ledger,
    inputTokens: ledger.inputTokens + usage.inputTokens,
    outputTokens: ledger.outputTokens + usage.outputTokens,
    cacheReadInputTokens: ledger.cacheReadInputTokens + (usage.cacheReadInputTokens ?? 0),
    cacheCreationInputTokens:
      ledger.cacheCreationInputTokens + (usage.cacheCreationInputTokens ?? 0),
    lastTurnContextTokens:
      usage.inputTokens + (usage.cacheReadInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0),
    turns: ledger.turns + 1,
    unpricedTurns: ledger.unpricedTurns + (usage.costUsd === undefined ? 1 : 0),
    costUsd: ledger.costUsd + (usage.costUsd ?? 0),
  };
}

function settled(state: SessionProjection, settlement: SessionSettlement): SessionProjection {
  if (settlement.phase === "requested") return state;
  return settlement.notices.reduce((current, text) => notice(current, "info", text), state);
}

function isCreatureReport(payload: ExtensionNotice): boolean {
  return payload.extension === "creature";
}

function isFrame(payload: ExtensionNotice): boolean {
  const detail = payload.detail as { kind?: unknown } | null | undefined;
  return isCreatureReport(payload) && detail?.kind === "frame";
}

function bareLine(payload: ExtensionNotice): boolean {
  return isCreatureReport(payload) || isReviewNotice(payload);
}

export const crateDeliveredLine = "delivered · the crate is on the porch";

function journaledNotice(
  state: SessionProjection,
  payload: ExtensionNotice,
  sessionId: string,
): SessionProjection {
  const entryId = journalEntryOf(payload);
  if (entryId !== undefined && drawsNotice(state, entryId)) return state;
  const text = noticeLine(payload, sessionId);
  const entry: NoticeEntry = {
    kind: "notice",
    level: "info",
    text,
    ...(entryId !== undefined && { entryId }),
  };
  return { ...state, entries: [...state.entries, entry] };
}

function journalEntryOf(payload: ExtensionNotice): string | undefined {
  const detail = payload.detail as { entryId?: unknown } | null | undefined;
  return typeof detail?.entryId === "string" ? detail.entryId : undefined;
}

function drawsNotice(state: SessionProjection, entryId: string): boolean {
  return state.entries.some((entry) => entry.kind === "notice" && entry.entryId === entryId);
}

function noticeLine(payload: ExtensionNotice, sessionId: string): string {
  return labelsOwnTurn(payload, sessionId) ? crateDeliveredLine : extensionLine(payload);
}

function labelsOwnTurn(payload: ExtensionNotice, sessionId: string): boolean {
  if (!isCreatureReport(payload)) return false;
  const detail = payload.detail as
    | { kind?: unknown; origin?: { kind?: unknown; thread?: unknown } | undefined }
    | undefined;
  return (
    detail?.kind !== "frame" &&
    detail?.origin?.kind === "creature" &&
    detail.origin.thread === sessionId
  );
}

function extensionLine(payload: ExtensionNotice): string {
  if (bareLine(payload)) return payload.message;
  const detail = detailText(payload.detail);
  const said = `${extensionMarks[payload.level]} ${payload.extension} · ${payload.message}`;
  return detail === undefined ? said : `${said} · ${detail}`;
}

function detailText(detail: unknown): string | undefined {
  if (detail === undefined || detail === null) return undefined;
  const text = isFlatRecord(detail) ? fieldsText(detail) : scalarOrJson(detail);
  return text === "" ? undefined : clipped(text, detailLimit);
}

function fallbackLine(payload: ModelFallback): string {
  const road = payload.cloud ? "out to the market road" : "to the next mill";
  return `· ${payload.from} ${payload.trigger} · ${payload.class} fell back ${road} on ${payload.to}`;
}

function fieldsText(record: Readonly<Record<string, Scalar>>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key} ${String(value)}`)
    .join(" · ");
}

function scalarOrJson(value: unknown): string {
  return isScalar(value) ? String(value) : (JSON.stringify(value) ?? "");
}

type Scalar = string | number | boolean | null;

function isFlatRecord(value: unknown): value is Readonly<Record<string, Scalar>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isScalar)
  );
}

function isScalar(value: unknown): value is Scalar {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function clipped(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

const detailLimit = 80;

const extensionMarks: Readonly<Record<ExtensionNoticeLevel, string>> = {
  info: "░",
  warn: "▒",
  error: "█",
};

function notice(state: SessionProjection, level: NoticeLevel, text: string): SessionProjection {
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
    askedAt: undefined,
    waitedMs: undefined,
    outputChars: undefined,
    detail: undefined,
    spill: undefined,
    decision: undefined,
    ask: undefined,
    child: call.name === delegateToolName ? childMarkOf(call.arguments) : undefined,
    recall: undefined,
  };
}

function childMarkOf(args: Record<string, unknown>): ChildMark {
  const named = typeof args.title === "string" ? flatTitle(args.title) : "";
  return {
    title: named === "" ? "child" : named,
    sessionId: undefined,
    bot: typeof args.bot === "string" ? args.bot : undefined,
    outcome: undefined,
    usage: undefined,
    costNanos: undefined,
    refused: undefined,
  };
}

function flatTitle(raw: string): string {
  const flat = raw.replace(/[\s\p{Cc}]+/gu, " ").trim();
  return flat.length > titleLimit ? `${flat.slice(0, titleLimit - 1)}…` : flat;
}

const titleLimit = 60;

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
  switch (decision.gate) {
    case "headless":
      return "no one answered";
    case "user":
      return withNote(personalRefusals[decision.reason ?? "other"], decision.note);
    default:
      return `denied by ${decision.gate}`;
  }
}

function withNote(refusal: string, note: string | undefined): string {
  const said = note === undefined ? "" : clipped(note, noteLimit);
  return said === "" ? refusal : `${refusal}: ${said}`;
}

const noteLimit = 60;

const personalRefusals: Readonly<Record<DenyReason, string>> = {
  unsafe: "you called it unsafe",
  "not-now": "you said not now",
  other: "you said no",
};

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  const copy = items.slice();
  copy[index] = item;
  return copy;
}

function elapsed(from: string, to: string): number {
  return Math.max(0, Date.parse(to) - Date.parse(from));
}

function lastLineOf(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trimEnd())
      .findLast((line) => line !== "") ?? ""
  );
}

function detailLines(output: string): string[] {
  const lines = output.split("\n").map((line) => line.replace(/\s+$/, ""));
  while (lines.length > 0 && lines.at(-1) === "") lines.pop();
  return lines;
}

function firstLine(output: string): string {
  const line = output.split("\n", 1)[0] ?? "";
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}
