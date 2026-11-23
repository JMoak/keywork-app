export type CreatureLedgerKind = "question" | "task";

export type CreatureLedgerState =
  | "waiting"
  | "answered"
  | "running"
  | "finished"
  | "done"
  | "blocked";

export type QuestionAnswer = "granted" | "denied" | "lapsed";

export type CreatureLedgerAbout =
  | { kind: "ask"; callId: string; tool: string }
  | { kind: "grants"; routineId: string }
  | { kind: "chore"; routineId: string; runId: string }
  | { kind: "thread" };

export type LedgerConversationState = "open" | "ended";

export type LedgerConversationEnd = "answer" | "keeper";

// Since contract 1.38: the short conversation opened about one entry, until then null.
export interface LedgerConversation {
  session: string;
  state: LedgerConversationState;
  openedAt: string;
  endedAt: string | null;
  endedBy: LedgerConversationEnd | null;
}

export interface CreatureLedgerEntry {
  id: string;
  kind: CreatureLedgerKind;
  state: CreatureLedgerState;
  title: string;
  directory: string;
  session: string | null;
  openedAt: string;
  closedAt: string | null;
  answer: QuestionAnswer | null;
  about: CreatureLedgerAbout;
  conversation: LedgerConversation | null;
}

export interface CreatureLedgerView {
  creature: string;
  entries: CreatureLedgerEntry[];
  folded: number;
}

export type CreatureLedgerChangeKind = "opened" | "changed" | "folded";

export interface CreatureLedgerChange {
  creature: string;
  change: CreatureLedgerChangeKind;
  entry: CreatureLedgerEntry;
  folded: number;
}

export interface CreatureLedgerEntryAnswer {
  entry: CreatureLedgerEntry;
}

export interface LedgerEntryRef {
  creature: string;
  id: string;
}

export const ledgerRoutes = [
  { method: "GET", path: "/creatures/{slug}/ledger", operationId: "readCreatureLedger" },
  {
    method: "POST",
    path: "/creatures/{slug}/ledger/{id}/seen",
    operationId: "markCreatureLedgerEntrySeen",
  },
  {
    method: "POST",
    path: "/creatures/{slug}/ledger/{id}/conversation",
    operationId: "openLedgerConversation",
  },
  {
    method: "POST",
    path: "/creatures/{slug}/ledger/{id}/conversation/close",
    operationId: "closeLedgerConversation",
  },
] as const;
