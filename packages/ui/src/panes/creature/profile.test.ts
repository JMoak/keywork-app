import type { Thread } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import {
  choresOf,
  creatureFilePath,
  liveState,
  nextChore,
  parseModelReference,
  pausePlan,
  plainName,
  policyRows,
  rememberedRows,
  shadowRows,
  threadRows,
  usageRows,
  weekMs,
} from "./profile.ts";
import {
  minutesAgo,
  wrenChild,
  wrenDetail,
  wrenReport,
  wrenRoutines,
  wrenRows,
} from "./testing.ts";

const now = Date.UTC(2026, 10, 5, 12, 0, 0);

function emptyThread(id: string, at: string): Thread {
  return {
    id,
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
    lastActivityAt: at,
    viewedAt: undefined,
    removed: false,
  };
}

describe("thread rows", () => {
  it("group the conversation first, then threads newest first, then children rolled up under them", () => {
    const rows = threadRows(wrenDetail(now), {
      rows: wrenRows(now),
      childrenOf: (parent) => (parent === "t1" ? [wrenChild] : []),
      liveThread: () => undefined,
    });
    expect(rows.map((row) => [row.group, row.id, row.title, row.state, row.children])).toEqual([
      ["conversation", "t0", "conversation", "idle", 0],
      ["threads", "t1", "docs index", "working", 1],
      ["threads", "t2", "nightly tests", "blocked", 0],
      ["children", "c1", "lint sweep", "completed", 0],
    ]);
    expect(rows.map((row) => row.costNanos)).toEqual([
      120_000_000, 300_000_000, 40_000_000, 10_000_000,
    ]);
    expect(rows[3]?.parent).toBe("t1");
  });

  it("let the bus overrule the wire snapshot of a thread's state", () => {
    const at = minutesAgo(1, now);
    const asking = {
      ...emptyThread("t1", at),
      asks: { k1: { callId: "k1", tool: "bash", subject: "bun test", askedAt: at } },
    };
    const rows = threadRows(wrenDetail(now), {
      rows: wrenRows(now),
      childrenOf: () => [],
      liveThread: (id) => (id === "t1" ? asking : undefined),
    });
    expect(rows[1]?.state).toBe("waiting");
    expect(liveState(undefined)).toBeUndefined();
    expect(
      liveState({ ...emptyThread("x", at), failure: { at, eventId: 1, message: "boom" } }),
    ).toBe("blocked");
    expect(
      liveState({
        ...emptyThread("x", at),
        waiting: { reason: "rate-limited", since: at, until: undefined },
      }),
    ).toBe("paused");
    expect(
      liveState({
        ...emptyThread("x", at),
        turn: { startedAt: at, lastProgressAt: at, tool: undefined, stumbledAt: undefined },
      }),
    ).toBe("working");
    expect(liveState({ ...emptyThread("x", at), back: { at, preview: "done", changes: [] } })).toBe(
      "back",
    );
    expect(liveState(emptyThread("x", at))).toBeUndefined();
  });
});

describe("usage rows", () => {
  it("take today from the wire and count this week's sessions from the rows, naming the unpriced ones", () => {
    const rows = usageRows(wrenDetail(now), wrenRows(now), now);
    expect(rows).toEqual([
      { period: "today", sessions: 3, costNanos: 460_000_000, unpriced: 0 },
      { period: "week", sessions: 4, costNanos: 460_000_000, unpriced: 1 },
    ]);
    expect(weekMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("show the week as unpriced, never zero, when no row carries a cost", () => {
    const rows = wrenRows(now)
      .filter((row) => row.bot === "wren")
      .map(({ costNanos: _, ...row }) => row);
    expect(usageRows(wrenDetail(now), rows, now)[1]).toEqual({
      period: "week",
      sessions: 4,
      costNanos: null,
      unpriced: 4,
    });
  });
});

describe("the policy, the firsts and the shadow report", () => {
  it("list every class with inherit shown as inherit", () => {
    expect(policyRows(wrenDetail(now).models).map((row) => [row.modelClass, row.line])).toEqual([
      ["strong", "anthropic/claude-sonnet-4-5"],
      ["loop", "inherit · workspace, then user"],
      ["decide", "ollama/qwen3:8b"],
      ["vision", "inherit · workspace, then user"],
    ]);
  });

  it("keep only this creature's landmarks, oldest first, each with the first it stands for", () => {
    const rows = rememberedRows(
      [
        { kind: "tree", creature: "wren", at: "2026-11-03T10:00:00.000Z", evidence: "thread:s1" },
        {
          kind: "workshop",
          creature: "wren",
          at: "2026-11-01T09:00:00.000Z",
          evidence: "creature:wren",
        },
        { kind: "well", creature: "tam", at: "2026-11-02T09:00:00.000Z", evidence: "night:1" },
      ],
      "wren",
    );
    expect(rows.map((row) => [row.at.slice(0, 10), row.line, row.kind])).toEqual([
      ["2026-11-01", "the workshop was raised", "workshop"],
      ["2026-11-03", "the first crate delivered planted the tree", "tree"],
    ]);
  });

  it("summarise the shadow report per rule class without ever enforcing anything", () => {
    const report = wrenReport();
    expect(report.enforced).toBe(false);
    expect(shadowRows(report).map((row) => [row.ruleClass, row.agreement, row.oneWayDoor])).toEqual(
      [
        ["bash", 0.92, false],
        ["rm", 1, true],
      ],
    );
  });
});

describe("chores and the pause plan", () => {
  it("turn routine rows into chores with the next run only while the schedule fires", () => {
    const chores = choresOf(wrenRoutines(now));
    expect(chores.map((chore) => [chore.id, chore.title, chore.nextAt])).toEqual([
      ["nightly", "nightly tests", "2026-11-06T02:00:00.000Z"],
      ["tidy", "storehouse tidy", undefined],
    ]);
    expect(nextChore(chores)?.id).toBe("nightly");
    expect(choresOf([{ ...wrenRoutines()[0], routine: null } as never])).toEqual([]);
  });

  it("pause what fires, resume everything readable once nothing fires, and do nothing with no chores", () => {
    const firing = pausePlan(wrenRoutines());
    expect(firing.kind).toBe("pause");
    expect(firing.kind === "pause" && firing.targets.map((row) => row.id)).toEqual(["nightly"]);
    const quiet = pausePlan(
      wrenRoutines().map((row) => ({ ...row, schedule: { ...row.schedule, enabled: false } })),
    );
    expect(quiet.kind === "resume" && quiet.targets.map((row) => row.id)).toEqual([
      "nightly",
      "tidy",
    ]);
    expect(pausePlan([])).toEqual({ kind: "none" });
  });
});

describe("what the keeper types", () => {
  it("reads provider/model or inherit, and refuses anything else", () => {
    expect(parseModelReference("")).toBe("inherit");
    expect(parseModelReference(" inherit ")).toBe("inherit");
    expect(parseModelReference("ollama/qwen3:8b")).toEqual({
      provider: "ollama",
      model: "qwen3:8b",
    });
    expect(parseModelReference("openrouter/meta/llama")).toEqual({
      provider: "openrouter",
      model: "meta/llama",
    });
    expect(parseModelReference("ollama")).toBeUndefined();
    expect(parseModelReference("/qwen")).toBeUndefined();
    expect(parseModelReference("ollama/")).toBeUndefined();
  });

  it("keeps a plain name to one line of at most sixty-four characters", () => {
    expect(plainName("  Wren  ")).toBe("Wren");
    expect(plainName("Tam\nMoss")).toBe("Tam Moss");
    expect(plainName("")).toBeUndefined();
    expect(plainName("x".repeat(65))).toBeUndefined();
    expect(creatureFilePath("wren")).toBe(".keywork/bots/wren/creature.json");
  });
});
