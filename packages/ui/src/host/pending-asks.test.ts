import type { BatchListener } from "@keywork-app/client";
import type { BusEnvelope, PendingAsk } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  askReason,
  emptyTally,
  foldAsks,
  type PendingAskSeams,
  reportPendingAsks,
  seededTally,
} from "./pending-asks.ts";
import type { HostNotice } from "./port.ts";

describe("the pending-ask tally", () => {
  it("rises on gate.ask and falls on the gate.permission that answers it", () => {
    const asked = foldAsks(emptyTally, [ask("c1"), ask("c2")]);
    expect(asked.waiting.size).toBe(2);
    const answered = foldAsks(asked, [permission("c1")]);
    expect([...answered.waiting]).toEqual(["c2"]);
  });

  it("ignores replayed asks and never revives an ask already answered", () => {
    expect(foldAsks(emptyTally, [ask("c1", { replay: true })]).waiting.size).toBe(0);
    const answered = foldAsks(emptyTally, [ask("c1"), permission("c1")]);
    expect(seededTally(answered, [pending("c1"), pending("c2")]).waiting).toEqual(new Set(["c2"]));
  });
});

describe("reportPendingAsks", () => {
  it("reports the count once per frame batch, only when it changes, and notifies each live ask", async () => {
    const harness = reporting([pending("seeded")]);
    await settle();
    expect(harness.reported).toEqual([1]);

    harness.deliver([ask("c1", { sessionId: "s1" }), ask("c2")]);
    harness.deliver([permission("seeded")]);
    harness.deliver([permission("c1"), permission("c2")]);
    harness.deliver([permission("c2")]);
    expect(harness.reported).toEqual([1, 3, 2, 0]);
    expect(harness.notices).toEqual([
      {
        title: "fix the tray",
        body: askReason,
        trigger: { kind: "ask", workspace: "/work", sessionId: "s1", callId: "c1" },
      },
      {
        title: "keywork",
        body: askReason,
        trigger: { kind: "ask", workspace: "/work", sessionId: "s2", callId: "c2" },
      },
    ]);
  });

  it("clears the tray mark when the workspace closes with asks still pending", async () => {
    const harness = reporting([]);
    harness.deliver([ask("c1")]);
    harness.stop();
    await settle();
    expect(harness.reported).toEqual([1, 0]);
    expect(harness.listening()).toBe(false);
  });
});

function reporting(seed: readonly PendingAsk[]) {
  const reported: number[] = [];
  const notices: HostNotice[] = [];
  const listeners = new Set<BatchListener>();
  const seams: PendingAskSeams = {
    feed: {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    asks: async () => seed,
    host: {
      setPendingAsks: async (count) => {
        reported.push(count);
      },
      notify: async (notice) => {
        notices.push(notice);
      },
    },
    workspace: "/work",
    titleOf: (sessionId) => (sessionId === "s1" ? "fix the tray" : undefined),
  };
  const stop = reportPendingAsks(seams);
  return {
    reported,
    notices,
    stop,
    listening: () => listeners.size > 0,
    deliver: (envelopes: readonly BusEnvelope[]) => {
      for (const listener of listeners) listener(envelopes);
    },
  };
}

let nextId = 1;

function ask(callId: string, options: { sessionId?: string; replay?: boolean } = {}): BusEnvelope {
  return {
    id: nextId++,
    ts: "2026-10-10T00:00:00.000Z",
    sessionId: options.sessionId ?? "s2",
    type: "gate.ask",
    payload: {
      ask: { tool: "bash", callId, arguments: {}, rule: "default" },
      ...(options.replay === true && { replay: true }),
    },
  };
}

function permission(callId: string): BusEnvelope {
  return {
    id: nextId++,
    ts: "2026-10-10T00:00:01.000Z",
    sessionId: "s2",
    type: "gate.permission",
    payload: { decision: { tool: "bash", callId, verdict: "granted", gate: "user" } },
  };
}

function pending(callId: string): PendingAsk {
  return { sessionId: "s2", callId, tool: "bash", arguments: {}, askedAt: "2026-10-10T00:00:00Z" };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
