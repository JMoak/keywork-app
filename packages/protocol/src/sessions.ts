import type { Message, MessagePart, Usage } from "./events.ts";

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  costNanos?: number;
  arc?: string;
  bot?: string;
}

export interface SessionDetail extends SessionSummary {
  cwd: string;
  live: boolean;
  asOf: number;
  messages: readonly Message[];
}

export type PromptOutcome = "accepted" | "missing";

export interface PromptInjection {
  text: string;
  client: string;
}

export const injectingClientName = /^[A-Za-z0-9._-]{1,64}$/;

export type InjectOutcome = "started" | "queued" | "missing";

export type AbortOutcome = "aborted" | "idle" | "missing";

export interface PendingAsk {
  sessionId: string;
  callId: string;
  tool: string;
  arguments: unknown;
  askedAt: string;
}

export type AskVerdict = "granted" | "denied";

export type AnswerOutcome = "settled" | "missing" | "already-settled";

export interface SessionEntries {
  sessionId: string;
  name?: string;
  leafId: string | null;
  entries: readonly SessionEntry[];
  labels: Readonly<Record<string, string>>;
  activePath: readonly string[];
}

export interface EntryBase {
  id: string;
  parentId: string | null;
  timestamp: string;
}

export interface MessageEntry extends EntryBase {
  type: "message";
  message: Message;
  usage?: Usage;
  checkpoint?: string;
}

export interface CompactionEntry extends EntryBase {
  type: "compaction";
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  usage?: Usage;
}

export interface BranchSummaryEntry extends EntryBase {
  type: "branch_summary";
  fromId: string;
  summary: string;
  usage?: Usage;
}

export interface LabelEntry extends EntryBase {
  type: "label";
  targetId: string;
  label: string | undefined;
}

export interface SessionInfoEntry extends EntryBase {
  type: "session_info";
  name?: string;
}

export interface CustomEntry extends EntryBase {
  type: "custom";
  customType: string;
  data?: unknown;
}

export interface CustomMessageEntry extends EntryBase {
  type: "custom_message";
  customType: string;
  content: string;
  display: boolean;
}

export interface ThinkingLevelChangeEntry extends EntryBase {
  type: "thinking_level_change";
  thinkingLevel: string;
}

export interface EffortChangeEntry extends EntryBase {
  type: "effort_change";
  effort: string;
}

export interface ModelChangeEntry extends EntryBase {
  type: "model_change";
  provider: string;
  modelId: string;
}

export interface ContextEditEntry extends EntryBase {
  type: "context_edit";
  targetId: string;
  replacement: string | readonly MessagePart[] | null;
}

export interface BindingEntry extends EntryBase {
  type: "binding";
  arc?: string | null;
  bot?: string | null;
}

export type SessionEntry =
  | MessageEntry
  | CompactionEntry
  | BranchSummaryEntry
  | LabelEntry
  | SessionInfoEntry
  | CustomEntry
  | CustomMessageEntry
  | ThinkingLevelChangeEntry
  | EffortChangeEntry
  | ModelChangeEntry
  | ContextEditEntry
  | BindingEntry;

export type ForkOutcome = SessionSummary | "missing" | "unknown-entry";

export type LabelOutcome = "labelled" | "missing" | "unknown-entry";

export type LeafOutcome = { leafId: string | null } | "missing" | "unknown-entry" | "busy";

export interface ChangedPath {
  path: string;
  added: number;
  deleted: number;
  turn?: number;
}

export interface SessionChanges {
  baseline: string;
  files: readonly ChangedPath[];
}

export type ChangedFileNote = "binary" | "new" | "deleted" | "unreadable";

export interface ChangedFile {
  path: string;
  before: string | null;
  after: string | null;
  note?: ChangedFileNote;
  truncated: boolean;
}

export type ChangesReading =
  | ({ trusted: true } & SessionChanges)
  | { trusted: false; files: readonly [] }
  | "missing"
  | "no-baseline";

export type ChangedFileReading =
  | ({ trusted: true } & ChangedFile)
  | { trusted: false; path: string; before: null; after: null; truncated: false }
  | "missing"
  | "no-baseline";
