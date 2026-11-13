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

  it("streams an open running child under its own id and rereads it once, when it finishes", async () => {
    const started = stream.findIndex((envelope) => envelope.type === "child.started");
    const finished = stream.findIndex((envelope) => envelope.type === "child.finished");
    const running = { ...child, live: true, messages: child.messages.slice(0, 1) };
    const { store, emit, reads } = mounted([], { q2: running });
    emit(stream.slice(0, started + 1));
    await store.open("q2");
    emit([activity("read src/trust.ts"), ...childTurn("q2", child)]);
    expect(store.projection("q2").entries.map((entry) => entry.kind)).toEqual([
      "user",
      "assistant",
    ]);
    expect(store.projection("q2").entries.at(-1)).toMatchObject({
      text: "Two rules allow more than they say.",
    });
    expect(reads("q2")).toBe(1);
    emit(stream.slice(finished));
    await vi.waitFor(() => expect(reads("q2")).toBe(2));
  });
});

describe("a child's asks", () => {
  const childAsk: PendingAsk = {
    sessionId: "s1",
    callId: "cw1",
    tool: "write",
    arguments: { path: "notes/audit.md", content: "two loose rules\n" },
    askedAt: "2026-09-07T12:00:01.900Z",
    rules: [],
  };
  const raised: BusEnvelope = {
    id: 120,
    ts: childAsk.askedAt,
    sessionId: "q2",
    type: "gate.ask",
    payload: {
      ask: {
        tool: childAsk.tool,
        callId: childAsk.callId,
        arguments: childAsk.arguments,
        rule: "default",
        rules: [],
      },
    },
  };
  const asking = (store: SessionStore, id: string): string[] =>
    store
      .projection(id)
      .entries.flatMap((entry) =>
        entry.kind === "tool" && entry.run.phase === "asking" ? [entry.run.callId] : [],
      );

  it("are answered in the child's pane, never a second time in the parent's", async () => {
    const started = stream.findIndex((envelope) => envelope.type === "child.started");
    const running = { ...child, live: true, messages: child.messages.slice(0, 1) };
    const { store, emit } = mounted([childAsk], { q2: running });
    emit([...stream.slice(0, started + 1), raised]);
    await store.open("s1");
    await store.open("q2");
    expect(asking(store, "q2")).toEqual(["cw1"]);
    expect(asking(store, "s1")).toEqual([]);
  });

  it("fall back to the parent's pane when the app never heard which child raised them", async () => {
    const { store } = mounted([childAsk]);
    await store.open("s1");
    expect(asking(store, "s1")).toEqual(["cw1"]);
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

describe("the session store's seam between a snapshot and the live stream", () => {
  const at = "2026-11-12T12:00:00.000Z";
  const wren = { kind: "creature", creature: "wren", thread: "w1" } as const;
  const frame = "You are Wren.";
  const told = (id: number, type: BusEnvelope["type"], payload: unknown): BusEnvelope =>
    ({ id, ts: at, sessionId: "w1", type, payload }) as BusEnvelope;
  const introduction = [
    told(1, "extension.notice", {
      extension: "creature",
      level: "info",
      message: frame,
      detail: { origin: wren, entryId: "f1", kind: "frame" },
    }),
    told(2, "turn.started", { userText: frame, origin: wren }),
    told(3, "turn.delta", { delta: { type: "text", text: "I" } }),
    told(4, "turn.delta", { delta: { type: "text", text: " am Wren." } }),
  ];
  const snapshot: SessionDetail = {
    id: "w1",
    title: "wren",
    createdAt: at,
    lastActivityAt: at,
    messageCount: 1,
    cwd: "/home",
    live: true,
    asOf: 3,
    messages: [{ role: "user", parts: [{ type: "text", text: frame }] }],
    reports: [{ index: 0, entryId: "f1", at, text: frame, origin: wren, kind: "frame" }],
  };

  it("keeps a thread's first words that streamed before it was opened, and keeps its frame out of the transcript", async () => {
    const listeners: Array<(envelopes: readonly BusEnvelope[]) => void> = [];
    const emit = (envelopes: readonly BusEnvelope[]) => {
      for (const listener of listeners) listener(envelopes);
    };
    const client = {
      session: async () => {
        emit(introduction.slice(3));
        return snapshot;
      },
      asks: async () => [],
      entries: async () => undefined,
      sessions: async () => [],
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
    emit(introduction.slice(0, 3));
    await store.open("w1");
    const drawn = store
      .projection("w1")
      .entries.map((entry) => ("text" in entry ? entry.text : ""));
    expect(drawn).toEqual(["I am Wren."]);
    expect(store.projection("w1").turn).toMatchObject({ userText: frame });
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

function childTurn(sessionId: string, detail: SessionDetail): BusEnvelope[] {
  const [prompt, reply] = detail.messages;
  const text = (message: typeof prompt): string =>
    message?.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("") ?? "";
  const usage = { inputTokens: 12, outputTokens: 5 };
  const told = (id: number, type: BusEnvelope["type"], payload: unknown): BusEnvelope =>
    ({ id, ts: "2026-09-07T12:00:01.950Z", sessionId, type, payload }) as BusEnvelope;
  return [
    told(100, "turn.started", { userText: text(prompt) }),
    told(101, "turn.delta", { delta: { type: "text", text: text(reply) } }),
    told(102, "turn.delta", { delta: { type: "done", usage } }),
    told(103, "turn.completed", { message: reply, usage }),
  ];
}

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

function mounted(
  pending: readonly PendingAsk[] = [],
  reading: Readonly<Record<string, SessionDetail>> = {},
): Mounted {
  const listeners: Array<(envelopes: readonly BusEnvelope[]) => void> = [];
  const sessionReads: string[] = [];
  const details: Record<string, SessionDetail> = { s1: parent, q2: child, ...reading };
  const listed: SessionSummary[] = [summaryOf(parent)];
  const client = {
    sessions: async () => listed,
    session: async (id: string) => {
      sessionReads.push(id);
      return details[id];
    },
    asks: async () => pending,
    entries: async () => undefined,
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
