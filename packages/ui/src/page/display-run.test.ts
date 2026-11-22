import type { ToolPhase, ToolRun, TranscriptEntry } from "@keywork-app/client";
import { describe, expect, it } from "vitest";
import { displayRunLine, displayRuns, settingOutLine } from "./display-run.ts";

function ran(name: string, phase: ToolPhase = "done", told: Partial<ToolRun> = {}): ToolRun {
  return {
    callId: `${name}-${phase}`,
    name,
    subject: "",
    args: "{}",
    replay: false,
    phase,
    startedAt: undefined,
    live: undefined,
    reason: undefined,
    durationMs: 50,
    askedAt: undefined,
    waitedMs: undefined,
    outputChars: undefined,
    detail: undefined,
    spill: undefined,
    decision: undefined,
    ask: undefined,
    child: undefined,
    recall: undefined,
    ...told,
  };
}

function rows(...runs: readonly (ToolRun | "prose")[]): TranscriptEntry[] {
  return runs.map((run) =>
    run === "prose"
      ? ({ kind: "notice", level: "info", text: "said" } as TranscriptEntry)
      : ({ kind: "tool", run } as TranscriptEntry),
  );
}

const outside = { detail: ["Parts is outside in the top-right."] };

describe("a run of a creature's display-tool rows", () => {
  it("is every row of two or more in a row, headed by the first, and leaves a lone call as it is", () => {
    const runs = displayRuns(
      rows(ran("show"), "prose", ran("show"), ran("arrange"), ran("read"), ran("withdraw")),
    );
    expect([...runs.keys()]).toEqual([2, 3]);
    expect(runs.get(3)?.head).toBe(2);
    expect(runs.get(2)?.runs.map((run) => run.name)).toEqual(["show", "arrange"]);
  });

  it("leaves a call that waits on the keeper standing on its own, and gathers it once answered", () => {
    const waiting = rows(ran("show"), ran("show", "asking"), ran("show"));
    expect(displayRuns(waiting).size).toBe(0);
    const answered = rows(ran("show"), ran("show", "done"), ran("show"));
    expect(displayRuns(answered).get(0)?.runs).toHaveLength(3);
  });

  it("says what happened in the keeper's words, in the order it happened", () => {
    const nine = Array.from({ length: 9 }, () => ran("show", "done", outside));
    expect(displayRunLine(nine)).toBe("set out 9 things outside");
    expect(displayRunLine([...nine, ran("arrange")])).toBe(
      "set out 9 things outside · arranged them",
    );
    expect(displayRunLine([ran("withdraw"), ran("withdraw"), ran("shown")])).toBe(
      "took 2 back · looked over what is out",
    );
  });

  it("says outside only when every thing set out went there, and counts what did not go through", () => {
    const mixed = [ran("show", "done", outside), ran("show"), ran("show", "failed")];
    expect(displayRunLine(mixed)).toBe("set out 2 things · 1 did not go through");
    expect(displayRunLine([ran("show", "done", { args: '{"where":"outside"}' })])).toBe(
      "set out 1 thing outside",
    );
    expect(displayRunLine([ran("show", "running"), ran("show", "proposed")])).toBe(settingOutLine);
  });
});
