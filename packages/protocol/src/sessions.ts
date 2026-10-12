import type { EffortLevel } from "./controls.ts";
import type { Message, MessagePart, Usage } from "./events.ts";
import type { AskRefusal, PermissionRule } from "./permissions.ts";

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  model?: string;
  thinking?: boolean;
  effort?: EffortLevel;
  costNanos?: number;
  arc?: string;
  bot?: string;
}

export interface SessionDetail extends SessionSummary {
  cwd: string;
  live: boolean;
  asOf: number;
  messages: readonly Message[];
  parentSession?: string;
  forkedFrom?: ForkOrigin;
}

export interface ForkOrigin {
  sessionId?: string;
  removed: boolean;
}

export type PromptOutcome = "started" | "queued" | "missing";

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
  rules?: readonly PermissionRule[];
}

export type AskVerdict = "granted" | "denied";

export type AnswerOutcome = "settled" | "missing" | "already-settled" | AskRefusal;

export interface SessionEntries {
  sessionId: string;
  name?: string;
  leafId: string | null;
  entries: readonly SessionEntry[];
  labels: Readonly<Record<string, string>>;
  activePath: readonly string[];
}

export interface FileTrackingDetails {
  readFiles: string[];
  modifiedFiles: string[];
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
  details?: FileTrackingDetails;
  usage?: Usage;
}

export interface BranchSummaryEntry extends EntryBase {
  type: "branch_summary";
  fromId: string;
  summary: string;
  details?: FileTrackingDetails;
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
  pinned?: boolean;
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

export type EntryRefusal = "missing" | "unknown-entry";

export interface ForkedSession {
  sessionId: string;
}

export type ForkOutcome = ForkedSession | EntryRefusal;

export interface EntryLabel {
  entryId: string;
  label: string | null;
}

export type LabelOutcome = EntryLabel | EntryRefusal;

export type LeafOutcome = { leafId: string | null } | EntryRefusal | "busy";

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

export type ChangesReading = SessionChanges | "missing" | "no-baseline";

export type ChangedFileReading = ChangedFile | "missing" | "no-baseline" | "outside-scope";
