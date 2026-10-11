import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import type {
  AirlockDelivery,
  AirlockDigest,
  AirlockFinish,
  AirlockTriage,
  ApproveOutcome,
  BusEnvelope,
  CandidateChoice,
  DailyEntry,
  DiscardOutcome,
  MemoryAnswer,
  MemoryGarden,
  MemoryNote,
  QuestionChoice,
  RevertReply,
} from "@keywork-app/protocol";
import { createStore, reconcile } from "solid-js/store";
import { onReconnected } from "./surfaces-store.ts";

export interface MemoryStore {
  readonly state: MemoryState;
  refresh(): Promise<void>;
  approve(id: string): Promise<ApproveOutcome>;
  discard(id: string): Promise<DiscardOutcome>;
  revert(ledgerId: string): Promise<RevertReply>;
  notes(layer?: string): Promise<readonly MemoryNote[]>;
  note(name: string, layer?: string): Promise<MemoryNote | undefined>;
  dailyDates(): Promise<readonly string[]>;
  daily(date: string): Promise<readonly DailyEntry[]>;
  ask(query: string, arc?: string): Promise<MemoryAnswer>;
  readonly airlock: AirlockIntents;
  onInbox(listener: (count: number) => void): () => void;
  dispose(): void;
}

export interface AirlockIntents {
  digest(slug: string): Promise<AirlockDigest | undefined>;
  triageCandidate(slug: string, note: string, choice: CandidateChoice): Promise<AirlockTriage>;
  triageQuestion(slug: string, title: string, choice: QuestionChoice): Promise<AirlockTriage>;
  deliver(slug: string): Promise<AirlockDelivery>;
  finish(slug: string, force?: boolean): Promise<AirlockFinish>;
}

export interface MemoryState {
  readonly garden: MemoryGarden;
  readonly loaded: boolean;
  readonly revision: number;
  readonly inbox: InboxTally;
}

export interface InboxTally {
  readonly count: number;
  readonly kinds: Readonly<Record<string, number>>;
}

export const inertGarden: MemoryGarden = {
  trusted: false,
  layers: [],
  inbox: [],
  ledger: [],
  audit: [],
  gardener: { state: "idle" },
  airlocks: [],
};

export function inboxTallyOf(garden: MemoryGarden): InboxTally {
  const kinds: Record<string, number> = {};
  for (const item of garden.inbox) kinds[item.kind] = (kinds[item.kind] ?? 0) + 1;
  return { count: garden.inbox.length, kinds };
}

export function inboxAfter(tally: InboxTally, envelopes: Iterable<BusEnvelope>): InboxTally {
  let latest = tally;
  for (const envelope of envelopes) {
    if (envelope.type === "memory.inbox") {
      latest = { count: envelope.payload.count, kinds: envelope.payload.kinds };
    }
  }
  return latest;
}

export function createMemoryStore(client: KeyworkClient, feed: ServerFeed): MemoryStore {
  const [state, setState] = createStore<{
    garden: MemoryGarden;
    loaded: boolean;
    revision: number;
    inbox: InboxTally;
  }>({
    garden: structuredClone(inertGarden),
    loaded: false,
    revision: 0,
    inbox: { count: 0, kinds: {} },
  });
  const listeners = new Set<(count: number) => void>();

  const announce = (tally: InboxTally): void => {
    const changed = tally.count !== state.inbox.count;
    setState("inbox", tally);
    if (changed) for (const listener of [...listeners]) listener(tally.count);
  };

  const refresh = async (): Promise<void> => {
    const garden = await client.memory();
    setState("garden", reconcile(structuredClone(garden)));
    setState("loaded", true);
    setState("revision", (revision) => revision + 1);
    announce(inboxTallyOf(garden));
  };

  const refreshing = async <T>(write: () => Promise<T>, settled: (outcome: T) => boolean) => {
    const outcome = await write();
    if (settled(outcome)) void refresh();
    return outcome;
  };
  const notRefused = (outcome: unknown): boolean => outcome !== "inert" && outcome !== "missing";

  const stopFollowing = feed.subscribe((envelopes) => {
    const tally = inboxAfter(state.inbox, envelopes);
    if (tally === state.inbox) return;
    announce(tally);
    void refresh();
  });
  const stopReloading = onReconnected(feed, () => void refresh());

  return {
    state,
    refresh,
    approve: (id) => refreshing(() => client.approveStagedItem(id), notRefused),
    discard: (id) => refreshing(() => client.discardStagedItem(id), notRefused),
    revert: (ledgerId) => refreshing(() => client.revertLedgerEntry(ledgerId), notRefused),
    notes: async (layer) => (await client.memoryNotes(layer))?.notes ?? [],
    note: async (name, layer) => (await client.memoryNote(name, layer))?.note ?? undefined,
    dailyDates: async () => (await client.memoryDailyDates()).dates,
    daily: async (date) => (await client.memoryDaily(date)).entries,
    ask: (query, arc) => client.askMemory(arc === undefined ? { query } : { query, arc }),
    airlock: {
      digest: async (slug) => (await client.arcAirlock(slug))?.digest ?? undefined,
      triageCandidate: (slug, note, choice) =>
        refreshing(() => client.triageAirlockCandidate(slug, note, choice), notRefused),
      triageQuestion: (slug, title, choice) =>
        refreshing(() => client.triageAirlockQuestion(slug, title, choice), notRefused),
      deliver: (slug) => refreshing(() => client.deliverAirlockEligible(slug), notRefused),
      finish: (slug, force) => refreshing(() => client.finishArcAirlock(slug, force), notRefused),
    },
    onInbox: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      stopFollowing();
      stopReloading();
      listeners.clear();
    },
  };
}
