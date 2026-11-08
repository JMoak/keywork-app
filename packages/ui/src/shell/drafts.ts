import { createSignal } from "solid-js";

export interface DraftLedger {
  open(sessionId: string | undefined): boolean;
  mark(paneId: string, sessionId: string | undefined): void;
}

export function createDraftLedger(): DraftLedger {
  const [drafting, setDrafting] = createSignal<ReadonlyMap<string, string>>(new Map());
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
  };
}
