import {
  type ChangesState,
  changesSnapshot,
  changesState,
  emptyChangesState,
  emptyProjection,
  emptyTreeState,
  historyEnvelopes,
  type KeyworkClient,
  projectAll,
  type ServerFeed,
  type SessionProjection,
  type TreeState,
  treeSnapshot,
  treeState,
} from "@keywork-app/client";
import type {
  AnswerOutcome,
  AskVerdict,
  BusEnvelope,
  ChangedFileReading,
  ForkOutcome,
  LabelOutcome,
  LeafOutcome,
  PendingAsk,
  SessionDetail,
  SessionSummary,
} from "@keywork-app/protocol";
import { createStore, produce, reconcile } from "solid-js/store";
import { createMemoryStore, type MemoryStore } from "./memory-store.ts";
import { createSurfacesStore, type SurfacesStore } from "./surfaces-store.ts";

export interface SessionStore {
  readonly state: SessionState;
  projection(id: string | undefined): SessionProjection;
  summary(id: string | undefined): SessionSummary | undefined;
  refresh(): Promise<void>;
  open(id: string): Promise<void>;
  create(): Promise<string>;
  prompt(id: string, text: string): Promise<void>;
  abort(id: string): Promise<void>;
  answerAsk(callId: string, verdict: AskVerdict): Promise<AnswerOutcome>;
  tree(id: string | undefined): TreeState;
  openTree(id: string, options?: RefetchOptions): Promise<void>;
  fork(id: string, entryId: string): Promise<ForkOutcome>;
  label(id: string, entryId: string, label: string | null): Promise<LabelOutcome>;
  moveLeaf(id: string, entryId: string | null): Promise<LeafOutcome>;
  changes(id: string | undefined): ChangesState;
  openChanges(id: string, options?: RefetchOptions): Promise<void>;
  changedFile(id: string, path: string): Promise<ChangedFileReading>;
  readonly memory: MemoryStore;
  readonly surfaces: SurfacesStore;
  dispose(): void;
}

export interface RefetchOptions {
  force?: boolean | undefined;
}

export interface SessionState {
  readonly summaries: readonly SessionSummary[];
  readonly projections: Readonly<Record<string, SessionProjection>>;
  readonly loading: Readonly<Record<string, boolean>>;
  readonly trees: Readonly<Record<string, TreeState>>;
  readonly changes: Readonly<Record<string, ChangesState>>;
  readonly gap: { from: number; to: number } | undefined;
  readonly lost: string | undefined;
}

interface MutableSessionState {
  summaries: SessionSummary[];
  projections: Record<string, SessionProjection>;
  loading: Record<string, boolean>;
  trees: Record<string, TreeState>;
  changes: Record<string, ChangesState>;
  gap: { from: number; to: number } | undefined;
  lost: string | undefined;
}

export function createSessionStore(client: KeyworkClient, feed: ServerFeed): SessionStore {
  const [state, setState] = createStore<MutableSessionState>({
    summaries: [],
    projections: {},
    loading: {},
    trees: {},
    changes: {},
    gap: undefined,
    lost: undefined,
  });
  const arrivedWhileLoading = new Map<string, BusEnvelope[]>();
  const treeFetches = new Map<string, Promise<void>>();
  const changeFetches = new Map<string, Promise<void>>();
  const memory = createMemoryStore(client, feed);
  const surfaces = createSurfacesStore(client, feed, { sessionsChanged: () => void refresh() });

  const apply = (batches: Map<string, BusEnvelope[]>): void => {
    setState(
      produce((draft) => {
        for (const [sessionId, batch] of batches) {
          const current = draft.projections[sessionId];
          if (current !== undefined) draft.projections[sessionId] = projectAll(current, batch);
        }
      }),
    );
  };

  const follow = (envelopes: readonly BusEnvelope[]): void => {
    setState(
      produce((draft) => {
        for (const envelope of envelopes) {
          const tree = draft.trees[envelope.sessionId];
          if (tree !== undefined) draft.trees[envelope.sessionId] = treeState(tree, envelope);
          const changes = draft.changes[envelope.sessionId];
          if (changes !== undefined) {
            draft.changes[envelope.sessionId] = changesState(changes, envelope);
          }
        }
      }),
    );
    for (const sessionId of new Set(envelopes.map((envelope) => envelope.sessionId))) {
      if (state.trees[sessionId]?.stale === true) void openTree(sessionId);
      if (state.changes[sessionId]?.stale === true) void openChanges(sessionId);
    }
  };

  const absorb = (envelopes: readonly BusEnvelope[]): void => {
    const batches = bySession(envelopes);
    for (const [sessionId, batch] of batches) {
      const waiting = arrivedWhileLoading.get(sessionId);
      if (waiting !== undefined) {
        waiting.push(...batch);
        batches.delete(sessionId);
      }
    }
    apply(batches);
    follow(envelopes);
    if (envelopes.some(changesSummaries)) void refresh();
  };

  const refresh = async (): Promise<void> => {
    const summaries = await client.sessions();
    setState("summaries", reconcile([...summaries], { key: "id" }));
  };

  const openTree = (id: string, options: RefetchOptions = {}): Promise<void> => {
    const current = state.trees[id];
    if (current === undefined) setState("trees", id, emptyTreeState);
    if (current !== undefined && !current.stale && options.force !== true) return Promise.resolve();
    return dedupe(treeFetches, id, async () => {
      const entries = await client.entries(id);
      if (entries === undefined) return;
      setState("trees", id, (tree) => treeSnapshot(tree ?? emptyTreeState, entries));
    });
  };

  const openChanges = (id: string, options: RefetchOptions = {}): Promise<void> => {
    const current = state.changes[id];
    if (current === undefined) setState("changes", id, emptyChangesState);
    if (current !== undefined && !current.stale && options.force !== true) return Promise.resolve();
    return dedupe(changeFetches, id, async () => {
      const reading = await client.changes(id);
      setState("changes", id, (changes) => changesSnapshot(changes ?? emptyChangesState, reading));
    });
  };

  const stops = [
    feed.subscribe(absorb),
    feed.onNotice((notice) => {
      if (notice.kind === "gap") setState("gap", { from: notice.from, to: notice.to });
    }),
    feed.whenLost((reason) => setState("lost", reason.message)),
  ];

  return {
    state,
    projection: (id) =>
      id === undefined ? emptyProjection : (state.projections[id] ?? emptyProjection),
    summary: (id) => state.summaries.find((item) => item.id === id),
    refresh,
    open: async (id) => {
      if (state.projections[id] !== undefined || arrivedWhileLoading.has(id)) return;
      arrivedWhileLoading.set(id, []);
      setState("loading", id, true);
      const [detail, pendingAsks] = await Promise.all([client.session(id), client.asks()]);
      const history = detail === undefined ? [] : historyEnvelopes(detail);
      const asOf = detail?.asOf ?? -1;
      const asks = detail === undefined ? [] : askEnvelopes(detail, pendingAsks);
      const live = (arrivedWhileLoading.get(id) ?? []).filter((envelope) => envelope.id > asOf);
      arrivedWhileLoading.delete(id);
      setState(
        produce((draft) => {
          draft.projections[id] = projectAll(emptyProjection, [...history, ...asks, ...live]);
          draft.loading[id] = false;
        }),
      );
    },
    create: async () => {
      const summary = await client.createSession();
      await refresh();
      return summary.id;
    },
    prompt: async (id, text) => {
      await client.prompt(id, text);
    },
    abort: async (id) => {
      await client.abort(id);
    },
    answerAsk: (callId, verdict) => client.answerAsk(callId, verdict),
    tree: (id) => (id === undefined ? emptyTreeState : (state.trees[id] ?? emptyTreeState)),
    openTree,
    fork: async (id, entryId) => {
      const forked = await client.fork(id, entryId);
      if (typeof forked !== "string") await refresh();
      return forked;
    },
    label: (id, entryId, label) => client.label(id, entryId, label),
    moveLeaf: (id, entryId) => client.moveLeaf(id, entryId),
    changes: (id) =>
      id === undefined ? emptyChangesState : (state.changes[id] ?? emptyChangesState),
    openChanges,
    changedFile: (id, path) => client.changedFile(id, path),
    memory,
    surfaces,
    dispose: () => {
      memory.dispose();
      surfaces.dispose();
      for (const stop of stops) stop();
    },
  };
}

function askEnvelopes(detail: SessionDetail, pending: readonly PendingAsk[]): BusEnvelope[] {
  return pending
    .filter((ask) => ask.sessionId === detail.id)
    .map((ask, index) => ({
      id: -1_000_000 - index,
      ts: ask.askedAt,
      sessionId: detail.id,
      type: "gate.ask" as const,
      payload: {
        ask: {
          tool: ask.tool,
          callId: ask.callId,
          arguments: ask.arguments,
          rule: "default" as const,
        },
      },
    }));
}

function bySession(envelopes: readonly BusEnvelope[]): Map<string, BusEnvelope[]> {
  const grouped = new Map<string, BusEnvelope[]>();
  for (const envelope of envelopes) {
    const batch = grouped.get(envelope.sessionId);
    if (batch === undefined) grouped.set(envelope.sessionId, [envelope]);
    else batch.push(envelope);
  }
  return grouped;
}

function changesSummaries(envelope: BusEnvelope): boolean {
  return envelope.type === "turn.started" || envelope.type === "turn.completed";
}

function dedupe(
  inFlight: Map<string, Promise<void>>,
  id: string,
  fetch: () => Promise<void>,
): Promise<void> {
  const running = inFlight.get(id);
  if (running !== undefined) return running;
  const started = fetch().finally(() => inFlight.delete(id));
  inFlight.set(id, started);
  return started;
}
