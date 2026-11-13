import type { ServerFeed } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { createEffect, createMemo, on, onCleanup } from "solid-js";

export function rereadOnReturn(focused: () => boolean, reread: () => void): void {
  const holding = createMemo(focused);
  createEffect(
    on(
      holding,
      (now) => {
        if (now) reread();
      },
      { defer: true },
    ),
  );
  const windowReturned = (): void => reread();
  window.addEventListener("focus", windowReturned);
  onCleanup(() => window.removeEventListener("focus", windowReturned));
}

export function rereadWhenFilesMove(feed: ServerFeed, reread: () => void): void {
  onCleanup(
    feed.subscribe((envelopes) => {
      if (envelopes.some(movesFiles)) reread();
    }),
  );
}

function movesFiles(envelope: BusEnvelope): boolean {
  return envelope.type === "changes.updated" && envelope.payload.replay !== true;
}
