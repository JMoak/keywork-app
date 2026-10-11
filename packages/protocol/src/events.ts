import type { SessionState } from "./controls.ts";
import type { SurfaceKind } from "./workspace.ts";

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
  "session.tree",
  "changes.updated",
  "engine.error",
  "extension.notice",
] as const;

export type EngineEventType = (typeof engineEventTypes)[number];

export const serverEventTypes = ["memory.inbox", "surface.changed", "session.state"] as const;

export type ServerEventType = (typeof serverEventTypes)[number];

export const eventTypes = [...engineEventTypes, ...serverEventTypes] as const;

export type EventType = EngineEventType | ServerEventType;

export const processLevelSessionId = "";

export interface ServerPayloads {
  "memory.inbox": { count: number; kinds: Record<string, number> };
  "surface.changed": { kind: SurfaceKind };
  "session.state": SessionState;
}

export type EventPayloads = EnginePayloads & ServerPayloads;

export type BusEnvelope<T extends EventType = EventType> = {
  [K in T]: {
    id: number;
    ts: string;
    sessionId: string;
    type: K;
    payload: EventPayloads[K] & Replayable;
  };
}[T];

export function isServerEvent(envelope: BusEnvelope): envelope is BusEnvelope<ServerEventType> {
  return (serverEventTypes as readonly string[]).includes(envelope.type);
}

export interface Replayable {
  replay?: boolean;
}

export interface EnginePayloads {
  "turn.started": { userText: string; entryId?: string; origin?: PromptOrigin };
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
  "session.tree": TreeChange;
  "changes.updated": { sessionId: string; paths: readonly string[] };
  "engine.error": { error: { name: string; message: string } };
  "extension.notice": ExtensionNotice;
}

export type ExtensionNoticeLevel = "info" | "warn" | "error";

export interface ExtensionNotice {
  extension: string;
  level: ExtensionNoticeLevel;
  message: string;
  detail?: unknown;
}

export type TreeChangeReason = "fork" | "label" | "leaf" | "entry";

export interface TreeChange {
  sessionId: string;
  leafId: string | null;
  reason: TreeChangeReason;
  entryId?: string;
  forkedTo?: string;
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

export interface PromptOrigin {
  kind: "external";
  client: string;
}

export interface QueuedPrompt {
  id: string;
  text: string;
  behavior: "steer" | "queue";
  origin?: PromptOrigin;
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
