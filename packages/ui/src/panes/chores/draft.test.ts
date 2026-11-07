import { describe, expect, it } from "vitest";
import { blankDraft, type ChoreDraft, choreFileOf, draftOf, idFromTitle } from "./draft.ts";
import { docsIndex, morningTriage, nightlyTests, testZone } from "./testing.ts";

const filled = (overrides: Partial<ChoreDraft>): ChoreDraft => ({
  ...blankDraft(testZone),
  title: "Morning triage",
  instructions: "Read the inbox.",
  ...overrides,
});

describe("a chore draft", () => {
  it("starts on a weekday schedule in the keeper's zone, read-only, at the default budget", () => {
    expect(choreFileOf(filled({}))).toEqual({
      ok: true,
      file: {
        id: "morning-triage",
        title: "Morning triage",
        instructions: "Read the inbox.",
        trigger: { kind: "cron", expr: "0 9 * * 1-5", tz: testZone },
        destination: { kind: "conversation" },
        notify: "only-when-needs-me",
        tools: "read-only",
        grants: [],
        budget: { usd: 0.5, minutes: 10 },
        enabled: true,
      },
    });
  });

  it("round-trips every chore file shape through the form", () => {
    for (const row of [morningTriage, docsIndex, nightlyTests]) {
      const file = row.routine;
      if (file === null) throw new Error(`${row.id} has no routine`);
      expect(choreFileOf(draftOf(file, testZone))).toEqual({ ok: true, file });
    }
  });

  it("sends no grants for a read-only chore, whatever the grants box holds", () => {
    const reading = choreFileOf(filled({ tools: "read-only", grants: "bash rm -rf /" }));
    expect(reading.ok && reading.file.grants).toEqual([]);
  });

  it.each([
    [{ title: "  " }, "A chore needs a title."],
    [{ instructions: "" }, "A chore needs instructions."],
    [
      { id: "Not An Id" },
      "The id takes lowercase letters, digits and dashes, starting with a letter or digit.",
    ],
    [{ cron: "" }, "A schedule needs a cron expression and a time zone."],
    [{ tz: " " }, "A schedule needs a cron expression and a time zone."],
    [{ trigger: "interval", every: "0" }, "Every takes a whole number of minutes from 1 to 10080."],
    [
      { trigger: "interval", every: "10081" },
      "Every takes a whole number of minutes from 1 to 10080.",
    ],
    [
      { trigger: "interval", every: "1.5" },
      "Every takes a whole number of minutes from 1 to 10080.",
    ],
    [{ destination: "thread", thread: "" }, "Name the thread it reports to."],
    [{ destination: "file", path: " " }, "Name the file it writes to."],
    [
      { tools: "write", grants: "write" },
      "Each grant is one line: an action, a space, then what it covers.",
    ],
    [{ usd: "0" }, "The budget in USD is a number above 0."],
    [{ usd: "free" }, "The budget in USD is a number above 0."],
    [{ minutes: "0" }, "The budget in minutes is a whole number from 1."],
  ] as const)("refuses %o with one plain problem", (overrides, problem) => {
    expect(choreFileOf(filled(overrides))).toEqual({ ok: false, problem });
  });

  it("derives a file name from the title the way the node accepts ids", () => {
    expect(idFromTitle("Morning triage")).toBe("morning-triage");
    expect(idFromTitle("  Docs: INDEX (weekly)  ")).toBe("docs-index-weekly");
    expect(idFromTitle("***")).toBe("");
    expect(idFromTitle("x".repeat(70))).toHaveLength(64);
  });
});
