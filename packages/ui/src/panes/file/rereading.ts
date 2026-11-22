import type { ServerFeed } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { createEffect, createMemo, on, onCleanup, onMount } from "solid-js";
import { inWindowOf, type Realm } from "../../surfaces/runtime/realm.ts";

export function rereadOnReturn(
  focused: () => boolean,
  reread: () => void,
  pane: () => Node | undefined = () => undefined,
): void {
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
  const listenIn = (realm: Realm): (() => void) => {
    realm.addEventListener("focus", windowReturned);
    return () => realm.removeEventListener("focus", windowReturned);
  };
  onMount(() => {
    const held = pane();
    onCleanup(held === undefined ? listenIn(window) : inWindowOf(held, listenIn));
  });
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
