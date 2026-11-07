import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BusEnvelope, MemoryGarden, PendingAsk } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { heldChoreNeed } from "../panes/chores/testing.ts";
import { inertGarden } from "./memory-store.ts";
import { type NeedsYouItem, type NeedsYouKind, urgency, waitingKey } from "./needs-you.ts";
import {
  emptyWireLedger,
  foldWire,
  freshAsks,
  memoryItems,
  needsYouCount,
  reconcileAsks,
  reconcileChores,
  type WireLedger,
  wireItems,
} from "./needs-you-ledger.ts";
import { createNeedsYouQueue } from "./needs-you-queue.ts";
import { airlockItem, askItem, decidedItem, failedItem, inboxItem } from "./needs-you-testing.ts";

const workspace = "C:/work";

describe("asks on the wire", () => {
  it("rise on gate.ask with the tool's subject and fall on the gate.permission that answers it", () => {
    const first = ask("c1", "s1");
    const asked = fold([first, ask("c2", "s2")]);
    expect(wireItems(asked)).toEqual([
      {
        kind: "ask",
        key: "C:/work#ask:c1",
        workspace,
        since: first.ts,
        sessionId: "s1",
        callId: "c1",
        tool: "bash",
        subject: "rm -rf dist",
      },
      expect.objectContaining({ callId: "c2", sessionId: "s2" }),
    ]);
    const answered = fold([permission("c1")], asked);
    expect(wireItems(answered).map(callIdOf)).toEqual(["c2"]);
  });

  it("ignores a replayed ask and never revives one already answered", () => {
    expect(wireItems(fold([ask("c1", "s1", { replay: true })]))).toEqual([]);
    const answered = fold([ask("c1", "s1"), permission("c1")]);
    expect(wireItems(fold([ask("c1", "s1")], answered))).toEqual([]);
    const seeded = reconcileAsks(answered, workspace, [pending("c1"), pending("c2")]);
    expect(wireItems(seeded).map(callIdOf)).toEqual(["c2"]);
  });

  it("settles on a replayed gate.permission too, since an answer is an answer", () => {
    const asked = fold([ask("c1", "s1")]);
    expect(wireItems(fold([permission("c1", { replay: true })], asked))).toEqual([]);
  });

  it("seeds from GET /asks with the server's asked-at time", () => {
    const seeded = reconcileAsks(emptyWireLedger, workspace, [pending("c9")]);
    expect(wireItems(seeded)).toEqual([
      expect.objectContaining({ callId: "c9", since: "2026-10-15T09:59:00.000Z" }),
    ]);
  });

  it("drops on reconnect the asks the server no longer holds, keeping those that arrived meanwhile", () => {
    const before = fold([ask("c1", "s1"), ask("c2", "s1")]);
    const known = new Set(before.asks.keys());
    const meanwhile = fold([ask("c3", "s1")], before);
    const reconciled = reconcileAsks(meanwhile, workspace, [pending("c2")], known);
    expect(wireItems(reconciled).map(callIdOf)).toEqual(["c2", "c3"]);
  });

  it("hands back the very same ledger for a batch that moves nothing, so streaming costs nothing", () => {
    const asked = fold([ask("c1", "s1")]);
    const delta = {
      id: 500,
      ts: "2026-10-15T10:01:00.000Z",
      sessionId: "s1",
      type: "turn.delta",
      payload: { delta: { type: "text", text: "hello" } },
    } as BusEnvelope;
    expect(fold([delta, delta], asked)).toBe(asked);
  });

  it("names exactly the asks a batch brought, for the toast", () => {
    const before = fold([ask("c1", "s1")]);
    const after = fold([ask("c2", "s1"), ask("c3", "s2"), permission("c3")], before);
    expect(freshAsks(before, after).map((item) => item.callId)).toEqual(["c2"]);
  });
});

describe("failed turns on the wire", () => {
  it("records an engine.error inside a turn as that session's failed turn", () => {
    const error = engineError("s1", "provider answered 529\nretry later");
    const failed = fold([turnStarted("s1"), error]);
    expect(wireItems(failed)).toEqual([
      {
        kind: "failed",
        key: `C:/work#failed:s1:${error.id}`,
        workspace,
        since: error.ts,
        sessionId: "s1",
        message: "provider answered 529",
      },
    ]);
  });

  it("counts a failure even when the app attached mid-turn and never saw it start", () => {
    expect(wireItems(fold([engineError("s1", "boom")])).map((item) => item.kind)).toEqual([
      "failed",
    ]);
  });

  it("leaves out errors between turns, the process-level ones, and replayed history", () => {
    const settled = fold([turnStarted("s1"), turnCompleted("s1"), engineError("s1", "settle")]);
    expect(wireItems(settled)).toEqual([]);
    expect(wireItems(fold([engineError("", "listener threw")]))).toEqual([]);
    expect(wireItems(fold([engineError("s1", "old", { replay: true })]))).toEqual([]);
  });

  it("clears when the session starts its next turn or goes to the trash", () => {
    const failed = fold([engineError("s1", "boom"), engineError("s2", "boom")]);
    const retried = fold([turnStarted("s1")], failed);
    expect(wireItems(retried).map(sessionIdOf)).toEqual(["s2"]);
    const trashed = fold([removed("s2")], retried);
    expect(wireItems(trashed)).toEqual([]);
  });

  it("keys a later failure in the same session apart, so a dismissal does not hide it", () => {
    const first = fold([turnStarted("s1"), engineError("s1", "one")]);
    const second = fold([turnStarted("s1"), engineError("s1", "two")], first);
    expect(wireItems(first)[0]?.key).not.toBe(wireItems(second)[0]?.key);
  });
});

describe("decisions made for you on the wire", () => {
  it("open one item per keeper notice, keyed by its ledger id, carrying what overturns it", () => {
    const notice = keeperDecided("s5", "r7");
    expect(wireItems(fold([notice]))).toEqual([
      {
        kind: "decided",
        key: "C:/work#decided:r7",
        workspace,
        since: notice.ts,
        sessionId: "s5",
        recordId: "r7",
        ruleClass: "shell.read",
        tool: "bash",
        creature: "wren",
      },
    ]);
  });

  it("ignore a keeper notice missing its ledger id, and clear when the session goes", () => {
    const partial = envelope("extension.notice", "s5", {
      extension: "keeper",
      level: "info",
      message: "decided for you: bash (shell.read)",
      detail: { ruleClass: "shell.read", tool: "bash" },
    });
    expect(wireItems(fold([partial]))).toEqual([]);
    const decided = fold([keeperDecided("s5", "r7"), keeperDecided("s6", "r8")]);
    const removed = envelope("session.removed", "", { sessionId: "s5" });
    expect(wireItems(fold([removed], decided)).map((item) => item.key)).toEqual([
      "C:/work#decided:r8",
    ]);
  });
});

describe("memory items", () => {
  it("lists every proposal by its review title, and staged writes once at the threshold", () => {
    const staged = (id: string, hour: string) => ({
      id,
      kind: "note" as const,
      target: `entities/${id}.md`,
      created: `2026-10-15T${hour}:00:00.000Z`,
      content: "",
      source: "web:example.com",
    });
    const proposal = {
      id: "r1",
      key: "k",
      kind: "contradiction" as const,
      created: "2026-10-15T08:30:00.000Z",
      a: "fast",
      b: "slow",
      aProvenance: "agent" as const,
      bProvenance: "user" as const,
      confidence: 0.4,
    };
    const below: MemoryGarden = { ...inertGarden, inbox: [staged("w1", "08"), proposal] };
    expect(memoryItems(workspace, below, () => "never")).toEqual([
      expect.objectContaining({ itemId: "r1", title: "fast vs slow" }),
    ]);
    const atThreshold: MemoryGarden = {
      ...inertGarden,
      inbox: [staged("w1", "08"), staged("w2", "09"), staged("w3", "07"), proposal],
    };
    expect(memoryItems(workspace, atThreshold, () => "never")).toEqual([
      expect.objectContaining({ itemId: "r1", title: "fast vs slow" }),
      {
        kind: "inbox",
        key: "C:/work#inbox:staging",
        workspace,
        since: "2026-10-15T07:00:00.000Z",
        itemId: "w3",
        title: "3 staged from web:example.com wait for admit or drop",
      },
    ]);
  });

  it("makes one airlock item per waiting arc, counting only the undecided entries", () => {
    const garden: MemoryGarden = {
      ...inertGarden,
      airlocks: [
        {
          arc: "pricing",
          candidates: [
            candidate("a", "2026-10-15T07:00:00.000Z"),
            { ...candidate("b", "2026-10-15T06:00:00.000Z"), choice: "deliver" },
          ],
          questions: [{ title: "who owns tiers", provenance: "user" }],
        },
        { arc: "launch", candidates: [], questions: [] },
      ],
    };
    const seen: string[] = [];
    const items = memoryItems(workspace, garden, (key) => {
      seen.push(key);
      return "2026-10-15T11:00:00.000Z";
    });
    expect(items).toEqual([
      {
        kind: "airlock",
        key: "C:/work#airlock:pricing",
        workspace,
        since: "2026-10-15T06:00:00.000Z",
        arc: "pricing",
        candidates: 1,
        questions: 1,
      },
      expect.objectContaining({ arc: "launch", since: "2026-10-15T11:00:00.000Z", candidates: 0 }),
    ]);
    expect(seen).toEqual(["C:/work#airlock:launch"]);
  });
});

describe("the desk comes from the wire", () => {
  it("reaches every desk item kind through a route keywork serves or an event it emits", () => {
    const servedRoutes = Object.keys(
      recorded<{ paths: object }>("client/src/fixtures/doc.json").paths,
    );
    const emittedEvents = Object.keys(
      recorded<{ events: object }>("protocol/src/fixtures/event-shapes.json").events,
    );
    const garden: MemoryGarden = {
      ...inertGarden,
      inbox: ["w1", "w2", "w3"].map((id) => ({
        id,
        kind: "note" as const,
        target: `entities/${id}.md`,
        created: "2026-10-15T08:00:00.000Z",
        content: "",
      })),
      airlocks: [
        { arc: "pricing", candidates: [candidate("a", "2026-10-15T07:00:00.000Z")], questions: [] },
      ],
    };
    const ending = [turnStarted("s1"), engineError("s1", "provider answered 529 overloaded")];
    const needs = envelope("routine.needs", "", {
      creature: "wren",
      routineId: "stamp-note",
      items: [heldChoreNeed()],
    });
    const reaches: readonly { readonly via: string; readonly items: readonly NeedsYouItem[] }[] = [
      {
        via: "/asks",
        items: wireItems(reconcileAsks(emptyWireLedger, workspace, [pending("c1")])),
      },
      { via: "gate.ask", items: wireItems(fold([ask("c2", "s2")])) },
      { via: "engine.error", items: wireItems(fold(ending)) },
      {
        via: "/routines/needs-you",
        items: wireItems(reconcileChores(emptyWireLedger, workspace, [heldChoreNeed()])),
      },
      { via: "routine.needs", items: wireItems(fold([needs])) },
      { via: "extension.notice", items: wireItems(fold([reviewAsk("s3")])) },
      { via: "extension.notice", items: wireItems(fold([keeperDecided("s4", "r1")])) },
      { via: "/memory", items: memoryItems(workspace, garden, () => "2026-10-15T07:00:00.000Z") },
    ];
    const served = new Set([...servedRoutes, ...emittedEvents]);
    for (const kind of Object.keys(urgency)) {
      const ways = reaches
        .filter(({ via, items }) => served.has(via) && items.some((item) => item.kind === kind))
        .map(({ via }) => via);
      expect({ kind, reached: ways.length > 0 }).toEqual({ kind, reached: true });
    }
  });
});

let nextId = 1;

function reviewAsk(sessionId: string): BusEnvelope {
  const verdict = {
    index: 2,
    entryId: "e9",
    at: "2026-10-15T09:00:00.000Z",
    path: "src/a.ts",
    header: "@@ -1,3 +1,4 @@",
    digest: "a1b2c3d4",
    verdict: "ask" as const,
  };
  return envelope("extension.notice", sessionId, {
    extension: "review",
    level: "info",
    message: "ask · src/a.ts @@ -1,3 +1,4 @@ · hunk a1b2c3d4",
    detail: { verdict, entryId: "e9" },
  });
}

function keeperDecided(sessionId: string, recordId: string): BusEnvelope {
  return envelope("extension.notice", sessionId, {
    extension: "keeper",
    level: "info",
    message: `decided for you: bash (shell.read) · overturn it with POST /creatures/{slug}/overturn { recordId: "${recordId}" }`,
    detail: { recordId, ruleClass: "shell.read", callId: "c9", tool: "bash", creature: "wren" },
  });
}

function fold(envelopes: BusEnvelope[], from: WireLedger = emptyWireLedger): WireLedger {
  return foldWire(from, workspace, envelopes);
}

function callIdOf(item: { kind: string } & Partial<{ callId: string }>): string | undefined {
  return item.callId;
}

function sessionIdOf(item: { kind: string } & Partial<{ sessionId: string }>): string | undefined {
  return item.sessionId;
}

function envelope<T extends BusEnvelope["type"]>(
  type: T,
  sessionId: string,
  payload: BusEnvelope<T>["payload"],
): BusEnvelope {
  const id = nextId++;
  return {
    id,
    ts: new Date(Date.UTC(2026, 9, 15, 10) + id * 1000).toISOString(),
    sessionId,
    type,
    payload,
  } as BusEnvelope;
}

function ask(callId: string, sessionId: string, options: { replay?: boolean } = {}): BusEnvelope {
  return envelope("gate.ask", sessionId, {
    ask: { tool: "bash", callId, arguments: { command: "rm -rf dist" }, rule: "default" },
    ...(options.replay === true && { replay: true }),
  });
}

function permission(callId: string, options: { replay?: boolean } = {}): BusEnvelope {
  return envelope("gate.permission", "s1", {
    decision: { tool: "bash", callId, verdict: "granted", gate: "user" },
    ...(options.replay === true && { replay: true }),
  });
}

function turnStarted(sessionId: string): BusEnvelope {
  return envelope("turn.started", sessionId, { userText: "go" });
}

function turnCompleted(sessionId: string): BusEnvelope {
  return envelope("turn.completed", sessionId, {
    message: { role: "assistant", parts: [] },
    usage: { inputTokens: 1, outputTokens: 1 },
  });
}

function engineError(
  sessionId: string,
  message: string,
  options: { replay?: boolean } = {},
): BusEnvelope {
  return envelope("engine.error", sessionId, {
    error: { name: "Error", message },
    ...(options.replay === true && { replay: true }),
  });
}

function removed(sessionId: string): BusEnvelope {
  return envelope("session.removed", "", { sessionId });
}

function pending(callId: string): PendingAsk {
  return {
    sessionId: "s1",
    callId,
    tool: "bash",
    arguments: { command: "rm -rf dist" },
    askedAt: "2026-10-15T09:59:00.000Z",
  };
}

function candidate(note: string, created: string) {
  return {
    note,
    title: note,
    provenance: "agent" as const,
    eligible: true,
    shortfalls: [],
    created,
  };
}

function recorded<Shape>(path: string): Shape {
  return JSON.parse(readFileSync(join(process.cwd(), "packages", path), "utf8")) as Shape;
}

describe("one count for every surface", () => {
  const oneOfEach: Readonly<Record<NeedsYouKind, NeedsYouItem>> = {
    ask: askItem("call-1"),
    airlock: airlockItem("docs"),
    inbox: inboxItem("note-1"),
    failed: failedItem("s2"),
    review: {
      kind: "review",
      key: waitingKey(workspace, "review", "s3:8749c9da"),
      workspace,
      since: "2026-11-06T16:04:26.000Z",
      sessionId: "s3",
      path: "notes/largest.md",
      header: "@@ -0,0 +1,7 @@",
      digest: "8749c9da",
    },
    chore: {
      kind: "chore",
      key: waitingKey(workspace, "chore", "hal/stamp-note"),
      workspace,
      since: "2026-11-06T15:36:34.000Z",
      creature: "hal",
      routineId: "stamp-note",
      need: "grants",
      reason: "accept the write grant set 6fb077b991a5dabf",
      runId: "r-1",
      digest: "6fb077b991a5dabf",
    },
    decided: decidedItem("record-1"),
  };

  it("counts every kind the desk lists, review and decided included, once each", () => {
    for (const [kind, item] of Object.entries(oneOfEach)) {
      expect([kind, needsYouCount([item])]).toEqual([kind, 1]);
    }
    const all = Object.values(oneOfEach);
    expect(needsYouCount(all)).toBe(Object.keys(urgency).length);
    expect(needsYouCount([...all, oneOfEach.review])).toBe(all.length);
  });

  it("is the count the desk's queue reports", () => {
    createRoot((dispose) => {
      const queue = createNeedsYouQueue();
      const items = Object.values(oneOfEach);
      queue.attach({
        workspace,
        items: () => items,
        onArrival: () => () => undefined,
        sessionName: (sessionId) => sessionId,
        dispose: () => undefined,
      });
      expect(queue.count()).toBe(needsYouCount(items));
      expect(queue.count()).toBe(7);
      dispose();
    });
  });
});
