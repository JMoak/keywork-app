import type { BatchListener } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { emptyInbox, inertGarden } from "../shell/memory-store.ts";
import { askReason, type NeedsYouItem, orderNeedsYou } from "../shell/needs-you.ts";
import {
  createNeedsYouQueue,
  createWaiting,
  type NeedsYouQueue,
} from "../shell/needs-you-queue.ts";
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

  it("toasts a chore once when its run parks on grants, though the chore already waited without a run", async () => {
    const chain = choreChain();
    chain.deliver(routineNeeds(null));
    expect(chain.notices).toEqual([]);
    chain.deliver(routineNeeds("r1"));
    chain.deliver(routineNeeds("r1"));
    expect(chain.notices).toEqual([
      {
        title: "vey · stamp-note",
        body: expect.any(String),
        trigger: { kind: "chore", workspace: "C:/work", creature: "vey", routineId: "stamp-note" },
      },
    ]);
    chain.deliver(routineNeeds("r2"));
    expect(chain.notices).toHaveLength(2);
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

function choreChain() {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const listeners = new Set<BatchListener>();
    const notices: HostNotice[] = [];
    const queue = createNeedsYouQueue();
    queue.attach(
      createWaiting({
        workspace: "C:/work",
        feed: {
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
          onNotice: () => () => undefined,
        },
        asks: async () => [],
        memory: {
          state: {
            loaded: true,
            garden: inertGarden,
            revision: 0,
            inbox: emptyInbox,
            entryDecisions: {},
          },
          refresh: async () => undefined,
        },
        sessionName: (sessionId) => sessionId,
      }),
    );
    reportNeedsYou(queue, {
      setNeedsYou: async () => undefined,
      notify: async (notice) => void notices.push(notice),
    });
    return {
      notices,
      deliver: (envelope: BusEnvelope) => {
        for (const listener of [...listeners]) listener([envelope]);
      },
    };
  });
}

let nextId = 1;

function routineNeeds(runId: string | null): BusEnvelope {
  return {
    id: nextId++,
    ts: "2026-11-06T09:05:00.000Z",
    sessionId: "",
    type: "routine.needs",
    payload: {
      creature: "vey",
      routineId: "stamp-note",
      items: [
        {
          creature: "vey",
          routineId: "stamp-note",
          kind: "grants",
          reason: "the write grant set is not accepted",
          runId,
          since: "2026-11-06T09:00:00.000Z",
          action: { verb: "accept", digest: "c972c8df8a92d543" },
        },
      ],
    },
  } as BusEnvelope;
}

function inboxItems(count: number): NeedsYouItem[] {
  return Array.from({ length: count }, (_, at) => inboxItem(`m${at}`));
}
