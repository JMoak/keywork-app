import { emptyProjection, projectAll } from "@keywork-app/client";
import type { BusEnvelope, SessionSummary } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { orderNeedsYou } from "../../shell/needs-you.ts";
import { airlockItem, askItem, failedItem, inboxItem } from "../../shell/needs-you-testing.ts";
import {
  currentStep,
  type DeskRow,
  type DeskSources,
  deskDismissNotice,
  deskGroups,
  deskHead,
  deskHint,
  deskRows,
  deskTitle,
  nextWaiting,
  rowAge,
  workspaceName,
} from "./desk.ts";

const now = Date.parse("2026-10-15T16:00:00.000Z");

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

  it("says what each session is doing through its lifecycle state", () => {
    const rows = deskRows(
      deskGroups(
        sources({
          sessions: [summary("working"), summary("back"), summary("hushed")],
          working: ["working"],
          unread: ["back"],
          quiet: ["hushed"],
        }),
      ),
    );
    expect(rows.map((row) => (row.kind === "session" ? row.state : row.kind))).toEqual([
      "working",
      "finished-unseen",
      "idle",
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

  it("has nowhere to go when nothing waits", () => {
    expect(nextWaiting(deskRows(deskGroups(sources({ sessions: [summary("a")] }))), 0)).toBe(
      undefined,
    );
  });
});

describe("the desk's words", () => {
  it("titles the pane with the count fact", () => {
    expect(deskTitle(0)).toBe("desk");
    expect(deskTitle(1)).toBe("desk · 1 needs you");
    expect(deskTitle(3)).toBe("desk · 3 need you");
  });

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

  it("names every key from the keymap", () => {
    expect(deskHint(keys)).toBe(
      "j k move · enter goes there · y o s w n answer an ask · d dismisses · tab next waiting",
    );
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

  it("dismisses in the words each row deserves", () => {
    const rows = deskRows(
      deskGroups(
        sources({
          waiting: [askItem("c1"), failedItem("s4")],
          sessions: [summary("w", 1), summary("b", 2), summary("q", 3)],
          working: ["w"],
          unread: ["b"],
          quiet: ["q"],
        }),
      ),
    );
    expect(rows.map((row) => deskDismissNotice(row, keys))).toEqual([
      "an ask is answered, never dismissed · y or n answers it here",
      "dismissed · the transcript keeps the failure",
      "a working session waits on nothing · it comes back when it finishes",
      "marked read · the sessions tree still lists it",
      "nothing to dismiss · quiet keeps it on the desk until quiet ends",
    ]);
  });

  it("tails a working session with its live tool row, or says it is thinking", () => {
    const started = envelope(1, "turn.started", { userText: "go" });
    const call = { type: "tool-call", callId: "t1", name: "read", arguments: { path: "plan.md" } };
    const running = envelope(2, "tool.started", { call });
    expect(currentStep(projectAll(emptyProjection, [started]))).toBe("thinking");
    expect(currentStep(projectAll(emptyProjection, [started, running]))).toBe(
      "read plan.md · running",
    );
  });
});

const keys = {
  down: "j",
  up: "k",
  open: "enter",
  dismiss: "d",
  waiting: "tab",
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

function envelope(id: number, type: string, payload: unknown): BusEnvelope {
  return { id, ts: minutesAgo(0), sessionId: "s1", type, payload } as BusEnvelope;
}
