import {
  type CreatureLedgerChange,
  type CreatureLedgerEntry,
  type CreatureLedgerView,
  isServedRefusal,
  type ServedRefusal,
} from "@keywork-app/protocol";
import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { onReconnected } from "../../shell/surfaces-store.ts";
import type { ShellSeams } from "../registry.ts";

export type LedgerReading =
  | { readonly kind: "reading" }
  | { readonly kind: "read" }
  | { readonly kind: "refused"; readonly detail: string; readonly kept: boolean };

export interface LedgerBook {
  entries(): readonly CreatureLedgerEntry[];
  reading(): LedgerReading;
  learned(entry: CreatureLedgerEntry): void;
}

export interface LedgerSource {
  read(slug: string): Promise<CreatureLedgerView | ServedRefusal>;
  follow(listener: (change: CreatureLedgerChange) => void): () => void;
  reconnected(listener: () => void): () => void;
}

export function ledgerSourceOf(shell: Pick<ShellSeams, "client" | "feed">): LedgerSource {
  return {
    read: async (slug) => {
      try {
        return await shell.client.creatureLedger(slug);
      } catch (cause) {
        return {
          refused: "failed",
          detail: cause instanceof Error ? cause.message : String(cause),
        };
      }
    },
    follow: (listener) =>
      shell.feed.subscribe((batch) => {
        for (const envelope of batch) {
          if (envelope.type === "creature.ledger") listener(envelope.payload);
        }
      }),
    reconnected: (listener) => onReconnected(shell.feed, listener),
  };
}

export function createLedgerBook(source: LedgerSource, slug: () => string | undefined): LedgerBook {
  const [entries, setEntries] = createSignal<readonly CreatureLedgerEntry[]>([]);
  const [reading, setReading] = createSignal<LedgerReading>({ kind: "reading" });
  let heardWhileReading: CreatureLedgerChange[] | undefined;
  let readings = 0;

  const apply = (change: CreatureLedgerChange): void => {
    setEntries((held) =>
      change.change === "folded" ? without(held, change.entry.id) : upserted(held, change.entry),
    );
  };
  const read = async (held: string): Promise<void> => {
    const reading = ++readings;
    heardWhileReading = [];
    setReading({ kind: "reading" });
    const view = await source.read(held);
    if (reading !== readings || slug() !== held) return;
    const heard = heardWhileReading;
    heardWhileReading = undefined;
    if (isServedRefusal(view)) {
      setEntries([]);
      setReading({ kind: "refused", detail: view.detail, kept: !unkept.has(view.refused) });
      return;
    }
    setEntries(view.entries);
    for (const change of heard) apply(change);
    setReading({ kind: "read" });
  };

  createEffect(
    on(slug, (held) => {
      setEntries([]);
      if (held !== undefined) void read(held);
    }),
  );
  onCleanup(
    source.follow((change) => {
      if (change.creature !== slug()) return;
      if (heardWhileReading !== undefined) heardWhileReading.push(change);
      else apply(change);
    }),
  );
  onCleanup(
    source.reconnected(() => {
      const held = slug();
      if (held !== undefined) void read(held);
    }),
  );

  return {
    entries,
    reading,
    learned: (entry) => setEntries((held) => upserted(held, entry)),
  };
}

const unkept: ReadonlySet<ServedRefusal["refused"]> = new Set(["missing", "unserved", "deferred"]);

function upserted(
  held: readonly CreatureLedgerEntry[],
  entry: CreatureLedgerEntry,
): readonly CreatureLedgerEntry[] {
  const at = held.findIndex((each) => each.id === entry.id);
  if (at < 0) return [...held, entry];
  return held.map((each, index) => (index === at ? entry : each));
}

function without(held: readonly CreatureLedgerEntry[], id: string): readonly CreatureLedgerEntry[] {
  return held.filter((each) => each.id !== id);
}
