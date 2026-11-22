import type { SessionSummary } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { orderNeedsYou } from "../../shell/needs-you.ts";
import {
  airlockItem,
  askItem,
  decidedItem,
  failedItem,
  inboxItem,
} from "../../shell/needs-you-testing.ts";
import {
  type DecisionOverturning,
  type DeskRow,
  type DeskSources,
  decidedOfRow,
  deskGroups,
  deskHead,
  deskRows,
  nextWaiting,
  overturnDecided,
  overturnHint,
  rowAge,
  workspaceName,
} from "./desk.ts";

const now = Date.parse("2026-10-15T16:00:00.000Z");

describe("a decision made for you on the desk", () => {
  function overturning(
    answer: Awaited<ReturnType<DecisionOverturning["overturnCreatureDecision"]>>,
  ) {
    const calls: [string, string][] = [];
    const client: DecisionOverturning = {
      overturnCreatureDecision: async (slug, recordId) => {
        calls.push([slug, recordId]);
        return answer;
      },
    };
    return { client, calls };
  }

  it("waits last on the desk and offers the one key that overturns it", () => {
    const waiting = orderNeedsYou([decidedItem("r1"), askItem("c1"), failedItem("s4")]);
    const rows = deskRows(deskGroups(sources({ waiting })));
    expect(rows.map((row) => (row.kind === "waiting" ? row.item.kind : row.kind))).toEqual([
      "ask",
      "failed",
      "decided",
    ]);
    expect(decidedOfRow(rows[2])?.recordId).toBe("r1");
    expect(decidedOfRow(rows[0])).toBeUndefined();
    expect(overturnHint(keys)).toBe(
      "x overturns it and its class waits for you again · d lets it stand",
    );
  });

  it("overturns through the creature's route and names the class that waits again", async () => {
    const { client, calls } = overturning({
      overturned: true,
      recordId: "r1",
      ruleClass: "shell.read",
      demoted: [],
    });
    expect(await overturnDecided(client, decidedItem("r1"))).toEqual({
      overturned: true,
      line: "overturned · every shell.read ask waits for you again",
    });
    expect(calls).toEqual([["wren", "r1"]]);
  });

  it("says why a decision was not overturned, and never calls without a creature", async () => {
    const twice = overturning({ overturned: false, reason: "already-overturned" });
    expect(await overturnDecided(twice.client, decidedItem("r1"))).toEqual({
      overturned: false,
      line: "already overturned · its class already waits for you",
    });
    const refused = overturning({ refused: "failed", detail: "the server answered 500" });
    expect((await overturnDecided(refused.client, decidedItem("r1"))).line).toBe(
      "not overturned · the server answered 500",
    );
    const nameless = overturning({ overturned: false, reason: "not-decided-for-you" });
    expect(
      await overturnDecided(nameless.client, decidedItem("r2", { creature: undefined })),
    ).toMatchObject({ overturned: false });
    expect(nameless.calls).toEqual([]);
  });
});

describe("the desk's groups", () => {
  it("orders needs you, working, back and quiet, and drops the empty ones", () => {
    const groups = deskGroups(
      sources({
        waiting: [askItem("c1", { sessionId: "asking" })],
        sessions: [summary("asking"), summary("idle"), summary("back"), summary("hushed")],
        unread: ["back"],
        quiet: ["hushed"],
      }),
    );
    expect(groups.map((group) => [group.name, keysOf(group.rows)])).toEqual([
      ["needs you", ["C:/work#ask:c1"]],
      ["back", ["session:back"]],
      ["quiet", ["session:hushed"]],
    ]);
  });

  it("keeps the queue's order for everything waiting, airlock, inbox and failed turns included", () => {
    const waiting = orderNeedsYou([
      failedItem("s4"),
      inboxItem("m1"),
      askItem("c1"),
      airlockItem("pricing"),
    ]);
    const [needsYou] = deskGroups(sources({ waiting }));
    expect(
      needsYou?.rows.map((row) => (row.kind === "waiting" ? row.item.kind : row.kind)),
    ).toEqual(["ask", "airlock", "inbox", "failed"]);
  });

  it("lists a session once: waiting wins, then quiet, then working, then back", () => {
    const groups = deskGroups(
      sources({
        waiting: [failedItem("failing")],
        sessions: [summary("failing"), summary("hushed-working"), summary("working")],
        working: ["failing", "hushed-working", "working"],
        unread: ["working"],
        quiet: ["failing", "hushed-working"],
      }),
    );
    expect(groups.map((group) => [group.name, keysOf(group.rows)])).toEqual([
      ["needs you", ["C:/work#failed:failing:9"]],
      ["working", ["session:working"]],
      ["quiet", ["session:hushed-working"]],
    ]);
  });

  it("puts the latest activity first in every session group", () => {
    const groups = deskGroups(
      sources({
        sessions: [summary("earlier", 30), summary("later", 5), summary("between", 12)],
        working: ["earlier", "later", "between"],
      }),
    );
    expect(keysOf(groups[0]?.rows ?? [])).toEqual([
      "session:later",
      "session:between",
      "session:earlier",
    ]);
  });

  it("numbers each group's first row in the flat list the cursor walks", () => {
    const groups = deskGroups(
      sources({
        waiting: [askItem("c1"), askItem("c2")],
        sessions: [summary("a"), summary("b")],
        working: ["a"],
        unread: ["b"],
      }),
    );
    expect(groups.map((group) => group.first)).toEqual([0, 2, 3]);
  });

  it("heads each workspace's waiting rows only when more than one workspace waits", () => {
    const single = deskRows(deskGroups(sources({ waiting: [askItem("a"), askItem("b")] })));
    expect(single.map(headingOf)).toEqual([undefined, undefined]);
    const several = deskRows(
      deskGroups(
        sources({
          waiting: [askItem("a"), askItem("b", { workspace: "D:/side/tools" }), inboxItem("m")],
        }),
      ),
    );
    expect(several.map(headingOf)).toEqual(["work", undefined, "tools"]);
    expect(keysOf(several)).toEqual(["C:/work#ask:a", "C:/work#inbox:m", "D:/side/tools#ask:b"]);
    expect(workspaceName("C:\\src\\keywork-app")).toBe("keywork-app");
    expect(workspaceName("/home/me/tool/")).toBe("tool");
  });
});

describe("tab, the next waiting row", () => {
  const rows = deskRows(
    deskGroups(
      sources({
        waiting: [askItem("c1"), askItem("c2")],
        sessions: [summary("a")],
        working: ["a"],
      }),
    ),
  );

  it("walks the waiting rows and wraps to the first", () => {
    expect(nextWaiting(rows, 0)).toBe(1);
    expect(nextWaiting(rows, 1)).toBe(0);
    expect(nextWaiting(rows, 2)).toBe(0);
  });
});

describe("the desk's words", () => {
  it("heads the pane with the sessions, what waits, what works off the queue, and the spend", () => {
    const head = deskHead(
      sources({
        waiting: [askItem("c1", { sessionId: "asking" }), inboxItem("m1")],
        sessions: [summary("asking", 1, 42), summary("busy", 1, 31), summary("idle", 1, 82)],
        working: ["asking", "busy"],
      }),
    );
    expect(head).toBe("3 sessions · 2 need you · 1 working · $1.55");
    expect(deskHead(sources({ sessions: [summary("a")] }))).toBe("1 session");
  });

  it("counts a waiting row's age as its wait, and a session's from its last activity", () => {
    const rows = deskRows(
      deskGroups(
        sources({
          waiting: [
            askItem("c1", { since: minutesAgo(6) }),
            askItem("c2", { since: minutesAgo(0) }),
            failedItem("s4", { since: minutesAgo(18) }),
          ],
          sessions: [summary("a", 60)],
          working: ["a"],
        }),
      ),
    );
    expect(rows.map((row) => rowAge(row, now))).toEqual(["waiting 6m", "now", "waiting 18m", "1h"]);
  });
});

const keys = {
  down: "j",
  up: "k",
  open: "enter",
  dismiss: "d",
  waiting: "tab",
  overturn: "x",
  approve: "y",
  once: "o",
  session: "s",
  workspace: "w",
  deny: "n",
};

interface Staged {
  waiting?: DeskSources["waiting"];
  sessions?: SessionSummary[];
  working?: string[];
  unread?: string[];
  quiet?: string[];
}

function sources(staged: Staged): DeskSources {
  return {
    waiting: staged.waiting ?? [],
    sessions: staged.sessions ?? [],
    working: (id) => staged.working?.includes(id) === true,
    unread: (summary) => staged.unread?.includes(summary.id) === true,
    quiet: (id) => staged.quiet?.includes(id) === true,
  };
}

function summary(id: string, minutes = 1, cents?: number): SessionSummary {
  const at = minutesAgo(minutes);
  return {
    id,
    title: id,
    createdAt: at,
    lastActivityAt: at,
    messageCount: 2,
    ...(cents === undefined ? {} : { costNanos: cents * 10_000_000 }),
  };
}

function minutesAgo(minutes: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

function keysOf(rows: readonly DeskRow[]): string[] {
  return rows.map((row) => row.key);
}

function headingOf(row: DeskRow): string | undefined {
  return row.kind === "waiting" ? row.heading : undefined;
}
