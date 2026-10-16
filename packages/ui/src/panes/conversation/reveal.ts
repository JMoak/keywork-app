import { createEffect } from "solid-js";
import type { NeedsYouItem } from "../../shell/needs-you.ts";
import type { Reveal } from "../../shell/needs-you-jumps.ts";

export interface RevealSeams {
  pane(): string;
  root(): HTMLElement | undefined;
  revealing(): Reveal | undefined;
  painted(): unknown;
}

export function revealWhatWaits(seams: RevealSeams): void {
  let handled: number | undefined;
  createEffect(() => {
    const request = seams.revealing();
    seams.painted();
    if (request === undefined || request.seq === handled || request.pane !== seams.pane()) return;
    const target = waitingElement(seams.root(), request.item);
    if (target === undefined) return;
    handled = request.seq;
    target.scrollIntoView({ block: "nearest" });
    if (request.item.kind === "ask") queueMicrotask(() => target.focus({ preventScroll: true }));
  });
}

export function waitingElement(
  root: HTMLElement | undefined,
  item: NeedsYouItem,
): HTMLElement | undefined {
  if (root === undefined) return undefined;
  switch (item.kind) {
    case "ask":
      return [...root.querySelectorAll<HTMLElement>("[data-call-id]")].find(
        (card) => card.dataset.callId === item.callId,
      );
    case "failed":
      return [...root.querySelectorAll<HTMLElement>(".kw-notice[data-level='error']")].at(-1);
    default:
      return undefined;
  }
}
