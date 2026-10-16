import { createEffect } from "solid-js";
import { askNotice, inboxNotice, type NeedsYouItem, risingEdge } from "../shell/needs-you.ts";
import type { NeedsYouQueue } from "../shell/needs-you-queue.ts";
import type { HostPort } from "./port.ts";

export function reportNeedsYou(
  queue: Pick<NeedsYouQueue, "count" | "items" | "where" | "onArrival">,
  host: Pick<HostPort, "setNeedsYou" | "notify">,
): () => void {
  let reported = 0;
  createEffect(() => {
    const count = queue.count();
    if (count === reported) return;
    reported = count;
    void host.setNeedsYou(count);
  });

  const inboxCrossed = new Map<string, (count: number) => boolean>();
  createEffect(() => {
    const pending = inboxCounts(queue.items());
    for (const workspace of new Set([...inboxCrossed.keys(), ...pending.keys()])) {
      const crossed = inboxCrossed.get(workspace) ?? risingEdge();
      inboxCrossed.set(workspace, crossed);
      const count = pending.get(workspace) ?? 0;
      if (crossed(count)) void host.notify(inboxNotice(workspace, count));
    }
  });

  const stopArrivals = queue.onArrival((item) => {
    if (item.kind === "ask") void host.notify(askNotice(item, queue.where(item)));
  });

  return () => {
    stopArrivals();
    if (reported !== 0) void host.setNeedsYou(0);
    reported = 0;
  };
}

function inboxCounts(items: readonly NeedsYouItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.kind === "inbox") counts.set(item.workspace, (counts.get(item.workspace) ?? 0) + 1);
  }
  return counts;
}
