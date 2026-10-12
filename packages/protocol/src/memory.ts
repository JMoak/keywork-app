export type Provenance = "user" | "agent" | "untrusted";

export type CuringStage = 0 | 1 | 2 | 3;

export type MemoryLayerKind = "workspace" | "arc" | "user";

export interface MemoryLayer {
  id: string;
  kind: MemoryLayerKind;
  label: string;
  arc?: string;
  prompt?: { budget: number; used: number };
}

export interface Note {
  name: string;
  path: string;
  title: string;
  provenance: Provenance;
  pinned: boolean;
  aliases: string[];
  body: string;
  links: string[];
  tokens: number;
  frontmatter: Record<string, unknown>;
  created?: string;
  confidence?: number;
  usefulness?: number;
  supersedes?: string;
  supersededBy?: string;
  delivered?: string;
  distilledFrom?: string;
  learnedBy?: string;
}

export interface NoteRelation {
  name: string;
  predicate: string;
  direction: "out" | "in";
}

export interface MemoryNote extends Note {
  layer: string;
  file: string;
  injected: boolean;
  recalls: number;
  curing: CuringStage;
}

export interface MemoryNoteDetail extends MemoryNote {
  relations: readonly NoteRelation[];
}

export type StagedWriteKind = "note" | "daily" | "moc";

export interface StagedWrite {
  id: string;
  kind: StagedWriteKind;
  target: string;
  created: string;
  supersedes?: string;
  content: string;
}

export type StagedReview = { id: string; key: string; created: string } & ReviewProposal;

export type ReviewProposal =
  | {
      kind: "borderline-promotion";
      title: string;
      body: string;
      confidence: number;
      source: string;
    }
  | {
      kind: "contradiction";
      a: string;
      b: string;
      aProvenance: Provenance;
      bProvenance: Provenance;
      confidence: number;
    }
  | { kind: "merge-proposal"; keep: string; retire: string; confidence: number }
  | { kind: "supersession-proposal"; winner: string; loser: string; confidence: number }
  | { kind: "link-proposal"; note: string; target: string; mention: string }
  | { kind: "arc-distillation"; arc: string; note: string; eligible: boolean }
  | { kind: "arc-question"; arc: string; note: string }
  | { kind: "preference-proposal"; toolShape: string; approvals: number }
  | {
      kind: "skill-proposal";
      name: string;
      fingerprint: string;
      commands: string;
      occurrences: number;
    }
  | {
      kind: "skill-review";
      skill: string;
      reason: "unused" | "churning";
      uses: number;
      patches: number;
      rewrites: number;
    };

export type StagedItem = StagedWrite | StagedReview;

export type StagedKind = StagedItem["kind"];

export type LedgerOp = "create" | "edit" | "approve" | "discard" | "revert";

export interface FileDelta {
  path: string;
  before: string | null;
  beforeHash: string | null;
  after: string | null;
  afterHash: string | null;
}

export interface LedgerEntry {
  id: string;
  op: LedgerOp;
  timestamp: string;
  deltas: readonly FileDelta[];
}

export interface AuditEntry {
  timestamp: string;
  event: string;
}

export interface DailyEntry {
  time: string;
  provenance: Provenance;
  text: string;
  session?: string;
}

export interface GardenerActivity {
  state: "idle" | "working" | "failed";
  sweptAt?: string;
}

export interface MemoryGarden {
  trusted: boolean;
  layers: MemoryLayer[];
  inbox: StagedItem[];
  ledger: readonly LedgerEntry[];
  audit: AuditEntry[];
  gardener?: GardenerActivity;
  airlocks: AirlockDigest[];
}

export interface MemoryInbox {
  trusted: boolean;
  items: StagedItem[];
  count: number;
}

export interface WriteResult {
  path: string;
  staged: boolean;
  ledgerId: string;
}

export interface MemoryNotes {
  trusted: boolean;
  notes: MemoryNote[];
}

export interface MemoryDailyDates {
  trusted: boolean;
  dates: string[];
}

export interface MemoryDaily {
  trusted: boolean;
  date: string;
  entries: DailyEntry[];
}

export interface MemoryLedger {
  trusted: boolean;
  entries: readonly LedgerEntry[];
}

export type RevertOutcome = "reverted" | "needs-rebase";

export interface MemoryQuestion {
  query: string;
  arc?: string;
}

export const maxAskQueryLength = 2000;

export type QueryLeg = "lexical" | "semantic" | "graph";

export interface MemoryQueryHit {
  note: string;
  layer: string;
  ranks: Partial<Record<QueryLeg, number>>;
  boost?: number;
  superseded: boolean;
}

export interface MemoryAnswer {
  trusted: boolean;
  hits: MemoryQueryHit[];
  source: "lexical" | "hybrid" | "lexical-degraded";
  embeddings?: string;
}

export type CandidateChoice = "deliver" | "leave";

export type QuestionChoice = "resolve" | "carry" | "drop";

export interface AirlockCandidate {
  note: string;
  title: string;
  provenance: Provenance;
  eligible: boolean;
  shortfalls: string[];
  created?: string;
  choice?: CandidateChoice;
}

export interface AirlockQuestion {
  title: string;
  provenance: Provenance;
  created?: string;
  choice?: QuestionChoice;
}

export interface AirlockDigest {
  arc: string;
  candidates: AirlockCandidate[];
  questions: AirlockQuestion[];
  successor?: string;
  sweep?: { acked: number; wedged: number };
  direction?: string;
}

export interface CloseDecisions {
  candidates: Record<string, CandidateChoice>;
  questions: Record<string, QuestionChoice>;
  successor?: string;
  direction?: string;
}

export type DecidedDigest = AirlockDigest & { decisions: CloseDecisions };

export type AirlockReading = DecidedDigest & { trusted: boolean };

export type AirlockFinishOutcome =
  | { kind: "closed"; delivered: number; released: number; notice?: string }
  | { kind: "pending"; candidates: number; questions: number; wedged: number; notice?: string }
  | { kind: "undecided"; items: string[] }
  | { kind: "wedged"; sessions: string[] };

export type MemoryWriteRefusal = "inert" | "missing";

export type AirlockRefusal =
  | { kind: "ineligible"; detail: string }
  | { kind: "no-successor"; detail: string };

export type ApproveOutcome = { kind: "approved"; result: WriteResult | null } | MemoryWriteRefusal;

export type DiscardOutcome = "discarded" | MemoryWriteRefusal;

export type RevertReply = { kind: "reverted" } | { kind: "needs-rebase" } | MemoryWriteRefusal;

export type AirlockTriage =
  | { kind: "digest"; digest: DecidedDigest }
  | AirlockRefusal
  | MemoryWriteRefusal;

export type AirlockDelivery = { kind: "delivered"; delivered: number } | MemoryWriteRefusal;

export type AirlockFinish =
  | { kind: "finished"; outcome: AirlockFinishOutcome }
  | MemoryWriteRefusal;

export const inertMemoryDetail = "memory is inert: this workspace is untrusted";
