import type { BatchListener, StreamNotice } from "@keywork-app/client";
import type { BusEnvelope, InboxTally, MemoryGarden, PendingAsk } from "@keywork-app/protocol";
import { createRoot, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { afterEach, describe, expect, it } from "vitest";
import { type EntryDecisions, emptyInbox, inertGarden } from "./memory-store.ts";
import type { NeedsYouItem } from "./needs-you.ts";
import { createNeedsYouQueue, createWaiting, type WaitingSource } from "./needs-you-queue.ts";
import { airlockItem, askItem, failedItem, inboxItem } from "./needs-you-testing.ts";

const disposers: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

describe("the needs-you queue", () => {
  it("merges every workspace's items into one order, asks first then the oldest", () => {
    const queue = inRoot(createNeedsYouQueue);
    queue.attach(fakeSource("C:/work", [failedItem("s4"), askItem("c1")]).source);
    queue.attach(
      fakeSource("C:/side", [
        askItem("c0", { workspace: "C:/side", since: "2026-10-15T09:00:00.000Z" }),
        inboxItem("m1", { workspace: "C:/side" }),
      ]).source,
    );
    expect(queue.items().map((item) => item.key)).toEqual([
      "C:/side#ask:c0",
      "C:/work#ask:c1",
      "C:/side#inbox:m1",
      "C:/work#failed:s4:9",
    ]);
    expect(queue.count()).toBe(4);
    expect(queue.head()?.key).toBe("C:/side#ask:c0");
  });

  it("names where an item is answered through the source of its own workspace", () => {
    const queue = inRoot(createNeedsYouQueue);
    queue.attach(fakeSource("C:/work", []).source);
    expect(queue.where(askItem("c1"))).toBe("C:/work s1");
    expect(queue.where(airlockItem("pricing"))).toBe("pricing");
    expect(queue.where(askItem("c2", { workspace: "C:/gone" }))).toBe("s1");
  });

  it("follows its sources live, so answering an item advances the head", () => {
    const queue = inRoot(createNeedsYouQueue);
    const work = fakeSource("C:/work", [askItem("c1"), airlockItem("pricing")]);
    queue.attach(work.source);
    expect(queue.head()?.kind).toBe("ask");
    work.set([airlockItem("pricing")]);
    expect(queue.head()?.kind).toBe("airlock");
    expect(queue.count()).toBe(1);
  });

  it("dismisses anything but an ask, and forgets dismissals of items that are gone", () => {
    const queue = inRoot(createNeedsYouQueue);
    const work = fakeSource("C:/work", [askItem("c1"), failedItem("s4"), inboxItem("m1")]);
    queue.attach(work.source);
    expect(queue.dismiss(askItem("c1"))).toBe("answer-it");
    expect(queue.dismiss(failedItem("s4"))).toBe("dismissed");
    expect(queue.items().map((item) => item.kind)).toEqual(["ask", "inbox"]);
    work.set([askItem("c1"), inboxItem("m1")]);
    queue.dismiss(inboxItem("m1"));
    work.set([askItem("c1"), failedItem("s4")]);
    expect(queue.items().map((item) => item.kind)).toEqual(["ask", "failed"]);
  });

  it("forwards each source's arrivals, and a detached source stops counting", () => {
    const queue = inRoot(createNeedsYouQueue);
    const arrived: string[] = [];
    queue.onArrival((item) => arrived.push(item.key));
    const work = fakeSource("C:/work", [askItem("c1")]);
    const detach = queue.attach(work.source);
    work.arrive(askItem("c1"));
    detach();
    work.arrive(askItem("c2"));
    expect(arrived).toEqual(["C:/work#ask:c1"]);
    expect(queue.count()).toBe(0);
    expect(work.disposed()).toBe(1);
  });

  it("replaces a workspace's source on reattach and disposes the old one", () => {
    const queue = inRoot(createNeedsYouQueue);
    const first = fakeSource("C:/work", [askItem("c1")]);
    const second = fakeSource("C:/work", [askItem("c2")]);
    queue.attach(first.source);
    queue.attach(second.source);
    expect(queue.items().map((item) => item.key)).toEqual(["C:/work#ask:c2"]);
    expect(first.disposed()).toBe(1);
  });
});

describe("a workspace's waiting source", () => {
  it("seeds asks from the server, then follows the feed, announcing only live arrivals", async () => {
    const harness = waitingHarness({ pending: [pendingAsk("c9")] });
    await settle();
    expect(keysOf(harness.source.items())).toEqual(["C:/work#ask:c9"]);
    harness.deliver([gateAsk("c1"), gateAsk("c2"), permission("c9")]);
    expect(keysOf(harness.source.items())).toEqual(["C:/work#ask:c1", "C:/work#ask:c2"]);
    expect(harness.arrived).toEqual(["C:/work#ask:c1", "C:/work#ask:c2"]);
  });

  it("asks the server again on reconnect and drops what it no longer holds", async () => {
    const harness = waitingHarness({ pending: [] });
    await settle();
    harness.deliver([gateAsk("c1"), gateAsk("c2")]);
    harness.pending.splice(0, harness.pending.length, pendingAsk("c2"));
    harness.connect();
    harness.connect();
    await settle();
    expect(keysOf(harness.source.items())).toEqual(["C:/work#ask:c2"]);
  });

  it("reads the memory garden once when nobody has, and lists its inbox and airlocks", async () => {
    const harness = waitingHarness({ pending: [] });
    await settle();
    expect(harness.memoryReads()).toBe(1);
    harness.setGarden({
      ...inertGarden,
      inbox: [
        {
          id: "w1",
          kind: "note",
          target: "entities/pricing.md",
          created: "2026-10-15T08:00:00.000Z",
          content: "",
        },
      ],
      airlocks: [{ arc: "pricing", candidates: [], questions: [] }],
    });
    expect(harness.source.items().map((item) => item.kind)).toEqual(["airlock", "inbox"]);
    expect(harness.source.items()[0]?.since).toBe("2026-10-15T12:00:00.000Z");
  });

  it("stops following the feed once disposed", async () => {
    const harness = waitingHarness({ pending: [] });
    await settle();
    harness.source.dispose();
    expect(harness.listening()).toBe(false);
  });
});

function inRoot<T>(make: () => T): T {
  return createRoot((dispose) => {
    disposers.push(dispose);
    return make();
  });
}

function fakeSource(workspace: string, initial: NeedsYouItem[]) {
  const [items, setItems] = createSignal<readonly NeedsYouItem[]>(initial);
  const listeners = new Set<(item: NeedsYouItem) => void>();
  let disposed = 0;
  const source: WaitingSource = {
    workspace,
    items,
    sessionName: (sessionId) => `${workspace} ${sessionId}`,
    onArrival: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      disposed += 1;
    },
  };
  return {
    source,
    set: (next: NeedsYouItem[]) => setItems(next),
    arrive: (item: NeedsYouItem) => {
      for (const listener of [...listeners]) listener(item);
    },
    disposed: () => disposed,
  };
}

function waitingHarness(options: { pending: PendingAsk[] }) {
  const listeners = new Set<BatchListener>();
  const notices = new Set<(notice: StreamNotice) => void>();
  const pending = options.pending;
  const [memory, setMemory] = createStore<{
    garden: MemoryGarden;
    loaded: boolean;
    revision: number;
    inbox: InboxTally;
    entryDecisions: EntryDecisions;
  }>({
    garden: inertGarden,
    loaded: false,
    revision: 0,
    inbox: emptyInbox,
    entryDecisions: {},
  });
  let memoryReads = 0;
  const arrived: string[] = [];
  const source = createWaiting({
    workspace: "C:/work",
    feed: {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onNotice: (listener) => {
        notices.add(listener);
        return () => notices.delete(listener);
      },
    },
    asks: async () => [...pending],
    memory: {
      state: memory,
      refresh: async () => {
        memoryReads += 1;
        setMemory("loaded", true);
      },
    },
    sessionName: (sessionId) => sessionId,
    now: () => "2026-10-15T12:00:00.000Z",
  });
  source.onArrival((item) => arrived.push(item.key));
  return {
    source,
    pending,
    arrived,
    memoryReads: () => memoryReads,
    setGarden: (garden: MemoryGarden) => setMemory("garden", garden),
    deliver: (envelopes: BusEnvelope[]) => {
      for (const listener of [...listeners]) listener(envelopes);
    },
    connect: () => {
      for (const listener of [...notices]) listener({ kind: "connected" });
    },
    listening: () => listeners.size > 0,
  };
}

let nextId = 1;

function gateAsk(callId: string): BusEnvelope {
  return {
    id: nextId++,
    ts: "2026-10-15T10:00:00.000Z",
    sessionId: "s1",
    type: "gate.ask",
    payload: { ask: { tool: "bash", callId, arguments: { command: "ls" }, rule: "default" } },
  };
}

function permission(callId: string): BusEnvelope {
  return {
    id: nextId++,
    ts: "2026-10-15T10:00:01.000Z",
    sessionId: "s1",
    type: "gate.permission",
    payload: { decision: { tool: "bash", callId, verdict: "granted", gate: "user" } },
  };
}

function pendingAsk(callId: string): PendingAsk {
  return {
    sessionId: "s1",
    callId,
    tool: "bash",
    arguments: { command: "rm -rf dist" },
    askedAt: "2026-10-15T09:00:00.000Z",
  };
}

function keysOf(items: readonly NeedsYouItem[]): string[] {
  return items.map((item) => item.key);
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
