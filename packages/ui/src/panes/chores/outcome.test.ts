import { describe, expect, it } from "vitest";
import { outcomeLine, runMarks, runOutcome } from "./outcome.ts";
import { runRow } from "./testing.ts";
import type { RunRow } from "./wire.ts";

const ended = (overrides: Partial<RunRow>): RunRow =>
  runRow({ runId: "r-1", firedAt: "2026-11-05T15:00:00.000Z", ...overrides });

describe("a run's outcome", () => {
  it.each([
    [{ process: "completed", delivery: "delivered" }, "delivered"],
    [{ process: "completed", delivery: "none" }, "completed"],
    [{ process: "completed", delivery: "unknown" }, "completed"],
    [{ process: "completed", delivery: "failed" }, "completed"],
    [{ process: "failed", delivery: "none" }, "blocked"],
    [{ process: "timed-out", delivery: "unknown" }, "blocked"],
    [{ process: "blocked", delivery: "none" }, "blocked"],
    [{ process: "cancelled", delivery: "none" }, "cancelled"],
    [{ status: "running", process: null, delivery: null }, "running"],
    [{ status: "parked", process: null, delivery: null }, "needs you"],
    [{ status: "skipped", process: null, delivery: null }, "skipped"],
    [{ status: "dropped", process: null, delivery: null }, "skipped"],
  ] as const)("derives %o as %s", (row, word) => {
    expect(runOutcome(ended(row)).word).toBe(word);
  });

  it("keeps delivery and verification out of the outcome word, as their own marks", () => {
    const unknown = ended({ process: "completed", delivery: "unknown", verified: false });
    expect(runOutcome(unknown).word).toBe("completed");
    expect(runMarks(unknown)).toEqual({
      process: "completed",
      delivery: "unknown",
      verified: "unverified",
    });
    expect(outcomeLine(unknown)).toBe("completed, unverified");
    expect(runMarks(ended({ status: "running", process: null, delivery: null }))).toEqual({
      process: "running",
      delivery: "pending",
      verified: "unchecked",
    });
    expect(runMarks(ended({ status: "parked", process: null, delivery: null }))).toEqual({
      process: "waiting",
      delivery: "pending",
      verified: "unchecked",
    });
    expect(runMarks(ended({ status: "skipped", process: null, delivery: null }))).toEqual({
      process: "not run",
      delivery: "not run",
      verified: "not run",
    });
    expect(runMarks(ended({ process: "timed-out", delivery: null }))).toEqual({
      process: "timed out",
      delivery: "unknown",
      verified: "unchecked",
    });
    expect(runMarks(ended({ process: null, delivery: null })).process).toBe("unknown");
  });

  it("puts the reason after the word, and drops the scheduler's own dropped prefix", () => {
    expect(
      outcomeLine(ended({ process: "blocked", delivery: "none", reason: "over budget" })),
    ).toBe("blocked: over budget");
    expect(
      outcomeLine(
        ended({ status: "dropped", process: null, delivery: null, reason: "dropped: cap 6" }),
      ),
    ).toBe("skipped: cap 6");
  });

  it("never says done, ok or success for any combination of the three facts", () => {
    const processes = ["completed", "failed", "cancelled", "timed-out", "blocked", null] as const;
    const deliveries = ["delivered", "unknown", "failed", "none", null] as const;
    const verdicts = [true, false, null] as const;
    const statuses = ["running", "parked", "ended", "skipped", "dropped"] as const;
    for (const status of statuses)
      for (const process of processes)
        for (const delivery of deliveries)
          for (const verified of verdicts) {
            const run = ended({ status, process, delivery, verified, reason: null });
            const words = [outcomeLine(run), ...Object.values(runMarks(run))].join(" ");
            expect(words).not.toMatch(/\b(done|ok|success|succeeded)\b/i);
          }
  });
});
