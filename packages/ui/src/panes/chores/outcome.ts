import type { RunRow } from "./wire.ts";

export type OutcomeWord =
  | "running"
  | "needs you"
  | "delivered"
  | "completed"
  | "cancelled"
  | "blocked"
  | "skipped";

export type ProcessMark =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed out"
  | "blocked"
  | "not run"
  | "unknown";

export type DeliveryMark = "pending" | "delivered" | "unknown" | "failed" | "none" | "not run";

export type VerifiedMark = "verified" | "unverified" | "unchecked" | "not run";

export interface RunOutcome {
  readonly word: OutcomeWord;
  readonly reason: string | null;
  readonly verification: "verified" | "unverified" | null;
}

export interface RunMarks {
  readonly process: ProcessMark;
  readonly delivery: DeliveryMark;
  readonly verified: VerifiedMark;
}

export function runOutcome(run: RunRow): RunOutcome {
  return { word: outcomeWord(run), reason: reasonOf(run), verification: verificationOf(run) };
}

export function outcomeLine(run: RunRow): string {
  const outcome = runOutcome(run);
  const reason = outcome.reason === null ? "" : `: ${outcome.reason}`;
  const verification = outcome.verification === null ? "" : `, ${outcome.verification}`;
  return `${outcome.word}${reason}${verification}`;
}

export function runMarks(run: RunRow): RunMarks {
  return { process: processMark(run), delivery: deliveryMark(run), verified: verifiedMark(run) };
}

export function neverStarted(run: RunRow): boolean {
  return run.status === "skipped" || run.status === "dropped";
}

function outcomeWord(run: RunRow): OutcomeWord {
  switch (run.status) {
    case "skipped":
    case "dropped":
      return "skipped";
    case "running":
      return "running";
    case "parked":
      return "needs you";
    case "ended":
      return endedWord(run);
  }
}

function endedWord(run: RunRow): OutcomeWord {
  switch (run.process) {
    case "completed":
      return run.delivery === "delivered" ? "delivered" : "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "blocked";
  }
}

function reasonOf(run: RunRow): string | null {
  if (run.reason === null) return null;
  return run.status === "dropped" ? run.reason.replace(/^dropped: /, "") : run.reason;
}

function verificationOf(run: RunRow): RunOutcome["verification"] {
  if (run.verified === null) return null;
  return run.verified ? "verified" : "unverified";
}

function processMark(run: RunRow): ProcessMark {
  if (neverStarted(run)) return "not run";
  if (run.status === "running") return "running";
  if (run.status === "parked") return "waiting";
  switch (run.process) {
    case "timed-out":
      return "timed out";
    case null:
      return "unknown";
    default:
      return run.process;
  }
}

function deliveryMark(run: RunRow): DeliveryMark {
  if (neverStarted(run)) return "not run";
  if (run.status === "running" || run.status === "parked") return "pending";
  return run.delivery ?? "unknown";
}

function verifiedMark(run: RunRow): VerifiedMark {
  if (neverStarted(run)) return "not run";
  if (run.verified === null) return "unchecked";
  return run.verified ? "verified" : "unverified";
}
