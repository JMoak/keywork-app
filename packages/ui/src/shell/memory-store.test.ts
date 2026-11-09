import type { KeyworkClient } from "@keywork-app/client";
import type { BusEnvelope, MemoryDecision, MemoryGarden, StagedItem } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import recordedEvents from "../../../client/src/fixtures/memory.jsonl?raw";
import recordedGarden from "../../../client/src/fixtures/memory-garden.json";
import {
  createMemoryStore,
  entryDecisionsIn,
  inboxAfter,
  inboxTallyOf,
  inertGarden,
} from "./memory-store.ts";
import {
  feedOf,
  inboxEnvelope,
  inertMemoryClient,
  stagedNote,
  stagedTally,
} from "./memory-store-testing.ts";

function trustedGarden(inbox: StagedItem[]): MemoryGarden {
  return { ...inertGarden, trusted: true, inbox };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("inbox tallies", () => {
  it("counts the garden's inbox into the server's buckets", () => {
    expect(inboxTallyOf(trustedGarden([stagedNote("a", "A.md"), stagedNote("b", "B.md")]))).toEqual(
      stagedTally(2),
    );
    const contradiction: StagedItem = {
      id: "c",
      key: "k",
      created: "t",
      kind: "contradiction",
      a: "A",
      b: "B",
      aProvenance: "user",
      bProvenance: "agent",
      confidence: 0.5,
    };
    const question: StagedItem = {
      id: "q",
      key: "q",
      created: "t",
      kind: "arc-question",
      arc: "x",
      note: "n",
    };
    expect(inboxTallyOf(trustedGarden([contradiction, question]))).toEqual({
      count: 2,
      staged: 0,
      airlock: 1,
      proposals: 0,
      contradictions: 1,
    });
  });

  it("folds a stream to the last memory.inbox payload and keeps the tally when none arrives", () => {
    const start = stagedTally(3);
    expect(inboxAfter(start, [inboxEnvelope(5, 2), inboxEnvelope(6, 1)])).toEqual(stagedTally(1));
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
      expect(store.state.inbox).toEqual(stagedTally(1));
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
      feed.push([inboxEnvelope(9, 1)]);
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

describe("entry decisions", () => {
  const triage: MemoryDecision = {
    id: "t1",
    question: "entry-durability@1",
    about: { kind: "entry", entryId: "2026-10-15#3" },
    candidates: ["2026-10-15#3"],
    choice: "episodic",
    confidence: 0.92,
    decider: "jev",
    latencyMs: 80,
  };
  const decided = (id: number, decision: MemoryDecision, sessionId = "") =>
    ({
      id,
      ts: "2026-10-15T12:00:00.000Z",
      sessionId,
      type: "memory.decided",
      payload: { decision },
    }) satisfies BusEnvelope;

  it("keeps the latest decision per entry from any envelope, a sweep's or a session's", async () => {
    const recall: MemoryDecision = {
      ...triage,
      id: "r1",
      question: "action-relevance@1",
      about: { kind: "call", callId: "c1" },
      choice: { kept: [], dropped: [] },
    };
    const reread = { ...triage, id: "t2", choice: "new-durable" as const };
    expect(entryDecisionsIn([decided(1, triage), decided(2, recall, "s1")])).toEqual([
      ["2026-10-15#3", triage],
    ]);
    const feed = feedOf();
    await createRoot(async (dispose) => {
      const store = createMemoryStore(inertMemoryClient() as KeyworkClient, feed);
      feed.push([decided(3, triage), decided(4, recall, "s1")]);
      feed.push([decided(5, reread)]);
      expect(store.state.entryDecisions).toEqual({ "2026-10-15#3": reread });
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
      stagedTally(2),
      stagedTally(1),
      stagedTally(2),
    ]);
    expect(envelopes.every((envelope) => envelope.sessionId === "")).toBe(true);
    const seeded = stagedTally(3);
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
