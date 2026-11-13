import { createSignal } from "solid-js";
import { z } from "zod";
import type { DraftMemory, KeptDraft } from "../composer/kept-draft.ts";

export interface DraftLedger {
  open(sessionId: string | undefined): boolean;
  mark(paneId: string, sessionId: string | undefined): void;
  memory(paneId: string, sessionId: string | undefined): DraftMemory;
}

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface DraftKeeping {
  readonly storage: DraftStorage | undefined;
  readonly key: string;
}

export function createDraftLedger(keeping?: DraftKeeping): DraftLedger {
  const [drafting, setDrafting] = createSignal<ReadonlyMap<string, string>>(new Map());
  const kept = new Map(Object.entries(readKept(keeping)));
  const memories = new Map<string, DraftMemory>();
  const memoryAt = (place: string): DraftMemory => ({
    recall: () => kept.get(place),
    keep: (draft) => {
      if (draft.text === "") kept.delete(place);
      else kept.set(place, draft);
      writeKept(keeping, kept);
    },
  });
  return {
    open: (sessionId) =>
      sessionId !== undefined && [...drafting().values()].some((held) => held === sessionId),
    mark: (paneId, sessionId) =>
      setDrafting((held) => {
        if (held.get(paneId) === sessionId) return held;
        const next = new Map(held);
        if (sessionId === undefined) next.delete(paneId);
        else next.set(paneId, sessionId);
        return next;
      }),
    memory: (paneId, sessionId) => {
      const place = sessionId ?? `pane:${paneId}`;
      const memory = memories.get(place) ?? memoryAt(place);
      memories.set(place, memory);
      return memory;
    },
  };
}

const keptDrafts = z.record(
  z.string(),
  z.object({
    text: z.string(),
    pastes: z.array(z.tuple([z.number(), z.string()])),
  }),
);

function readKept(keeping: DraftKeeping | undefined): Record<string, KeptDraft> {
  try {
    const raw = keeping?.storage?.getItem(keeping.key);
    if (raw === null || raw === undefined) return {};
    return keptDrafts.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeKept(
  keeping: DraftKeeping | undefined,
  kept: ReadonlyMap<string, KeptDraft>,
): boolean {
  const storage = keeping?.storage;
  if (keeping === undefined || storage === undefined) return false;
  try {
    if (kept.size === 0) storage.removeItem(keeping.key);
    else storage.setItem(keeping.key, JSON.stringify(Object.fromEntries(kept)));
    return true;
  } catch {
    return false;
  }
}
