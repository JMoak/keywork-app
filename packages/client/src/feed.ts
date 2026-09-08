import type { BusEnvelope } from "@keywork-app/protocol";
import type { KeyworkClient } from "./client.ts";
import { batchPerFrame, type TickScheduler } from "./projection/coalesce.ts";
import type { StreamNotice } from "./sse.ts";

export type BatchListener = (envelopes: readonly BusEnvelope[]) => void;

export interface ServerFeed {
  open(): Promise<void>;
  subscribe(listener: BatchListener): () => void;
  subscribeSession(sessionId: string, listener: BatchListener): () => void;
  onNotice(listener: (notice: StreamNotice) => void): () => void;
  whenLost(listener: (reason: Error) => void): () => void;
  close(): void;
}

export interface FeedOptions {
  tick?: TickScheduler | undefined;
  since?: number | undefined;
}

export const nextFrame: TickScheduler = (flush) => {
  setTimeout(flush, 16);
};

export function serverFeed(client: KeyworkClient, options: FeedOptions = {}): ServerFeed {
  const listeners = new Set<BatchListener>();
  const noticeListeners = new Set<(notice: StreamNotice) => void>();
  const lossListeners = new Set<(reason: Error) => void>();
  const stops = new AbortController();
  let lost: Error | undefined;
  let opened: Promise<void> | undefined;

  const deliver: BatchListener = (envelopes) => {
    for (const listener of [...listeners]) listener(envelopes);
  };
  const batcher = batchPerFrame(deliver, options.tick ?? nextFrame);

  const lose = (reason: Error): void => {
    if (lost !== undefined) return;
    lost = reason;
    batcher.flush();
    for (const listener of [...lossListeners]) listener(reason);
  };

  const pump = (onOpen: () => void): Promise<void> =>
    (async () => {
      const events = client.events({
        signal: stops.signal,
        since: options.since,
        onOpen,
        onNotice: (notice) => {
          for (const listener of [...noticeListeners]) listener(notice);
        },
      });
      for await (const envelope of events) batcher.push(envelope);
      if (!stops.signal.aborted) throw new Error("the event stream closed");
    })();

  const open = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      pump(resolve)
        .then(() => batcher.flush())
        .catch((cause: unknown) => {
          const reason = cause instanceof Error ? cause : new Error(String(cause));
          lose(reason);
          reject(reason);
        });
    });

  const ensureOpen = (): Promise<void> => {
    opened ??= open();
    return opened;
  };

  return {
    open: ensureOpen,
    subscribe: (listener) => {
      listeners.add(listener);
      ensureOpen().catch(() => undefined);
      return () => listeners.delete(listener);
    },
    subscribeSession: (sessionId, listener) => {
      const filtered: BatchListener = (envelopes) => {
        const mine = envelopes.filter((envelope) => envelope.sessionId === sessionId);
        if (mine.length > 0) listener(mine);
      };
      listeners.add(filtered);
      ensureOpen().catch(() => undefined);
      return () => listeners.delete(filtered);
    },
    onNotice: (listener) => {
      noticeListeners.add(listener);
      return () => noticeListeners.delete(listener);
    },
    whenLost: (listener) => {
      if (lost !== undefined) listener(lost);
      lossListeners.add(listener);
      return () => lossListeners.delete(listener);
    },
    close: () => {
      stops.abort();
      batcher.flush();
    },
  };
}
