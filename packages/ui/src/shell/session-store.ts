import {
  emptyProjection,
  historyEnvelopes,
  type KeyworkClient,
  projectAll,
  type ServerFeed,
  type SessionProjection,
} from "@keywork-app/client";
import type {
  AnswerOutcome,
  AskVerdict,
  BusEnvelope,
  PendingAsk,
  SessionDetail,
  SessionSummary,
} from "@keywork-app/protocol";
import { createStore, produce, reconcile } from "solid-js/store";

export interface SessionStore {
  readonly state: SessionState;
  refresh(): Promise<void>;
  open(id: string): Promise<void>;
  create(): Promise<string>;
  prompt(id: string, text: string): Promise<void>;
  abort(id: string): Promise<void>;
  answerAsk(callId: string, verdict: AskVerdict): Promise<AnswerOutcome>;
  dispose(): void;
}

export interface SessionState {
  readonly summaries: readonly SessionSummary[];
  readonly projections: Readonly<Record<string, SessionProjection>>;
  readonly loading: Readonly<Record<string, boolean>>;
  readonly gap: { from: number; to: number } | undefined;
  readonly lost: string | undefined;
}

interface MutableSessionState {
  summaries: SessionSummary[];
  projections: Record<string, SessionProjection>;
  loading: Record<string, boolean>;
  gap: { from: number; to: number } | undefined;
  lost: string | undefined;
}

export function createSessionStore(client: KeyworkClient, feed: ServerFeed): SessionStore {
  const [state, setState] = createStore<MutableSessionState>({
    summaries: [],
    projections: {},
    loading: {},
    gap: undefined,
    lost: undefined,
  });
  const arrivedWhileLoading = new Map<string, BusEnvelope[]>();

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
    if (envelopes.some(changesSummaries)) void refresh();
  };

  const refresh = async (): Promise<void> => {
    const summaries = await client.sessions();
    setState("summaries", reconcile([...summaries], { key: "id" }));
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
    dispose: () => {
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
