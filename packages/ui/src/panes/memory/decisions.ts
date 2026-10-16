import {
  decisionOdds,
  elapsedText,
  noteLink,
  oddsText,
  selectionOf,
  type ToolRun,
  type TranscriptEntry,
} from "@keywork-app/client";
import {
  decisionQuestions,
  isRecallSelection,
  type MemoryDecision,
  type StagedItem,
} from "@keywork-app/protocol";
import type { GaugeCell } from "../../instruments/context.ts";
import type { EntryDecisions } from "../../shell/memory-store.ts";
import { oddsCell, ruleCell } from "./density.ts";

export interface DecisionRow {
  readonly id: string;
  readonly asked: string;
  readonly facts: readonly string[];
  readonly mark: DecisionMark;
  readonly candidates: readonly CandidateLine[];
  readonly rule: string | undefined;
}

export interface DecisionMark {
  readonly cell: GaugeCell;
  readonly label: string;
}

export type CandidateVerdict = "kept" | "dropped" | "offered";

export interface CandidateLine {
  readonly name: string;
  readonly verdict: CandidateVerdict;
  readonly odds: string | undefined;
}

export const noDecisionsLine =
  "no decisions yet · memory decides what to recall before each write, edit or command";

export function decisionRows(
  decisions: readonly MemoryDecision[],
  entries: readonly TranscriptEntry[],
): DecisionRow[] {
  const actions = actionsByCall(entries);
  return [...decisions].reverse().map((decision) => decisionRow(decision, actions));
}

export function triageOdds(item: StagedItem, decisions: EntryDecisions): string | undefined {
  if (item.kind !== "borderline-promotion") return undefined;
  const decision = decisions[item.source];
  if (decision === undefined || decision.choice === "unsure") return undefined;
  return `${choiceWords(decision)} · ${deciderOdds(decision)}`;
}

function decisionRow(decision: MemoryDecision, actions: ReadonlyMap<string, ToolRun>): DecisionRow {
  return {
    id: decision.id,
    asked: askedWords(decision, actions),
    facts: decisionFacts(decision),
    mark: decisionMark(decision),
    candidates: candidateLines(decision),
    rule: decision.rule,
  };
}

function actionsByCall(entries: readonly TranscriptEntry[]): ReadonlyMap<string, ToolRun> {
  return new Map(
    entries.flatMap((entry) => (entry.kind === "tool" ? [[entry.run.callId, entry.run]] : [])),
  );
}

function askedWords(decision: MemoryDecision, actions: ReadonlyMap<string, ToolRun>): string {
  const { about } = decision;
  switch (about.kind) {
    case "call":
      return `recall before ${actionWords(actions.get(about.callId), about.callId)}`;
    case "entry":
      return decision.question === decisionQuestions.entryKind
        ? `kind of entry ${about.entryId}`
        : `triage entry ${about.entryId}`;
    case "pair":
      return `relate ${noteLink(about.older)} and ${noteLink(about.newer)}`;
    case "note":
      return `does ${noteLink(about.note)} still hold`;
    case "mention":
      return `link ${noteLink(about.note)} to ${noteLink(about.target)}`;
    case "query":
      return `weigh hits for "${about.query}"`;
  }
}

function actionWords(run: ToolRun | undefined, callId: string): string {
  if (run === undefined) return `call ${callId}`;
  return run.subject === "" ? run.name : `${run.name} ${run.subject}`;
}

function decisionFacts(decision: MemoryDecision): string[] {
  return [
    choiceWords(decision),
    deciderOdds(decision),
    ...(decision.fallback === undefined ? [] : [`fallback ${decision.fallback.reason}`]),
    elapsedText(decision.latencyMs),
  ];
}

function choiceWords(decision: MemoryDecision): string {
  const { choice } = decision;
  return isRecallSelection(choice)
    ? `kept ${choice.kept.length} of ${decision.candidates.length}`
    : choice.replaceAll("-", " ");
}

function deciderOdds(decision: MemoryDecision): string {
  const odds = decisionOdds(decision);
  return odds === undefined ? decision.decider : `${decision.decider} ${oddsText(odds)}`;
}

function decisionMark(decision: MemoryDecision): DecisionMark {
  if (decision.choice === "unsure") return { cell: oddsCell(0), label: "unsure" };
  const odds = decisionOdds(decision);
  if (odds === undefined) return { cell: ruleCell(), label: "by rule" };
  return { cell: oddsCell(odds), label: `odds ${oddsText(odds)}` };
}

function candidateLines(decision: MemoryDecision): CandidateLine[] {
  const kept = selectionOf(decision)?.kept;
  const named = decision.about.kind === "entry" ? (id: string) => id : noteLink;
  return decision.candidates.map((candidate) => {
    const score = decision.scores?.[candidate];
    return {
      name: named(candidate),
      verdict: verdictOf(candidate, kept),
      odds: score === undefined ? undefined : oddsText(score),
    };
  });
}

function verdictOf(candidate: string, kept: readonly string[] | undefined): CandidateVerdict {
  if (kept === undefined) return "offered";
  return kept.includes(candidate) ? "kept" : "dropped";
}
