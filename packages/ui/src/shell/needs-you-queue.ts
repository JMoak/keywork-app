import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import type { PendingAsk, RoutineNeed, VerdictMark } from "@keywork-app/protocol";
import { createMemo, createSignal } from "solid-js";
import type { MemoryStore } from "./memory-store.ts";
import { dismissible, type NeedsYouItem, orderNeedsYou, whereOf } from "./needs-you.ts";
import {
  emptyWireLedger,
  foldWire,
  freshAsks,
  freshChores,
  memoryItems,
  needsYouCount,
  reconcileAsks,
  reconcileChores,
  reconcileReviews,
  type WireLedger,
  wireItems,
} from "./needs-you-ledger.ts";
import { onReconnected } from "./surfaces-store.ts";

export interface NeedsYouQueue {
  items(): readonly NeedsYouItem[];
  count(): number;
  head(): NeedsYouItem | undefined;
  where(item: NeedsYouItem): string;
  dismiss(item: NeedsYouItem): DismissOutcome;
  attach(source: WaitingSource): () => void;
  onArrival(listener: ArrivalListener): () => void;
}

export type DismissOutcome = "dismissed" | "answer-it";

export type ArrivalListener = (item: NeedsYouItem) => void;

export interface WaitingSource {
  readonly workspace: string;
  items(): readonly NeedsYouItem[];
  sessionName(sessionId: string): string;
  onArrival(listener: ArrivalListener): () => void;
  dispose(): void;
}

export interface WaitingSeams {
  workspace: string;
  feed: Pick<ServerFeed, "subscribe" | "onNotice">;
  asks(): Promise<readonly PendingAsk[]>;
  chores?: (() => Promise<readonly RoutineNeed[]>) | undefined;
  reviews?: (() => Promise<readonly SessionVerdicts[]>) | undefined;
  memory: Pick<MemoryStore, "state" | "refresh">;
  sessionName(sessionId: string): string;
  now?: (() => string) | undefined;
}

export interface SessionVerdicts {
  readonly sessionId: string;
  readonly verdicts: readonly VerdictMark[];
}

export async function sessionVerdicts(
  client: Pick<KeyworkClient, "sessions" | "hunkVerdicts">,
): Promise<SessionVerdicts[]> {
  const listed = await client.sessions();
  const readings = await Promise.all(
    listed.map(async ({ id }) => ({ sessionId: id, reading: await client.hunkVerdicts(id) })),
  );
  return readings.flatMap(({ sessionId, reading }) =>
    reading === "missing" || reading.verdicts.length === 0
      ? []
      : [{ sessionId, verdicts: reading.verdicts }],
  );
}

export function createNeedsYouQueue(): NeedsYouQueue {
  const [sources, setSources] = createSignal<readonly WaitingSource[]>([]);
  const [dismissed, setDismissed] = createSignal<ReadonlySet<string>>(new Set());
  const listeners = new Set<ArrivalListener>();
  const everything = createMemo(() => sources().flatMap((source) => source.items()));
  const items = createMemo(() =>
    orderNeedsYou(everything().filter((item) => !dismissed().has(item.key))),
  );

  const sourceOf = (workspace: string): WaitingSource | undefined =>
    sources().find((source) => source.workspace === workspace);

  const dismiss = (item: NeedsYouItem): DismissOutcome => {
    if (!dismissible(item)) return "answer-it";
    const present = new Set(everything().map((waiting) => waiting.key));
    setDismissed((keys) => new Set([...keys].filter((key) => present.has(key)).concat(item.key)));
    return "dismissed";
  };

  const attach = (source: WaitingSource): (() => void) => {
    for (const replaced of sources().filter((held) => held.workspace === source.workspace)) {
      replaced.dispose();
    }
    setSources((held) => [...held.filter((kept) => kept.workspace !== source.workspace), source]);
    const stopArrivals = source.onArrival((item) => {
      for (const listener of [...listeners]) listener(item);
    });
    return () => {
      stopArrivals();
      setSources((held) => held.filter((kept) => kept !== source));
      source.dispose();
    };
  };

  return {
    items,
    count: () => needsYouCount(items()),
    head: () => items()[0],
    where: (item) =>
      whereOf(item, (sessionId) => sourceOf(item.workspace)?.sessionName(sessionId) ?? sessionId),
    dismiss,
    attach,
    onArrival: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createWaiting(seams: WaitingSeams): WaitingSource {
  const { workspace } = seams;
  const now = seams.now ?? (() => new Date().toISOString());
  const [wire, setWire] = createSignal(emptyWireLedger);
  const listeners = new Set<ArrivalListener>();
  const firstSeen = new Map<string, string>();

  const seenAt = (key: string): string => {
    const seen = firstSeen.get(key) ?? now();
    firstSeen.set(key, seen);
    return seen;
  };
  const reconcile = (knownBeforeAsking: ReadonlySet<string>): void => {
    seams.asks().then(
      (pending) =>
        setWire((ledger) => reconcileAsks(ledger, workspace, pending, knownBeforeAsking)),
      () => undefined,
    );
    seams
      .chores?.()
      .then((needs) => setWire((ledger) => reconcileChores(ledger, workspace, needs)))
      .catch(() => undefined);
    seams
      .reviews?.()
      .then((sessions) => setWire((ledger) => withReviews(ledger, workspace, sessions)))
      .catch(() => undefined);
  };

  const stops = [
    seams.feed.subscribe((envelopes) => {
      const before = wire();
      const after = foldWire(before, workspace, envelopes);
      if (after === before) return;
      setWire(after);
      for (const arrived of [...freshAsks(before, after), ...freshChores(before, after)]) {
        for (const listener of [...listeners]) listener(arrived);
      }
    }),
    onReconnected(seams.feed, () => reconcile(new Set(wire().asks.keys()))),
  ];
  reconcile(new Set());
  if (!seams.memory.state.loaded) seams.memory.refresh().catch(() => undefined);

  return {
    workspace,
    items: () => [
      ...wireItems(wire()),
      ...memoryItems(workspace, seams.memory.state.garden, seenAt),
    ],
    sessionName: seams.sessionName,
    onArrival: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: () => {
      for (const stop of stops) stop();
      listeners.clear();
    },
  };
}

function withReviews(
  ledger: WireLedger,
  workspace: string,
  sessions: readonly SessionVerdicts[],
): WireLedger {
  return sessions.reduce(
    (held, { sessionId, verdicts }) => reconcileReviews(held, workspace, sessionId, verdicts),
    ledger,
  );
}
