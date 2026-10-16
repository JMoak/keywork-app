export const decisionQuestions = {
  actionRelevance: "action-relevance@1",
  entryDurability: "entry-durability@1",
  entryKind: "entry-kind@1",
  pairRelation: "pair-relation@1",
  driftVerdict: "drift-verdict@1",
  mentionIsLink: "mention-is-link@1",
  searchRelevance: "search-relevance@1",
  skillApplies: "skill-applies@1",
} as const;

export type DecisionQuestion = (typeof decisionQuestions)[keyof typeof decisionQuestions];

export const entryDurabilities = [
  "new-durable",
  "changes-a-note",
  "reinforces-a-note",
  "episodic",
  "unsure",
] as const;

export type EntryDurability = (typeof entryDurabilities)[number];

export const pairRelations = [
  "duplicate",
  "newer-supersedes-older",
  "older-still-holds",
  "contradiction",
  "distinct",
  "unsure",
] as const;

export type PairRelation = (typeof pairRelations)[number];

export const driftVerdicts = ["hold", "stale", "unsure"] as const;

export type DriftVerdict = (typeof driftVerdicts)[number];

export const mentionVerdicts = ["link", "no-link"] as const;

export type MentionVerdict = (typeof mentionVerdicts)[number];

export const deciderNames = ["builtin", "jev"] as const;

export type DeciderName = (typeof deciderNames)[number];

export const fallbackReasons = [
  "no-key",
  "refused",
  "late",
  "rate-limited",
  "overloaded",
  "malformed",
  "degraded",
  "undecided",
  "unproven-model",
] as const;

export type FallbackReason = (typeof fallbackReasons)[number];

export interface MemoryDecision {
  id: string;
  question: DecisionQuestion;
  about: DecisionSubject;
  candidates: string[];
  choice: DecisionChoice;
  scores?: Record<string, number>;
  confidence?: number;
  decider: DeciderName;
  model?: string;
  rule?: string;
  fallback?: DecisionFallback;
  latencyMs: number;
  waitedMs?: number;
  inputTokens?: number;
  stateHash?: string;
}

export type DecisionSubject =
  | { kind: "call"; callId: string }
  | { kind: "pair"; older: string; newer: string }
  | { kind: "entry"; entryId: string }
  | { kind: "note"; note: string }
  | { kind: "mention"; note: string; target: string }
  | { kind: "query"; query: string };

export type DecisionChoice =
  | RecallSelection
  | EntryDurability
  | PairRelation
  | DriftVerdict
  | MentionVerdict;

export interface RecallSelection {
  kept: string[];
  dropped: string[];
}

export interface DecisionFallback {
  reason: FallbackReason;
  undecided?: string[];
}

export function isRecallSelection(choice: DecisionChoice): choice is RecallSelection {
  return typeof choice === "object";
}

export function candidateClausesOf(rule: string | undefined): ReadonlyMap<string, string> {
  const clauses = new Map<string, string>();
  for (const clause of (rule ?? "").split(clauseSeparator)) {
    const [, name, words] = candidateClause.exec(clause) ?? [];
    if (name !== undefined && words !== undefined) clauses.set(name, words);
  }
  return clauses;
}

const clauseSeparator = "; ";

const candidateClause = /^\[\[(.+?)\]\] (.+)$/;
