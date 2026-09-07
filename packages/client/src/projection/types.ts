import type {
  ContextInjection,
  PermissionDecision,
  QueuedPrompt,
  SpillReference,
} from "@keywork-app/protocol";

export interface SessionProjection {
  readonly entries: readonly TranscriptEntry[];
  readonly running: Readonly<Record<string, number>>;
  readonly streaming: number | undefined;
  readonly turn: LiveTurn | undefined;
  readonly queue: readonly QueuedPrompt[];
  readonly decisions: Readonly<Record<string, PermissionDecision>>;
  readonly preset: string | undefined;
  readonly mode: string | undefined;
  readonly usage: UsageLedger;
  readonly injections: readonly ContextInjection[];
  readonly diagnostics: Readonly<Record<string, number>>;
  readonly lastError: string | undefined;
  readonly lastEventId: number | undefined;
}

export interface LiveTurn {
  readonly startedAt: string;
  readonly userText: string;
}

export interface UsageLedger {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly turns: number;
  readonly unpricedTurns: number;
  readonly costUsd: number;
}

export type TranscriptEntry = UserEntry | AssistantEntry | ThinkingEntry | ToolEntry | NoticeEntry;

export interface UserEntry {
  readonly kind: "user";
  readonly text: string;
  readonly entryId?: string;
  readonly replay: boolean;
}

export interface AssistantEntry {
  readonly kind: "assistant";
  readonly text: string;
  readonly replay: boolean;
  readonly settled: boolean;
}

export interface ThinkingEntry {
  readonly kind: "thinking";
  readonly text: string;
  readonly replay: boolean;
}

export interface ToolEntry {
  readonly kind: "tool";
  readonly run: ToolRun;
}

export interface NoticeEntry {
  readonly kind: "notice";
  readonly level: "info" | "error";
  readonly text: string;
}

export type ToolPhase = "proposed" | "running" | "done" | "failed" | "refused";

export interface ToolRun {
  readonly callId: string;
  readonly name: string;
  readonly subject: string;
  readonly args: string;
  readonly replay: boolean;
  readonly phase: ToolPhase;
  readonly startedAt: string | undefined;
  readonly live: string | undefined;
  readonly reason: string | undefined;
  readonly durationMs: number | undefined;
  readonly outputChars: number | undefined;
  readonly detail: readonly string[] | undefined;
  readonly spill: SpillReference | undefined;
  readonly decision: PermissionDecision | undefined;
}

export const emptyUsage: UsageLedger = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  turns: 0,
  unpricedTurns: 0,
  costUsd: 0,
};

export const emptyProjection: SessionProjection = {
  entries: [],
  running: {},
  streaming: undefined,
  turn: undefined,
  queue: [],
  decisions: {},
  preset: undefined,
  mode: undefined,
  usage: emptyUsage,
  injections: [],
  diagnostics: {},
  lastError: undefined,
  lastEventId: undefined,
};
