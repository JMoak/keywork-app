import {
  emptyChangesState,
  emptyTreeState,
  type KeyworkClient,
  type ServerFeed,
} from "@keywork-app/client";
import type {
  BusEnvelope,
  PendingAsk,
  SessionDetail,
  SessionEntries,
  SessionSummary,
} from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import recorded from "../../../client/src/fixtures/delegated.json";
import delegatedStream from "../../../client/src/fixtures/delegated.jsonl?raw";
import { parseJsonl } from "../dev/replay.ts";
import { createSessionStore, type SessionStore } from "./session-store.ts";

const parent = recorded.parent.body as SessionDetail;
const child = recorded.child.body as SessionDetail;
const stream = parseJsonl(delegatedStream);

describe("the session store's lineage", () => {
  it("learns a child from its parent's bus without loading the parent", () => {
    const { store, emit } = mounted();
    const started = stream.findIndex((envelope) => envelope.type === "child.started");
    emit(stream.slice(0, started + 1));
    expect(store.children("s1").map((known) => [known.sessionId, known.state])).toEqual([
      ["q2", "running"],
    ]);
    emit(stream.slice(started + 1));
    expect(store.childOf("q2")).toMatchObject({
      parentId: "s1",
      title: "audit the trust rules",
      bot: "researcher",
      state: "completed",
    });
    expect(store.childOf("s1")).toBeUndefined();
    expect(store.state.projections.s1).toBeUndefined();
  });

  it("harvests the children of a transcript it loads", async () => {
    const { store } = mounted();
    await store.open("s1");
    expect(store.children("s1")).toEqual([
      expect.objectContaining({ sessionId: "q2", callId: "d1", state: "completed" }),
    ]);
  });

  it("keeps the summary of a child read by id, which the sessions list never shows", async () => {
    const { store } = mounted();
    await store.refresh();
    await store.open("q2");
    expect(store.state.summaries.map((summary) => summary.id)).toEqual(["s1"]);
    expect(store.summary("q2")).toMatchObject({
      title: "audit the trust rules",
      bot: "researcher",
    });
    expect(store.summary("q2")).not.toHaveProperty("messages");
    expect(store.controlsOf("q2").title).toBe("audit the trust rules");
  });

  it("rereads an open child on its parent's activity lines and when it finishes", async () => {
    const { store, emit, reads } = mounted();
    const started = stream.findIndex((envelope) => envelope.type === "child.started");
    emit(stream.slice(0, started + 1));
    await store.open("q2");
    emit([activity("read src/trust.ts")]);
    await vi.waitFor(() => expect(reads("q2")).toBe(2));
    emit(stream.slice(started + 1));
    await vi.waitFor(() => expect(reads("q2")).toBe(3));
    emit([activity("too late")]);
    await Promise.resolve();
    expect(reads("q2")).toBe(3);
  });
});

describe("the session store's pending asks", () => {
  it("seeds a pending ask with keywork's preview, so its card shows the diff before any event", async () => {
    const preview = { path: "notes.txt", before: null, after: "one\ntwo\n" };
    const { store } = mounted([
      {
        sessionId: "s1",
        callId: "w1",
        tool: "write",
        arguments: { path: "notes.txt", content: "one\ntwo\n" },
        askedAt: "2026-09-07T12:00:02.000Z",
        rules: [],
        preview,
      },
    ]);
    await store.open("s1");
    const asking = store
      .projection("s1")
      .entries.find((entry) => entry.kind === "tool" && entry.run.callId === "w1");
    expect(asking?.kind === "tool" ? asking.run.ask?.preview : undefined).toEqual(preview);
  });
});

describe("the session store's trees and changes", () => {
  it("keeps each session's tree and changes its own, and the empty readings empty", async () => {
    const logOf = (sessionId: string): SessionEntries => ({
      sessionId,
      leafId: null,
      entries: [],
      labels: {},
      activePath: [],
    });
    const client = {
      entries: async (id: string) => logOf(id),
      changes: async (id: string) => ({ baseline: id, files: [] }),
    } as unknown as KeyworkClient;
    const feed = {
      subscribe: () => () => undefined,
      onNotice: () => () => undefined,
      whenLost: () => () => undefined,
    } as unknown as ServerFeed;
    const store = createRoot(() => createSessionStore(client, feed));
    await Promise.all([store.openTree("a"), store.openTree("b")]);
    await Promise.all([store.openChanges("a"), store.openChanges("b")]);
    expect(store.tree("a").snapshot?.sessionId).toBe("a");
    expect(store.tree("b").snapshot?.sessionId).toBe("b");
    expect(store.changes("a").baseline).toBe("a");
    expect(store.changes("b").baseline).toBe("b");
    expect(store.tree("unopened")).toEqual(emptyTreeState);
    expect(emptyTreeState.snapshot).toBeUndefined();
    expect(emptyChangesState.baseline).toBeUndefined();
  });
});

function activity(chunk: string): BusEnvelope {
  return {
    id: 99,
    ts: "2026-09-07T12:00:01.900Z",
    sessionId: "s1",
    type: "tool.output",
    payload: { chunk, callId: "d1" },
  };
}

interface Mounted {
  store: SessionStore;
  emit(envelopes: readonly BusEnvelope[]): void;
  reads(id: string): number;
}

function mounted(pending: readonly PendingAsk[] = []): Mounted {
  const listeners: Array<(envelopes: readonly BusEnvelope[]) => void> = [];
  const sessionReads: string[] = [];
  const details: Record<string, SessionDetail> = { s1: parent, q2: child };
  const listed: SessionSummary[] = [summaryOf(parent)];
  const client = {
    sessions: async () => listed,
    session: async (id: string) => {
      sessionReads.push(id);
      return details[id];
    },
    asks: async () => pending,
  } as unknown as KeyworkClient;
  const feed = {
    subscribe: (listener: (envelopes: readonly BusEnvelope[]) => void) => {
      listeners.push(listener);
      return () => undefined;
    },
    onNotice: () => () => undefined,
    whenLost: () => () => undefined,
  } as unknown as ServerFeed;
  const store = createRoot(() => createSessionStore(client, feed));
  return {
    store,
    emit: (envelopes) => {
      for (const listener of listeners) listener(envelopes);
    },
    reads: (id) => sessionReads.filter((read) => read === id).length,
  };
}

function summaryOf(detail: SessionDetail): SessionSummary {
  const { messages: _, ...summary } = detail;
  return summary;
}
