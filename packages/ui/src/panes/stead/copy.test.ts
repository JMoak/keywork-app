import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CreatureReading, Thread } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import {
  ageWord,
  askLine,
  bubbleLine,
  choreBoard,
  emptyStateLine,
  headLine,
  steadTitle,
  type Telling,
  timeWord,
  trimmedFromTheLeft,
  whatAreYouDoing,
} from "./copy.ts";

const noon = Date.UTC(2026, 10, 5, 12, 0, 0);

describe("the chore board", () => {
  const creature = (name: string, chores: { id: string; nextAt: string | undefined }[]) => ({
    slug: name,
    name,
    skin: undefined,
    seed: undefined,
    workshop: {
      raisedAt: at(60),
      parcel: undefined,
      substrate: undefined,
      health: undefined,
      boardedAt: undefined,
    },
    conversation: undefined,
    chores: chores.map((chore) => ({
      ...chore,
      title: chore.id.replace("-", " "),
      lastRanAt: undefined,
      running: undefined,
    })),
  });

  it("names the soonest next run across every creature, with who runs it and when", () => {
    const board = choreBoard(
      {
        creatures: {
          vey: creature("vey", [
            { id: "stamp-note", nextAt: undefined },
            { id: "docs-changes", nextAt: at(-2) },
          ]),
          mab: creature("mab", [{ id: "nightly", nextAt: at(-120) }]),
        },
      },
      noon,
      0,
    );
    expect(board).toEqual({
      line: "chore board · next: docs changes (vey) at 12:02",
      nextAt: at(-2),
    });
  });

  it("says so when nothing is scheduled", () => {
    expect(choreBoard({ creatures: { vey: creature("vey", []) } }, noon, 0)).toEqual({
      line: "chore board · nothing scheduled",
      nextAt: undefined,
    });
  });
});
const at = (minutesBefore: number): string => new Date(noon - minutesBefore * 60_000).toISOString();

describe("the stead's words", () => {
  it("hold no exclamation mark and no emoji in any string", () => {
    const source = readFileSync(join(process.cwd(), "packages/ui/src/panes/stead/copy.ts"), "utf8");
    const literals = [...source.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(
      ([, plain, template]) => plain ?? template ?? "",
    );
    expect(literals.length).toBeGreaterThan(10);
    for (const literal of literals) {
      expect(literal, literal).not.toMatch(/!/);
      expect(literal, literal).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("teaches the one next action in two parts and titles itself by the count", () => {
    expect(emptyStateLine("ctrl+k b")).toBe("No creature yet · make one with ctrl+k b");
    expect(steadTitle(0)).toBe("stead");
    expect(steadTitle(2)).toBe("stead · 2 need you");
    expect(headLine({ creatures: 1, needYou: 0, working: 0, phase: "dusk", clock: "18:40" })).toBe(
      "1 creature · dusk 18:40",
    );
    expect(headLine({ creatures: 3, needYou: 1, working: 2, phase: "day", clock: "09:05" })).toBe(
      "3 creatures · 1 needs you · 2 working · day 09:05",
    );
  });

  it("speaks the fixed bubble vocabulary and trims a long command from the left", () => {
    expect(askLine("edit", "src/a.ts")).toBe("asks to edit src/a.ts");
    expect(askLine("write", "")).toBe("asks to edit a file");
    expect(askLine("bash", "bun test")).toBe("asks to run bun test");
    expect(askLine("github__create_issue", "x")).toBe("question");
    const long = `bun x vitest run ${"packages/".repeat(6)}a.test.ts`;
    const trimmed = trimmedFromTheLeft(long);
    expect(trimmed.length).toBe(40);
    expect(trimmed.startsWith("…")).toBe(true);
    expect(trimmed.endsWith("a.test.ts")).toBe(true);
    expect(bubbleLine(thread({ failure: { at: at(1), eventId: 1, message: "boom" } }))).toBe(
      "blocked",
    );
    expect(bubbleLine(thread({ back: { at: at(1), preview: "done", changes: [] } }))).toBe(
      "finished",
    );
    expect(bubbleLine(thread({}))).toBe("question");
  });

  it("tells the time as a clock, with its age once it is older than ten minutes", () => {
    expect(timeWord(at(2), noon, 0)).toBe("11:58");
    expect(timeWord(at(25), noon, 0)).toBe("11:35 (25m ago)");
    expect(timeWord(at(3 * 60), noon, 60)).toBe("10:00 (3h ago)");
    expect(timeWord(undefined, noon, 0)).toBe("an unknown time");
    expect(ageWord(72 * 3_600_000)).toBe("3d");
  });

  it("answers what are you doing from the bus and never guesses a slot", () => {
    expect(tell({ ...reading("working"), lamps: 2 }, thread({ title: "docs index" }))).toBe(
      "Working on docs index: edit since 11:55. 1 other thread live.",
    );
    expect(
      tell(
        reading("porch"),
        thread({
          title: "nightly",
          asks: { c1: { callId: "c1", tool: "bash", subject: "rm -rf dist", askedAt: at(5) } },
        }),
      ),
    ).toBe(
      "Waiting on you: asks to run rm -rf dist in nightly, since 11:55. Everything else keeps going.",
    );
    const labelled = reading("back");
    const reported =
      labelled.carrier === undefined || labelled.carrier.back === undefined
        ? labelled
        : {
            ...labelled,
            carrier: {
              ...labelled.carrier,
              back: { ...labelled.carrier.back, report: "Indexed 14 docs; two links dangle." },
            },
          };
    expect(tell(reported, thread({ title: "docs index" }))).toBe(
      "Finished docs index at 11:55. The result is on the porch, not yet opened: Indexed 14 docs; two links dangle. Delivery: unknown.",
    );
    expect(tell(reading("back"), thread({ title: "docs index" }))).toBe(
      "Finished docs index at 11:55. The result is on the porch, not yet opened: wrote INDEX.md Delivery: unknown.",
    );
    expect(
      tell(
        reading("blocked"),
        thread({ title: "nightly", failure: { at: at(30), eventId: 9, message: "2 failures" } }),
      ),
    ).toBe("nightly stopped at 11:30 (30m ago): 2 failures. Next step: open it.");
    expect(
      tell(
        reading("paused"),
        thread({
          title: "nightly",
          waiting: { reason: "rate-limited", since: at(5), until: undefined },
        }),
      ),
    ).toBe(
      "Paused since 11:55: the provider is rate-limiting. I resume when it clears. Nothing is lost.",
    );
    expect(tell(reading("idle"), undefined)).toBe("Nothing, and nothing scheduled.");
    expect(
      tell(reading("idle"), undefined, {
        chores: [
          { id: "c", title: "verify", nextAt: at(-60), lastRanAt: undefined, running: undefined },
        ],
      }),
    ).toBe("Nothing. Next chore: verify at 13:00.");
    expect(tell(reading("idle"), undefined, { asOf: undefined })).toBe(
      "I cannot tell. No event has arrived yet; the picture may be stale.",
    );
  });
});

function tell(
  state: CreatureReading,
  held: Thread | undefined,
  overrides: Partial<Telling> = {},
): string {
  return whatAreYouDoing({
    reading: state,
    thread: held,
    chores: [],
    parcelFogged: undefined,
    now: noon,
    offsetMinutes: 0,
    asOf: at(1),
    lastEvent: undefined,
    ...overrides,
  });
}

function reading(state: CreatureReading["state"]): CreatureReading {
  return {
    state,
    carrier: {
      thread: "t1",
      state,
      since: noon - 5 * 60_000,
      staleAt: undefined,
      tool: state === "working" ? { callId: "k", name: "edit", since: at(1) } : undefined,
      stumbledAt: undefined,
      asks: state === "porch" ? 1 : 0,
      repair: undefined,
      back:
        state === "back" ? { at: at(5), preview: "wrote INDEX.md", report: undefined } : undefined,
    },
    lamps: state === "working" ? 1 : 0,
    lanterns: 0,
    notes: 0,
    crates: state === "back" ? 1 : 0,
    asks: state === "porch" ? 1 : 0,
  };
}

function thread(overrides: Partial<Thread>): Thread {
  return {
    id: "t1",
    creature: "wren",
    kind: "thread",
    parent: undefined,
    title: "",
    turn: undefined,
    restingSince: undefined,
    asks: {},
    answered: {},
    back: undefined,
    failure: undefined,
    failures: 0,
    waiting: undefined,
    changes: [],
    queued: 0,
    children: [],
    outcome: undefined,
    lastActivityAt: at(5),
    viewedAt: undefined,
    removed: false,
    ...overrides,
  };
}
