import type { KeyworkClient, ServerFeed, StreamNotice } from "@keywork-app/client";
import type { BusEnvelope, InboxTally, StagedItem } from "@keywork-app/protocol";
import { inertGarden } from "./memory-store.ts";

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
  | "airlock"
  | "triageAirlockCandidate"
  | "triageAirlockQuestion"
  | "deliverAirlock"
  | "finishAirlock"
>;

export function inertMemoryClient(): MemoryClient {
  return {
    memory: async () => inertGarden,
    memoryInbox: async () => ({ trusted: false, items: [], count: 0 }),
    approveStagedItem: async () => "inert",
    discardStagedItem: async () => "inert",
    memoryNotes: async () => ({ trusted: false, notes: [] }),
    memoryNote: async () => undefined,
    memoryDailyDates: async () => ({ trusted: false, dates: [] }),
    memoryDaily: async (date) => ({ trusted: false, date, entries: [] }),
    memoryLedger: async () => ({ trusted: false, entries: [] }),
    revertLedgerEntry: async () => "inert",
    askMemory: async () => ({ trusted: false, hits: [], source: "lexical" }),
    airlock: async (slug) => ({
      trusted: false,
      arc: slug,
      candidates: [],
      questions: [],
      decisions: { candidates: {}, questions: {} },
    }),
    triageAirlockCandidate: async () => "inert",
    triageAirlockQuestion: async () => "inert",
    deliverAirlock: async () => "inert",
    finishAirlock: async () => "inert",
  };
}

export function stagedNote(id: string, target: string): StagedItem {
  return { id, kind: "note", target, created: "2026-09-07T12:00:00.000Z", content: "body" };
}

export function stagedTally(count: number): InboxTally {
  return { count, staged: count, airlock: 0, proposals: 0, contradictions: 0 };
}

export function inboxEnvelope(id: number, count: number) {
  return {
    id,
    ts: "2026-09-07T12:00:01.000Z",
    sessionId: "",
    type: "memory.inbox",
    payload: stagedTally(count),
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
