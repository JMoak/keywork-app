import type { ChildFinished, ChildStarted } from "./children.ts";
import type { CacheMiss, SendBehavior, SessionState } from "./controls.ts";
import type { CreatureChanged, PromptOrigin } from "./creatures.ts";
import type { MemoryDecision } from "./decisions.ts";
import type {
  MeshGrantChange,
  MeshListenerChange,
  MeshPairChange,
  MeshPairingChange,
  MeshPeersChange,
  MeshRevocationChange,
  MeshWalk,
} from "./mesh.ts";
import type { ModelFallback, ModelsChanged } from "./models.ts";
import type { AskScope, DenyReason, PermissionRule } from "./permissions.ts";
import type { RoutineFinished, RoutineFired, RoutineNeeds } from "./routines.ts";
import type { CompactionEntry } from "./sessions.ts";
import type { ShowProposed, ShowSettled } from "./show.ts";
import type { WorkshopChange } from "./workshops.ts";
import type { SurfaceKind } from "./workspace.ts";

export const engineEventTypes = [
  "turn.started",
  "turn.delta",
  "turn.completed",
  "turn.interrupted",
  "turn.waiting",
  "turn.resumed",
  "queue.changed",
  "tool.started",
  "tool.output",
  "tool.finished",
  "gate.ask",
  "gate.permission",
  "gate.preset",
  "session.mode",
  "context.injected",
  "memory.decided",
  "model.fallback",
  "child.started",
  "child.finished",
  "diagnostics.published",
  "shell.reset",
  "extension.notice",
  "engine.error",
] as const;

export type EngineEventType = (typeof engineEventTypes)[number];

export const serverEventTypes = [
  "memory.inbox",
  "session.state",
  "surface.changed",
  "session.tree",
  "changes.updated",
  "session.removed",
  "session.restored",
  "session.settled",
  "creature.changed",
  "routine.fired",
  "routine.finished",
  "routine.needs",
  "workshop.changed",
  "models.changed",
  "mesh.listener",
  "mesh.pairing",
  "mesh.pair",
  "mesh.grant",
  "mesh.revocation",
  "mesh.walked",
  "mesh.peers",
  "show.proposed",
  "show.settled",
] as const;

export type ServerEventType = (typeof serverEventTypes)[number];

export const ranchEventTypes = [
  "creature.changed",
  "routine.fired",
  "routine.finished",
  "workshop.changed",
  "models.changed",
  "mesh.listener",
  "mesh.pairing",
  "mesh.pair",
  "mesh.grant",
  "mesh.revocation",
  "mesh.walked",
  "mesh.peers",
] as const satisfies readonly ServerEventType[];

export type RanchEventType = (typeof ranchEventTypes)[number];

export const eventTypes = [...engineEventTypes, ...serverEventTypes] as const;

export type EventType = EngineEventType | ServerEventType;

export const processLevelSessionId = "";

export interface ServerPayloads {
  "memory.inbox": InboxTally;
  "session.state": SessionState;
  "surface.changed": { kind: SurfaceKind };
  "session.tree": TreeChange;
  "changes.updated": ChangesUpdate;
  "session.removed": SessionRemoval;
  "session.restored": SessionRemoval;
  "session.settled": SessionSettlement;
  "creature.changed": CreatureChanged;
  "routine.fired": RoutineFired;
  "routine.finished": RoutineFinished;
  "routine.needs": RoutineNeeds;
  "workshop.changed": WorkshopChange;
  "models.changed": ModelsChanged;
  "mesh.listener": MeshListenerChange;
  "mesh.pairing": MeshPairingChange;
  "mesh.pair": MeshPairChange;
  "mesh.grant": MeshGrantChange;
  "mesh.revocation": MeshRevocationChange;
  "mesh.walked": MeshWalk;
  "mesh.peers": MeshPeersChange;
  "show.proposed": ShowProposed;
  "show.settled": ShowSettled;
}

export interface InboxTally {
  count: number;
  staged: number;
  airlock: number;
  proposals: number;
  contradictions: number;
}

export type TreeChangeReason = "fork" | "label" | "leaf";

export interface TreeChange {
  reason: TreeChangeReason;
  entryId: string | null;
  forkedTo?: string;
}

export interface ChangesUpdate {
  paths: readonly string[];
  turn?: number;
}

export interface SessionRemoval {
  sessionId: string;
}

export type SettlePhase = "after-turn" | "between-tool-batches" | "requested";

export interface SessionSettlement {
  phase: SettlePhase;
  flushed: number;
  compacted: CompactionEntry | null;
  notices: readonly string[];
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
  "turn.waiting": TurnWaiting;
  "turn.resumed": TurnResumed;
  "queue.changed": { queued: QueuedPrompt[] };
  "tool.started": { call: ToolCallPart };
  "tool.output": { chunk: string; callId?: string };
  "tool.finished": { callId: string; output: string; isError: boolean; spill?: SpillReference };
  "gate.ask": { ask: PermissionAsk };
  "gate.permission": { decision: PermissionDecision };
  "gate.preset": { from: string; to: string };
  "session.mode": { mode: string };
  "context.injected": { injection: ContextInjection };
  "memory.decided": { decision: MemoryDecision };
  "model.fallback": ModelFallback;
  "child.started": ChildStarted;
  "child.finished": ChildFinished;
  "diagnostics.published": { path: string; count: number };
  "shell.reset": Record<never, never>;
  "extension.notice": ExtensionNotice;
  "engine.error": { error: { name: string; message: string } };
}

export type ExtensionNoticeLevel = "info" | "warn" | "error";

export interface ExtensionNotice {
  extension: string;
  level: ExtensionNoticeLevel;
  message: string;
  detail?: unknown;
}

export type WaitReason = "rate-limited" | "overloaded" | "unreachable";

export interface TurnWaiting {
  reason: WaitReason;
  until: string;
  attempt: number;
}

export interface TurnResumed {
  attempt: number;
}

export type TurnDelta =
  | { type: "text"; text: string }
  | { type: "visible-thinking"; text: string }
  | { type: "redacted-thinking"; part: RedactedThinkingPart }
  | { type: "tool-call"; call: ToolCallPart }
  | { type: "progress"; text: string }
  | DoneDelta;

export interface DoneDelta {
  type: "done";
  usage: Usage;
  responseId?: string;
  cacheMiss?: CacheMiss;
}

export interface RedactedThinkingPart {
  type: "redacted-thinking";
  data: string;
  owner?: { provider: string; model: string };
}

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
  | {
      type: "tool-result";
      callId: string;
      output: string;
      isError: boolean;
      spill?: SpillReference;
    };

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
  behavior: SendBehavior;
  origin?: PromptOrigin;
}

export interface SpillReference {
  id: string;
  bytes: number;
  elidedFrom: number;
  elidedTo: number;
}

export type PermissionGate = "policy" | "default" | "user" | "headless" | "trusted" | "quiet";

export interface PermissionDecision {
  tool: string;
  callId: string;
  verdict: "granted" | "denied";
  gate: PermissionGate;
  scope?: AskScope;
  asked?: boolean;
  reason?: DenyReason;
  note?: string;
}

export interface PermissionAsk {
  tool: string;
  callId: string;
  arguments: unknown;
  rule: "policy" | "default" | "trusted";
  rules?: readonly PermissionRule[];
  preview?: ToolPreview;
}

export interface ToolPreview {
  path: string;
  before: string | null;
  after: string;
}

export interface ContextInjection {
  source:
    | "memory-bootstrap"
    | "memory-recall"
    | "memory-action"
    | "skill"
    | "project-instructions"
    | "repo-map"
    | "subagent"
    | "creature";
  id?: string;
  scope?: string;
}
