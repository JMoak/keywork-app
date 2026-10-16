import {
  candidateClausesOf,
  isRecallSelection,
  type MemoryDecision,
  type RecallSelection,
} from "@keywork-app/protocol";

export function withDecision(
  decisions: readonly MemoryDecision[],
  decision: MemoryDecision,
): readonly MemoryDecision[] {
  const known = decisions.findIndex((earlier) => earlier.id === decision.id);
  if (known === -1) return [...decisions, decision];
  return decisions.map((earlier, index) => (index === known ? decision : earlier));
}

export function recallText(decision: MemoryDecision): string | undefined {
  const kept = selectionOf(decision)?.kept ?? [];
  if (kept.length === 0) return undefined;
  const reasons = candidateReasons(decision);
  return `recalled ${kept.map((name) => noteWithReason(name, reasons.get(name))).join("; ")}`;
}

export function candidateReasons(decision: MemoryDecision): ReadonlyMap<string, string> {
  const clauses = candidateClausesOf(decision.rule);
  const reasons = new Map<string, string>();
  for (const name of decision.candidates) {
    const reason = oddsReason(decision, name) ?? clauses.get(name);
    if (reason !== undefined) reasons.set(name, reason);
  }
  return reasons;
}

export function selectionOf(decision: MemoryDecision): RecallSelection | undefined {
  return isRecallSelection(decision.choice) ? decision.choice : undefined;
}

export function decisionOdds(decision: MemoryDecision): number | undefined {
  if (decision.confidence !== undefined) return decision.confidence;
  const { choice } = decision;
  const chosen = isRecallSelection(choice) ? choice.kept : [choice];
  const odds = chosen.flatMap((name) => {
    const score = decision.scores?.[name];
    return score === undefined ? [] : [score];
  });
  return odds.length === 0 ? undefined : Math.min(...odds);
}

export function oddsText(probability: number): string {
  return probability.toFixed(2);
}

export function noteLink(name: string): string {
  return `[[${name}]]`;
}

function oddsReason(decision: MemoryDecision, name: string): string | undefined {
  const score = decision.scores?.[name];
  return score === undefined ? undefined : `${decision.decider} ${oddsText(score)}`;
}

function noteWithReason(name: string, reason: string | undefined): string {
  return reason === undefined ? noteLink(name) : `${noteLink(name)} · ${reason}`;
}
