import type { BusEnvelope, MemoryGarden, PendingAsk } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { inertGarden } from "./memory-store.ts";
import {
  emptyWireLedger,
  foldWire,
  freshAsks,
  memoryItems,
  reconcileAsks,
  type WireLedger,
  wireItems,
} from "./needs-you-ledger.ts";

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

describe("memory items", () => {
  it("lists every inbox item by its review title and its created time", () => {
    const garden: MemoryGarden = {
      ...inertGarden,
      inbox: [
        {
          id: "w1",
          kind: "note",
          target: "entities/pricing.md",
          created: "2026-10-15T08:00:00.000Z",
          content: "",
        },
        {
          id: "r1",
          key: "k",
          kind: "contradiction",
          created: "2026-10-15T08:30:00.000Z",
          a: "fast",
          b: "slow",
          aProvenance: "agent",
          bProvenance: "user",
          confidence: 0.4,
        },
      ],
    };
    expect(memoryItems(workspace, garden, () => "never")).toEqual([
      {
        kind: "inbox",
        key: "C:/work#inbox:w1",
        workspace,
        since: "2026-10-15T08:00:00.000Z",
        itemId: "w1",
        title: "entities/pricing.md",
      },
      expect.objectContaining({ itemId: "r1", title: "fast vs slow" }),
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

let nextId = 1;

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
