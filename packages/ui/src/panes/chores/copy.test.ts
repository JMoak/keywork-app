import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  budgetWords,
  costWords,
  cronWords,
  destinationWords,
  intervalWords,
  minutesWords,
  nextWords,
  noChoresLine,
  noCreatureLine,
  noRunsLine,
  settingsLine,
  toolsWords,
  triggerWords,
  whenWords,
} from "./copy.ts";
import {
  brokenChore,
  docsIndex,
  morningTriage,
  nightlyTests,
  runRow,
  storehouseTidy,
  testZone,
  thursdayMorning,
} from "./testing.ts";
import type { ChoreRow } from "./wire.ts";

describe("the chores pane's words", () => {
  it("hold no exclamation mark and no emoji in any string", () => {
    for (const module of ["copy.ts", "outcome.ts"]) {
      const source = readFileSync(
        join(process.cwd(), "packages/ui/src/panes/chores", module),
        "utf8",
      );
      const literals = [...source.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(
        ([, plain, template]) => plain ?? template ?? "",
      );
      expect(literals.length, module).toBeGreaterThan(10);
      for (const literal of literals) {
        expect(literal, literal).not.toMatch(/!/);
        expect(literal, literal).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    }
  });

  it("teach the empty states in the voice guide's words, two parts and one chord", () => {
    expect(noChoresLine("n")).toBe("No chores · add one with n");
    expect(noCreatureLine("leader b")).toBe("No creature yet · make one with leader b");
    expect(noRunsLine("r")).toBe("No runs yet · run it now with r");
  });
});

describe("cron in words", () => {
  it.each([
    ["0 9 * * 1-5", "weekdays at 09:00"],
    ["0 9 * * mon-fri", "weekdays at 09:00"],
    ["0 10 * * 0,6", "weekends at 10:00"],
    ["0 8 * * 1", "Mondays at 08:00"],
    ["0 8 * * 7", "Sundays at 08:00"],
    ["30 6 * * 1,3,5", "Mon, Wed and Fri at 06:30"],
    ["0 2 * * *", "every day at 02:00"],
    ["0 9,17 * * *", "every day at 09:00 and 17:00"],
    ["0,30 9 * * *", "every day at 09:00 and 09:30"],
    ["0 9 1 * *", "on day 1 at 09:00"],
    ["0 9 1,15 * *", "on days 1 and 15 at 09:00"],
    ["0 9 1 * 1", "on day 1 or Mondays at 09:00"],
    ["0 9 * 1,7 *", "every day at 09:00 in Jan and Jul"],
    ["* * * * *", "every minute"],
    ["*/15 * * * *", "every 15 minutes"],
    ["*/15 * * * 1-5", "every 15 minutes on weekdays"],
    ["0 * * * *", "every hour"],
    ["5 * * * *", "every hour at :05"],
    ["0 */2 * * *", "every 2 hours"],
    ["30 */3 * * *", "every 3 hours at :30"],
    ["@daily", "every day at 00:00"],
    ["@hourly", "every hour"],
    ["@weekly", "Sundays at 00:00"],
    ["@monthly", "on day 1 at 00:00"],
    ["@yearly", "on day 1 at 00:00 in Jan"],
  ])("reads %s as %s", (expr, words) => {
    expect(cronWords(expr)).toBe(words);
  });

  it("shows the expression itself when it cannot say it plainly or cannot read it", () => {
    expect(cronWords("*/7 3-20 * * *")).toBe("cron */7 3-20 * * *");
    expect(cronWords("0 9 */2 * 1")).toBe("cron 0 9 */2 * 1");
    expect(cronWords("nope")).toBe("cron nope");
    expect(cronWords("0 25 * * *")).toBe("cron 0 25 * * *");
    expect(cronWords("0 9 * * 5-1")).toBe("cron 0 9 * * 5-1");
  });

  it("names the zone and the end date, and reads intervals and manual triggers", () => {
    expect(
      triggerWords({ kind: "cron", expr: "0 9 * * 1-5", tz: testZone, until: "2026-12-31" }),
    ).toBe("weekdays at 09:00 (America/Chicago), until 2026-12-31");
    expect(triggerWords({ kind: "interval", minutes: 40 })).toBe("every 40 minutes");
    expect(triggerWords({ kind: "manual" })).toBe("by hand only");
    expect([1, 60, 90, 120, 1440, 2880].map(intervalWords)).toEqual([
      "every minute",
      "every hour",
      "every 90 minutes",
      "every 2 hours",
      "every day",
      "every 2 days",
    ]);
  });
});

describe("a chore's facts", () => {
  it("says where the output goes, the budget, and the tools with the accepted-grants mark", () => {
    expect(destinationWords({ kind: "conversation" })).toBe("the conversation");
    expect(destinationWords({ kind: "thread", name: "nightly" })).toBe("thread nightly");
    expect(destinationWords({ kind: "file", path: "docs/INDEX.md" })).toBe("docs/INDEX.md");
    expect(budgetWords({ usd: 0.5, minutes: 1 })).toBe("$0.50 and 1 minute a run");
    expect(toolsWords(grantsOf(morningTriage), 0)).toBe("read-only");
    expect(toolsWords(grantsOf(docsIndex), 2)).toBe("write, 2 grants, accepted");
    expect(toolsWords(grantsOf(nightlyTests), 1)).toBe("act, 1 grant, not accepted");
  });

  it("says the next run in the trigger's zone, relative to today, or why there is none", () => {
    const at = (nextRunAt: string): ChoreRow => ({
      ...morningTriage,
      schedule: { ...morningTriage.schedule, nextRunAt },
    });
    const next = (row: ChoreRow): string => nextWords(row, thursdayMorning, testZone);
    expect(next(at("2026-11-05T21:30:00.000Z"))).toBe("today 15:30");
    expect(next(at("2026-11-06T15:00:00.000Z"))).toBe("tomorrow 09:00");
    expect(next(at("2026-11-09T15:00:00.000Z"))).toBe("Mon 09:00");
    expect(next(at("2026-11-16T15:00:00.000Z"))).toBe("11-16 09:00");
    expect(next(docsIndex)).toBe("running");
    expect(next(storehouseTidy)).toBe("off");
    expect(next(brokenChore)).toBe("unreadable");
    expect(
      next({ ...morningTriage, schedule: { ...morningTriage.schedule, nextRunAt: null } }),
    ).toBe("no next run");
    const manual = {
      ...morningTriage,
      routine: { ...requireRoutine(morningTriage), trigger: { kind: "manual" as const } },
    };
    expect(next(manual)).toBe("by hand");
  });

  it("puts a number and its unit apart, and is honest about a cost nobody priced", () => {
    const ran = runRow({
      runId: "r-1",
      firedAt: "2026-11-05T14:00:00.000Z",
      endedAt: "2026-11-05T14:00:45.000Z",
      cost: { usd: 0.0042 },
    });
    expect(costWords(ran)).toBe("0.0042");
    expect(minutesWords(ran)).toBe("0.8");
    expect(costWords({ ...ran, cost: null })).toBe("unknown");
    expect(costWords({ ...ran, cost: null, startedAt: null })).toBe("—");
    expect(minutesWords({ ...ran, endedAt: null })).toBe("—");
    expect(minutesWords({ ...ran, endedAt: "2026-11-05T14:25:00.000Z" })).toBe("25");
    expect(whenWords("2026-11-05T14:00:00.000Z", testZone)).toBe("11-05 08:00");
    expect(whenWords(null, testZone)).toBe("—");
    expect(whenWords("2026-11-05T14:00:00.000Z", "Not/AZone")).toBe("—");
  });

  it("reads the node's digest times and quiet hours as one line", () => {
    expect(settingsLine({ digest: ["09:00"], quietHours: null })).toBe(
      "digest at 09:00 · no quiet hours",
    );
  });
});

function grantsOf(row: ChoreRow): NonNullable<ChoreRow["grants"]> {
  if (row.grants === null) throw new Error(`${row.id} has no grants view`);
  return row.grants;
}

function requireRoutine(row: ChoreRow): NonNullable<ChoreRow["routine"]> {
  if (row.routine === null) throw new Error(`${row.id} has no routine`);
  return row.routine;
}
