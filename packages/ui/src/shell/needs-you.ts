import type { HostNotice, HostPort } from "../host/port.ts";
import type { MemoryStore } from "./memory-store.ts";

export const inboxNeedsYouAt = 3;

export function risingEdge(threshold = inboxNeedsYouAt): (count: number) => boolean {
  let above = false;
  return (count) => {
    const now = count >= threshold;
    const crossed = now && !above;
    above = now;
    return crossed;
  };
}

export function inboxNotice(workspace: string, pending: number): HostNotice {
  return {
    title: "memory inbox",
    body: `${pending} items wait for review`,
    trigger: { kind: "memory-inbox", workspace, pending },
  };
}

export function notifyOnInbox(
  memory: Pick<MemoryStore, "onInbox">,
  host: Pick<HostPort, "notify">,
  workspace: string,
): () => void {
  const crossed = risingEdge();
  return memory.onInbox((count) => {
    if (crossed(count)) void host.notify(inboxNotice(workspace, count));
  });
}
