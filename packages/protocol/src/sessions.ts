import type { EffortLevel } from "./controls.ts";
import type { PromptOrigin } from "./creatures.ts";
import type {
  Message,
  MessagePart,
  QueuedPrompt,
  SpillReference,
  ToolPreview,
  Usage,
} from "./events.ts";
import type { AskRefusal, PermissionRule } from "./permissions.ts";
import type { FileSlice } from "./workspace.ts";

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

export interface SessionRow extends SessionSummary {
  live?: boolean;
  working?: boolean;
  waiting?: WaitingAsks;
  changes?: ChangesSummary;
}

export interface WaitingAsks {
  asks: number;
  tools: readonly string[];
}

export interface ChangesSummary {
  files: number;
  added: number;
  deleted: number;
}

export interface SessionDetail extends SessionSummary {
  cwd: string;
  live: boolean;
  asOf: number;
  messages: readonly Message[];
  summaries?: readonly SummaryMark[];
  flushes?: readonly FlushMark[];
  edits?: readonly ContextEditMark[];
  reports?: readonly ReportMark[];
  verdicts?: readonly VerdictMark[];
  outcomes?: readonly OutcomeMark[];
  parentSession?: string;
  forkedFrom?: ForkOrigin;
}

export const turnOutcomes = ["completed", "interrupted", "failed", "shutdown"] as const;

export type TurnOutcome = (typeof turnOutcomes)[number];

export interface OutcomeMark {
  index: number;
  entryId: string;
  outcome: TurnOutcome;
  error?: string;
}

export type SummaryKind = "compaction" | "branch_summary";

export interface SummaryMark {
  index: number;
  entryId: string;
  kind: SummaryKind;
}

export interface FlushMark {
  index: number;
  entryId: string;
  facts: readonly string[];
}

export type ContextEditKind = "forgotten" | "rewritten";

export interface ContextEditMark {
  index: number;
  entryId: string;
  role: Message["role"];
  kind: ContextEditKind;
  text: string;
}

export interface ReportMark {
  index: number;
  entryId: string;
  at: string;
  text: string;
  origin: PromptOrigin;
  kind?: "frame";
}

export interface ForkOrigin {
  sessionId?: string;
  removed: boolean;
}

export type PromptOutcome = "started" | "queued" | "missing";

export type SetAsideReading = readonly QueuedPrompt[] | "missing";

export interface QueueReport {
  queued: readonly QueuedPrompt[];
}

export type QueueRefusal = "missing" | "unknown-item" | "out-of-range" | "crosses-steer";

export type QueueMoveReading = QueueReport | QueueRefusal;

export type QueueCancelReading = QueueReport | Extract<QueueRefusal, "missing" | "unknown-item">;

export interface SpillSlice extends Omit<FileSlice, "path"> {
  spill: SpillReference;
}

export type SpillReading = SpillSlice | "missing" | "gone" | "binary";

export interface PromptInjection {
  text: string;
  client: string;
  frame?: { creature: string };
}

export const promptInjectionBody = ["text", "client", "frame"] as const;

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
  preview?: ToolPreview;
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
  journal?: readonly string[];
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

export const turnFactsEntryType = "turn_facts";

export interface TurnFacts {
  prompt: string;
  checkpoint?: string;
  settled?: string;
  files: readonly ChangedPath[];
  session?: ChangesSummary;
  outcome?: TurnOutcome;
  error?: string;
}

export const restoreEntryTypes = { restore: "restore", undone: "restore-undone" } as const;

export interface RestoreFacts {
  turn?: number;
  from: string | null;
  files: string | null;
  redo: string | null;
  paths?: readonly string[];
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

export const hunkVerdicts = ["keep", "drop", "ask"] as const;

export type HunkVerdict = (typeof hunkVerdicts)[number];

export interface HunkReference {
  path: string;
  header: string;
  digest: string;
}

export interface ReviewVerdict extends HunkReference {
  verdict: HunkVerdict;
}

export interface VerdictMark extends ReviewVerdict {
  index: number;
  entryId: string;
  at: string;
}

export interface HunkVerdicts {
  verdicts: readonly VerdictMark[];
}

export type VerdictsReading = HunkVerdicts | "missing";

export type VerdictRecording = VerdictMark | "missing" | "unwired";

export const hunkVerdictBody = ["path", "header", "digest", "verdict"] as const;

export const reviewExtension = "review";
