export const engineEventTypes = [
  "turn.started",
  "turn.delta",
  "turn.completed",
  "turn.interrupted",
  "queue.changed",
  "tool.started",
  "tool.output",
  "tool.finished",
  "gate.ask",
  "gate.permission",
  "gate.preset",
  "session.mode",
  "context.injected",
  "diagnostics.published",
  "shell.reset",
  "engine.error",
] as const;

export type EngineEventType = (typeof engineEventTypes)[number];

export type BusEnvelope<T extends EngineEventType = EngineEventType> = {
  [K in T]: {
    id: number;
    ts: string;
    sessionId: string;
    type: K;
    payload: EnginePayloads[K] & Replayable;
  };
}[T];

export interface Replayable {
  replay?: boolean;
}

export interface EnginePayloads {
  "turn.started": { userText: string; entryId?: string };
  "turn.delta": { delta: TurnDelta };
  "turn.completed": { message: Message; usage: Usage };
  "turn.interrupted": { message: Message };
  "queue.changed": { queued: QueuedPrompt[] };
  "tool.started": { call: ToolCallPart };
  "tool.output": { chunk: string; callId?: string };
  "tool.finished": { callId: string; output: string; isError: boolean; spill?: SpillReference };
  "gate.ask": { ask: PermissionAsk };
  "gate.permission": { decision: PermissionDecision };
  "gate.preset": { from: string; to: string };
  "session.mode": { mode: string };
  "context.injected": { injection: ContextInjection };
  "diagnostics.published": { path: string; count: number };
  "shell.reset": Record<never, never>;
  "engine.error": { error: { name: string; message: string } };
}

export type TurnDelta =
  | { type: "text"; text: string }
  | { type: "visible-thinking"; text: string }
  | { type: "redacted-thinking"; part: unknown }
  | { type: "tool-call"; call: ToolCallPart }
  | { type: "done"; usage: Usage };

export interface ToolCallPart {
  type: "tool-call";
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  role: "user" | "assistant" | "tool";
  parts: readonly MessagePart[];
}

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "visible-thinking"; text: string }
  | { type: "redacted-thinking"; [key: string]: unknown }
  | { type: "tool-call"; callId: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool-result"; callId: string; output: string; isError: boolean };

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  costUsd?: number;
}

export interface QueuedPrompt {
  id: string;
  text: string;
  behavior: "steer" | "queue";
}

export interface SpillReference {
  id: string;
  bytes: number;
  elidedFrom: number;
  elidedTo: number;
}

export type PermissionGate = "policy" | "default" | "user" | "headless";

export interface PermissionDecision {
  tool: string;
  callId: string;
  verdict: "granted" | "denied";
  gate: PermissionGate;
}

export interface PermissionAsk {
  tool: string;
  callId: string;
  arguments: unknown;
  rule: "policy" | "default";
}

export interface ContextInjection {
  source:
    | "memory-bootstrap"
    | "memory-recall"
    | "memory-action"
    | "skill"
    | "project-instructions"
    | "repo-map"
    | "subagent";
  id?: string;
  scope?: string;
}
