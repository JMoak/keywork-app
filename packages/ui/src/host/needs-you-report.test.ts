import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { askReason, type NeedsYouItem, orderNeedsYou } from "../shell/needs-you.ts";
import type { NeedsYouQueue } from "../shell/needs-you-queue.ts";
import { askItem, inboxItem } from "../shell/needs-you-testing.ts";
import { reportNeedsYou } from "./needs-you-report.ts";
import type { HostNotice } from "./port.ts";

const disposers: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

describe("the tray badge and toasts", () => {
  it("reports the queue length as the badge, only when it changes", () => {
    const harness = reporting([askItem("c1")]);
    expect(harness.badges).toEqual([1]);
    harness.set([askItem("c1"), inboxItem("m1")]);
    harness.set([inboxItem("m1"), askItem("c1")]);
    harness.set([]);
    expect(harness.badges).toEqual([1, 2, 0]);
  });

  it("toasts each newly arrived ask with its session's name, and nothing else on arrival", () => {
    const harness = reporting([]);
    harness.arrive(askItem("c1"));
    harness.arrive(inboxItem("m1"));
    expect(harness.notices).toEqual([
      {
        title: "where C:/work#ask:c1",
        body: askReason,
        trigger: { kind: "ask", workspace: "C:/work", sessionId: "s1", callId: "c1" },
      },
    ]);
  });

  it("toasts the memory inbox once per crossing of keywork's threshold, per workspace", () => {
    const harness = reporting([]);
    harness.set(inboxItems(2));
    harness.set(inboxItems(3));
    harness.set(inboxItems(4));
    harness.set(inboxItems(1));
    harness.set(inboxItems(3));
    expect(harness.notices.map((notice) => notice.trigger)).toEqual([
      { kind: "memory-inbox", workspace: "C:/work", pending: 3 },
      { kind: "memory-inbox", workspace: "C:/work", pending: 3 },
    ]);
  });

  it("clears the badge when the window lets go of its queue", () => {
    const harness = reporting([askItem("c1")]);
    harness.stop();
    harness.arrive(askItem("c2"));
    expect(harness.badges).toEqual([1, 0]);
    expect(harness.notices).toEqual([]);
  });
});

function reporting(initial: NeedsYouItem[]) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const [items, setItems] = createSignal<readonly NeedsYouItem[]>(orderNeedsYou(initial));
    const listeners = new Set<(item: NeedsYouItem) => void>();
    const badges: number[] = [];
    const notices: HostNotice[] = [];
    const queue: Pick<NeedsYouQueue, "count" | "items" | "where" | "onArrival"> = {
      items,
      count: () => items().length,
      where: (item) => `where ${item.key}`,
      onArrival: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const stop = reportNeedsYou(queue, {
      setNeedsYou: async (count) => void badges.push(count),
      notify: async (notice) => void notices.push(notice),
    });
    return {
      badges,
      notices,
      stop,
      set: (next: NeedsYouItem[]) => setItems(orderNeedsYou(next)),
      arrive: (item: NeedsYouItem) => {
        for (const listener of [...listeners]) listener(item);
      },
    };
  });
}

function inboxItems(count: number): NeedsYouItem[] {
  return Array.from({ length: count }, (_, at) => inboxItem(`m${at}`));
}
