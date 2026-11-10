import {
  CampaignRequestError,
  type CampaignStreamItem,
  type CampaignsClient,
  campaignsOverFetch,
} from "@keywork-app/client";
import type {
  CampaignCommandRequest,
  CampaignCreateRequest,
  CampaignReading,
  CampaignSummary,
} from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { campaignFixture, usageFixture } from "../../../../protocol/src/campaign-testing.ts";
import { type CampaignMonitor, createCampaignMonitor } from "./store.ts";

describe("campaign monitor", () => {
  it("keeps list status, costs, and verified achievements on the same revision", async () => {
    const initial: CampaignSummary = {
      id: "campaign-one",
      title: "Welcome",
      workload: "app-improvement",
      status: "ready",
      revision: 1,
      updatedAt: 1000,
      settledMicros: 0,
      pendingMicros: 0,
      latestAchievement: null,
    };
    const achievement = {
      id: "verified",
      criterionId: "useful",
      artifactId: "baseline",
      purposeRevision: 1,
      title: "Setup checked",
      summary: "Completed setup",
      evidenceIds: ["inspection"],
      status: "verified" as const,
      verifiedBy: { id: "reviewer", role: "user" as const },
      adoptedAt: 2000,
      history: [],
    };
    const latest: CampaignReading = {
      sequence: 2,
      campaign: campaignFixture({
        revision: 2,
        title: "Welcome",
        status: "completed",
        updatedAt: 2000,
        usage: [
          usageFixture({ state: "reported", costMicros: 300_000 }),
          usageFixture({
            id: "pending",
            operationId: "pending",
            state: "estimated",
            costMicros: 200_000,
          }),
        ],
        achievements: [
          achievement,
          {
            ...achievement,
            id: "observation",
            title: "Unverified claim",
            status: "observed",
            verifiedBy: null,
          },
        ],
      }),
    };
    const delayed = deferred<CampaignSummary[]>();
    let lists = 0;
    const monitor = createRoot(() =>
      createCampaignMonitor(
        fakeClient({
          list: async () => (++lists === 1 ? [initial] : delayed.promise),
          read: async () => latest,
        }),
      ),
    );
    try {
      await monitor.load();
      const listing = monitor.load();
      await monitor.open("campaign-one");
      await ready(monitor);
      const expected = {
        ...initial,
        revision: 2,
        updatedAt: 2000,
        status: "completed",
        settledMicros: 300_000,
        pendingMicros: 500_000,
        latestAchievement: "Setup checked",
      };
      expect(monitor.state.campaigns).toEqual([expected]);
      delayed.resolve([initial]);
      await listing;
      expect(monitor.state.campaigns).toEqual([expected]);
    } finally {
      monitor.dispose();
    }
  });

  it("does not duplicate a pending creation or apply its result after disposal", async () => {
    const delayed = deferred<CampaignReading>();
    const create = vi.fn(() => delayed.promise);
    const monitor = createRoot(() => createCampaignMonitor(fakeClient({ create })));
    const input: CampaignCreateRequest = {
      title: "Welcome",
      workload: "app-improvement",
      objective: "Clear setup",
      criteria: ["Usable"],
      references: [],
      model: { provider: "openrouter", model: "model-a" },
      budgetMicros: 5_000_000,
      persistenceProfile: "focused",
    };
    try {
      const pending = monitor.create(input);
      expect(await monitor.create(input)).toBe(false);
      monitor.dispose();
      delayed.resolve(reading(1));
      expect(await pending).toBe(false);
      expect(await monitor.create(input)).toBe(false);
      expect(create).toHaveBeenCalledTimes(1);
      expect(monitor.state.selected).toBeNull();
    } finally {
      monitor.dispose();
    }
  });

  it.each(["creation", "listing", "opening"])(
    "does not reopen a campaign when leaving during %s",
    async (stage) => {
      const creation = deferred<CampaignReading>();
      const listing = deferred<CampaignSummary[]>();
      const opening = deferred<CampaignReading>();
      const list = vi.fn(async () => (stage === "listing" ? listing.promise : []));
      const read = vi.fn(async () => opening.promise);
      const monitor = createRoot(() =>
        createCampaignMonitor(
          fakeClient({
            create: async () => (stage === "creation" ? creation.promise : reading(1)),
            list,
            read,
          }),
        ),
      );
      try {
        const pending = monitor.create({
          title: "Welcome",
          workload: "app-improvement",
          objective: "Clear setup",
          criteria: ["Usable"],
          references: [],
          model: { provider: "openrouter", model: "model-a" },
          budgetMicros: 5_000_000,
          persistenceProfile: "focused",
        });
        if (stage === "listing") await vi.waitFor(() => expect(list).toHaveBeenCalled());
        if (stage === "opening") await vi.waitFor(() => expect(read).toHaveBeenCalled());
        monitor.close();
        creation.resolve(reading(1));
        listing.resolve([]);
        opening.resolve(reading(1));
        expect(await pending).toBe(false);
        expect(monitor.state.selected).toBeNull();
        expect(monitor.state.connection).toBe("idle");
      } finally {
        monitor.dispose();
      }
    },
  );

  it("marks unavailable discovery and reconnects a selected campaign after a failed initial load", async () => {
    let reads = 0;
    const monitor = createRoot(() =>
      createCampaignMonitor(
        fakeClient({
          list: async () => {
            throw new CampaignRequestError(404, "Campaigns unavailable");
          },
          read: async () => {
            if (++reads === 1) throw new CampaignRequestError(503, "Runtime starting");
            return reading(2);
          },
        }),
      ),
    );
    try {
      await monitor.load();
      expect(monitor.state.available).toBe(false);
      await monitor.open("campaign-one");
      expect(monitor.state.connection).toBe("offline");
      await monitor.refresh();
      await vi.waitFor(() => expect(monitor.state.connection).toBe("live"));
      expect(monitor.state.reading?.sequence).toBe(2);
    } finally {
      monitor.dispose();
    }
  });
  it("deduplicates events and never replaces a newer snapshot with a late read", async () => {
    const queue = eventQueue();
    const slow = deferred<CampaignReading>();
    let reads = 0;
    const client = fakeClient({
      read: async () => (++reads === 3 ? slow.promise : reading(1)),
      watch: (_id, _cursor, signal) => queue.watch(signal),
    });
    const monitor = createRoot(() => createCampaignMonitor(client));
    try {
      await monitor.open("campaign-one");
      await vi.waitFor(() => expect(reads).toBe(2));
      queue.push(eventAt(2));
      await vi.waitFor(() => expect(reads).toBe(3));
      expect(monitor.state.stale).toBe(true);
      queue.push(eventAt(2));
      queue.push(eventAt(1));
      queue.push({ kind: "snapshot", reading: reading(3) });
      await vi.waitFor(() => expect(monitor.state.reading?.campaign.revision).toBe(3));
      slow.resolve(reading(2));
      await Promise.resolve();
      expect(monitor.state.reading?.campaign.revision).toBe(3);
      expect(monitor.state.stale).toBe(false);
      expect(reads).toBe(3);
    } finally {
      monitor.dispose();
    }
  });

  it("ignores results from a campaign that was left before loading completed", async () => {
    const slow = deferred<CampaignReading>();
    const client = fakeClient({
      read: async (id) => (id === "old" ? slow.promise : reading(2, id)),
    });
    const monitor = createRoot(() => createCampaignMonitor(client));
    try {
      const first = monitor.open("old");
      await monitor.open("current");
      slow.resolve(reading(9, "old"));
      await first;
      expect(monitor.state.reading?.campaign.id).toBe("current");
    } finally {
      monitor.dispose();
    }
  });

  it("sends the observed revision once, reads after conflict, and never pretends pause succeeded", async () => {
    const commands: CampaignCommandRequest[] = [];
    let latest = reading(1);
    const client = fakeClient({
      read: async () => latest,
      command: async (_id, request) => {
        commands.push(request);
        latest = reading(4);
        throw new CampaignRequestError(409, "Campaign changed; review the new state.");
      },
    });
    const monitor = createRoot(() => createCampaignMonitor(client));
    try {
      await monitor.open("campaign-one");
      await ready(monitor);
      expect(await monitor.command({ type: "pause", reason: "Review" })).toBe(false);
      expect(commands).toEqual([
        { expectedRevision: 1, command: { type: "pause", reason: "Review" } },
      ]);
      expect(monitor.state.reading?.campaign.revision).toBe(4);
      expect(monitor.state.reading?.campaign.status).toBe("ready");
      expect(monitor.state.problem).toContain("Campaign changed");
      await monitor.refresh();
      expect(monitor.state.problem).toContain("Campaign changed");
    } finally {
      monitor.dispose();
    }
  });

  it("reports confirmation only for a matching acknowledged command", async () => {
    const monitor = createRoot(() =>
      createCampaignMonitor(fakeClient({ command: async () => reading(2) })),
    );
    try {
      await monitor.open("campaign-one");
      await ready(monitor);
      expect(await monitor.command({ type: "pause", reason: "Review" })).toBe(true);
      expect(monitor.state.reading?.sequence).toBe(2);
      expect(monitor.state.busy).toBe(false);
      expect(monitor.state.requested).toBeNull();
    } finally {
      monitor.dispose();
    }
  });

  it("does not duplicate pending commands or confirm one after leaving its campaign", async () => {
    const result = deferred<CampaignReading>();
    const command = vi.fn(() => result.promise);
    const monitor = createRoot(() => createCampaignMonitor(fakeClient({ command })));
    try {
      await monitor.open("campaign-one");
      await ready(monitor);
      const pending = monitor.command({ type: "pause", reason: "Review" });
      expect(await monitor.command({ type: "pause", reason: "Review" })).toBe(false);
      expect(command).toHaveBeenCalledTimes(1);
      await monitor.open("another-campaign");
      result.resolve(reading(2));
      expect(await pending).toBe(false);
      expect(monitor.state.selected).toBe("another-campaign");
      expect(monitor.state.problem).toBeNull();
    } finally {
      monitor.dispose();
    }
  });

  it("keeps an unconfirmed request visible after a later snapshot without replaying it", async () => {
    const command = vi.fn(async () => {
      throw new Error("Connection lost");
    });
    const monitor = createRoot(() => createCampaignMonitor(fakeClient({ command })));
    try {
      await monitor.open("campaign-one");
      await ready(monitor);
      expect(await monitor.command({ type: "pause", reason: "Review" })).toBe(false);
      expect(monitor.state.stale).toBe(true);
      await monitor.refresh();
      expect(monitor.state.problem).toContain("not confirmed");
      expect(command).toHaveBeenCalledTimes(1);
    } finally {
      monitor.dispose();
    }
  });

  it.each([
    () => new Response("incomplete", { status: 200 }),
    () => Response.json({}, { status: 200 }),
    () => Response.json({ detail: "Connection failed after dispatch" }, { status: 503 }),
  ])("keeps unreadable acknowledgements and server failures unconfirmed", async (response) => {
    const request = vi.fn(async () => response());
    const transport = campaignsOverFetch(request);
    const monitor = createRoot(() =>
      createCampaignMonitor(fakeClient({ command: transport.command })),
    );
    try {
      await monitor.open("campaign-one");
      await ready(monitor);
      expect(await monitor.command({ type: "pause" })).toBe(false);
      expect(monitor.state.stale).toBe(true);
      expect(monitor.state.problem).toContain("not confirmed");
      expect(await monitor.command({ type: "pause" })).toBe(false);
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      monitor.dispose();
    }
  });

  it("keeps a resync gap stale when a pre-gap read completes and the fresh read fails", async () => {
    const queue = eventQueue();
    const oldRead = deferred<CampaignReading>();
    const command = vi.fn(async () => reading(5));
    let reads = 0;
    const monitor = createRoot(() =>
      createCampaignMonitor(
        fakeClient({
          read: async () => {
            reads += 1;
            if (reads === 3) return oldRead.promise;
            if (reads === 4) throw new Error("Snapshot unavailable");
            return reading(reads >= 5 ? 4 : 1);
          },
          watch: (_id, _cursor, signal) => queue.watch(signal),
          command,
        }),
      ),
    );
    try {
      await monitor.open("campaign-one");
      await ready(monitor);
      queue.push(eventAt(2));
      await vi.waitFor(() => expect(reads).toBe(3));
      queue.push({ kind: "resync" });
      await vi.waitFor(() => expect(monitor.state.stale).toBe(true));
      await Promise.resolve();
      oldRead.resolve(reading(2));
      await vi.waitFor(() => expect(reads).toBe(4));
      expect(monitor.state.reading?.sequence).toBe(1);
      expect(monitor.state.stale).toBe(true);
      expect(await monitor.command({ type: "pause", reason: "Review" })).toBe(false);
      expect(command).not.toHaveBeenCalled();
      await monitor.refresh();
      expect(monitor.state.stale).toBe(false);
      expect(monitor.state.reading?.sequence).toBe(4);
    } finally {
      monitor.dispose();
    }
  });

  it("does not dispatch commands while the live connection is unavailable", async () => {
    const command = vi.fn(async () => reading(2));
    const monitor = createRoot(() =>
      createCampaignMonitor(
        fakeClient({
          command,
          watch: () => ({
            [Symbol.asyncIterator]: () => ({
              next: async () => {
                throw new CampaignRequestError(403, "Permission denied");
              },
            }),
          }),
        }),
      ),
    );
    try {
      await monitor.open("campaign-one");
      await vi.waitFor(() => expect(monitor.state.connection).toBe("offline"));
      expect(await monitor.command({ type: "pause", reason: "Review" })).toBe(false);
      expect(command).not.toHaveBeenCalled();
    } finally {
      monitor.dispose();
    }
  });

  it("does not clear a resync gap when the stream catches up to an already newer snapshot", async () => {
    const queue = eventQueue();
    const fresh = deferred<CampaignReading>();
    let reads = 0;
    const monitor = createRoot(() =>
      createCampaignMonitor(
        fakeClient({
          read: async () => {
            reads += 1;
            if (reads >= 4) return fresh.promise;
            return reading(reads === 3 ? 5 : 1);
          },
          watch: (_id, _cursor, signal) => queue.watch(signal),
        }),
      ),
    );
    try {
      await monitor.open("campaign-one");
      await ready(monitor);
      await monitor.refresh();
      expect(monitor.state.reading?.sequence).toBe(5);
      queue.push({ kind: "resync" });
      await vi.waitFor(() => expect(reads).toBe(4));
      queue.push(eventAt(2));
      queue.push({ kind: "heartbeat", at: 3000 });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(monitor.state.stale).toBe(true);
      fresh.resolve(reading(5));
      await ready(monitor);
    } finally {
      monitor.dispose();
    }
  });

  it("ignores an obsolete read failure after a post-gap snapshot has recovered", async () => {
    const queue = eventQueue();
    const obsolete = deferred<CampaignReading>();
    let reads = 0;
    const monitor = createRoot(() =>
      createCampaignMonitor(
        fakeClient({
          read: async () => (++reads === 3 ? obsolete.promise : reading(reads >= 4 ? 2 : 1)),
          watch: (_id, _cursor, signal) => queue.watch(signal),
        }),
      ),
    );
    try {
      await monitor.open("campaign-one");
      await ready(monitor);
      const pending = monitor.refresh();
      queue.push({ kind: "resync" });
      await vi.waitFor(() => expect(monitor.state.reading?.sequence).toBe(2));
      obsolete.reject(new Error("Old connection failed"));
      await pending;
      expect(monitor.state.problem).toBeNull();
      expect(monitor.state.stale).toBe(false);
    } finally {
      monitor.dispose();
    }
  });
});

async function ready(monitor: CampaignMonitor): Promise<void> {
  await vi.waitFor(() => {
    expect(monitor.state.connection).toBe("live");
    expect(monitor.state.stale).toBe(false);
  });
}

function reading(sequence: number, id = "campaign-one"): CampaignReading {
  return { campaign: campaignFixture({ id, revision: sequence }), sequence };
}

function eventAt(sequence: number): CampaignStreamItem {
  return {
    kind: "event",
    event: {
      schemaVersion: 1,
      id: `event-${sequence}`,
      campaignId: "campaign-one",
      sequence,
      commandId: `command-${sequence}`,
      kind: "updated",
      at: 2_000,
      actor: { id: "controller", role: "controller" },
      summary: "Updated",
      refs: [],
    },
  };
}

function fakeClient(overrides: Partial<CampaignsClient> = {}): CampaignsClient {
  const queue = eventQueue();
  return {
    list: async () => [],
    cartridges: async () => [],
    export: async (_id, artifactId, path) => ({ artifactId, path }),
    read: async (id) => reading(1, id),
    create: async () => reading(1),
    command: async () => reading(1),
    artifact: async () => ({
      artifactId: "baseline",
      path: "report.md",
      mimeType: "text/plain",
      content: "Artifact",
      truncated: false,
      totalBytes: 8,
    }),
    watch: (_id, _cursor, signal) => queue.watch(signal),
    ...overrides,
  };
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  let reject: (cause: unknown) => void = () => undefined;
  const promise = new Promise<Value>((answer, refuse) => {
    resolve = answer;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

function eventQueue() {
  const pending: CampaignStreamItem[] = [];
  let receive: ((item: CampaignStreamItem | null) => void) | undefined;
  return {
    push(item: CampaignStreamItem) {
      if (receive === undefined) pending.push(item);
      else {
        const deliver = receive;
        receive = undefined;
        deliver(item);
      }
    },
    async *watch(signal: AbortSignal): AsyncIterable<CampaignStreamItem> {
      yield { kind: "connected" };
      while (!signal.aborted) {
        const item =
          pending.shift() ??
          (await new Promise<CampaignStreamItem | null>((resolve) => {
            const abort = () => resolve(null);
            signal.addEventListener("abort", abort, { once: true });
            receive = (item) => {
              signal.removeEventListener("abort", abort);
              resolve(item);
            };
            if (signal.aborted) abort();
          }));
        if (item === null) return;
        yield item;
      }
    },
  };
}
