import type { KeyworkClient, ServerFeed, StreamNotice } from "@keywork-app/client";
import type { BusEnvelope, InboxItem, MemoryGarden } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import recordedEvents from "../../../client/src/fixtures/memory.jsonl?raw";
import recordedGarden from "../../../client/src/fixtures/memory-garden.json";
import { createMemoryStore, inboxAfter, inboxTallyOf, inertGarden } from "./memory-store.ts";

export type MemoryClient = Pick<
  KeyworkClient,
  | "memory"
  | "memoryInbox"
  | "approveStagedItem"
  | "discardStagedItem"
  | "memoryNotes"
  | "memoryNote"
  | "memoryDailyDates"
  | "memoryDaily"
  | "memoryLedger"
  | "revertLedgerEntry"
  | "askMemory"
  | "arcAirlock"
  | "triageAirlockCandidate"
  | "triageAirlockQuestion"
  | "deliverAirlockEligible"
  | "finishArcAirlock"
>;

export function inertMemoryClient(): MemoryClient {
  return {
    memory: async () => inertGarden,
    memoryInbox: async () => ({ trusted: false, items: [], count: 0 }),
    approveStagedItem: async () => "inert",
    discardStagedItem: async () => "inert",
    memoryNotes: async () => ({ trusted: false, notes: [] }),
    memoryNote: async () => ({ trusted: false, note: null }),
    memoryDailyDates: async () => ({ trusted: false, dates: [] }),
    memoryDaily: async (date) => ({ trusted: false, date, entries: [] }),
    memoryLedger: async () => ({ trusted: false, entries: [] }),
    revertLedgerEntry: async () => "inert",
    askMemory: async () => ({ trusted: false, hits: [], source: "lexical" }),
    arcAirlock: async () => ({ trusted: false, digest: null }),
    triageAirlockCandidate: async () => "inert",
    triageAirlockQuestion: async () => "inert",
    deliverAirlockEligible: async () => "inert",
    finishArcAirlock: async () => "inert",
  };
}

export function stagedNote(id: string, target: string): InboxItem {
  return { id, kind: "note", target, created: "2026-09-07T12:00:00.000Z", content: "body" };
}

export function inboxEnvelope(id: number, count: number, kinds: Record<string, number>) {
  return {
    id,
    ts: "2026-09-07T12:00:01.000Z",
    sessionId: "",
    type: "memory.inbox",
    payload: { count, kinds },
  } satisfies BusEnvelope;
}

export function feedOf(): ServerFeed & {
  push(envelopes: readonly BusEnvelope[]): void;
  connect(): void;
} {
  const listeners = new Set<(envelopes: readonly BusEnvelope[]) => void>();
  const noticeListeners = new Set<(notice: StreamNotice) => void>();
  return {
    open: async () => undefined,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeSession: () => () => undefined,
    onNotice: (listener) => {
      noticeListeners.add(listener);
      return () => noticeListeners.delete(listener);
    },
    whenLost: () => () => undefined,
    close: () => undefined,
    push: (envelopes) => {
      for (const listener of [...listeners]) listener(envelopes);
    },
    connect: () => {
      for (const listener of [...noticeListeners]) listener({ kind: "connected" });
    },
  };
}

function trustedGarden(inbox: InboxItem[]): MemoryGarden {
  return { ...inertGarden, trusted: true, inbox };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("inbox tallies", () => {
  it("counts the garden's inbox by kind", () => {
    expect(inboxTallyOf(trustedGarden([stagedNote("a", "A.md"), stagedNote("b", "B.md")]))).toEqual(
      { count: 2, kinds: { note: 2 } },
    );
  });

  it("folds a stream to the last memory.inbox payload and keeps the tally when none arrives", () => {
    const start = { count: 3, kinds: { note: 3 } };
    expect(
      inboxAfter(start, [inboxEnvelope(5, 2, { note: 2 }), inboxEnvelope(6, 1, { note: 1 })]),
    ).toEqual({ count: 1, kinds: { note: 1 } });
    expect(
      inboxAfter(start, [
        { id: 7, ts: "t", sessionId: "s1", type: "session.mode", payload: { mode: "agent" } },
      ]),
    ).toBe(start);
  });
});

describe("the memory store", () => {
  it("loads the garden on refresh and announces the inbox count once per change", async () => {
    const garden = trustedGarden([stagedNote("a", "A.md")]);
    const client = { ...inertMemoryClient(), memory: async () => garden } as KeyworkClient;
    await createRoot(async (dispose) => {
      const store = createMemoryStore(client, feedOf());
      const announced: number[] = [];
      store.onInbox((count) => announced.push(count));
      expect(store.state.loaded).toBe(false);
      await store.refresh();
      await store.refresh();
      expect(store.state.loaded).toBe(true);
      expect(store.state.garden.trusted).toBe(true);
      expect(store.state.inbox).toEqual({ count: 1, kinds: { note: 1 } });
      expect(announced).toEqual([1]);
      dispose();
    });
  });

  it("takes the count from memory.inbox and refetches the garden on it", async () => {
    let inbox = [stagedNote("a", "A.md"), stagedNote("b", "B.md")];
    let reads = 0;
    const client = {
      ...inertMemoryClient(),
      memory: async () => {
        reads += 1;
        return trustedGarden(inbox);
      },
    } as KeyworkClient;
    const feed = feedOf();
    await createRoot(async (dispose) => {
      const store = createMemoryStore(client, feed);
      await store.refresh();
      inbox = [stagedNote("b", "B.md")];
      feed.push([inboxEnvelope(9, 1, { note: 1 })]);
      expect(store.state.inbox.count).toBe(1);
      await settle();
      expect(reads).toBe(2);
      expect(store.state.garden.inbox.map((item) => item.id)).toEqual(["b"]);
      dispose();
    });
  });

  it("refreshes after a settled write and leaves a refusal alone", async () => {
    let reads = 0;
    const client = {
      ...inertMemoryClient(),
      memory: async () => {
        reads += 1;
        return trustedGarden([]);
      },
      approveStagedItem: async (id: string) =>
        id === "a" ? { kind: "approved" as const, result: null } : ("missing" as const),
    } as KeyworkClient;
    await createRoot(async (dispose) => {
      const store = createMemoryStore(client, feedOf());
      expect(await store.approve("zz")).toBe("missing");
      await settle();
      expect(reads).toBe(0);
      expect(await store.approve("a")).toEqual({ kind: "approved", result: null });
      await settle();
      expect(reads).toBe(1);
      dispose();
    });
  });
});

describe("the recorded memory fixture", () => {
  it("folds approve, discard and the revert of the approve back to two waiting items", async () => {
    const garden = recordedGarden as MemoryGarden;
    const envelopes = recordedEvents
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as BusEnvelope);
    expect(envelopes.map((envelope) => envelope.payload)).toEqual([
      { count: 2, kinds: { note: 2 } },
      { count: 1, kinds: { note: 1 } },
      { count: 2, kinds: { note: 2 } },
    ]);
    expect(envelopes.every((envelope) => envelope.sessionId === "")).toBe(true);
    const seeded = { count: 3, kinds: { note: 3 } };
    expect(inboxAfter(seeded, envelopes)).toEqual(inboxTallyOf(garden));
    expect(garden.ledger.map((entry) => entry.op)).toEqual(["approve", "discard", "revert"]);
  });
});

describe("the memory store across writes and a reopened server", () => {
  it("rereads the garden after a successful discard, and not after a refused one", async () => {
    let reads = 0;
    let outcome: "discarded" | "missing" = "discarded";
    const client = {
      ...inertMemoryClient(),
      memory: async () => {
        reads += 1;
        return trustedGarden([]);
      },
      discardStagedItem: async () => outcome,
    } as unknown as KeyworkClient;
    const store = createRoot(() => createMemoryStore(client, feedOf()));
    await store.discard("a");
    await settle();
    expect(reads).toBe(1);
    outcome = "missing";
    await store.discard("a");
    await settle();
    expect(reads).toBe(1);
    store.dispose();
  });

  it("rereads the garden when the feed reconnects to a reopened server, not on its first connection", async () => {
    let reads = 0;
    const client = {
      ...inertMemoryClient(),
      memory: async () => {
        reads += 1;
        return trustedGarden([stagedNote("a", "A.md")]);
      },
    } as unknown as KeyworkClient;
    const feed = feedOf();
    const store = createRoot(() => createMemoryStore(client, feed));
    feed.connect();
    await settle();
    expect(reads).toBe(0);
    feed.connect();
    await settle();
    expect(reads).toBe(1);
    expect(store.state.inbox.count).toBe(1);
    store.dispose();
  });
});
