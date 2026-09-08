import type { BusEnvelope } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { type Fetch, keyworkClient, ServerRefusal } from "./client.ts";
import { serverFeed } from "./feed.ts";
import type { StreamNotice } from "./sse.ts";

const ticket = { url: "http://127.0.0.1:4770", token: "t" };

function envelope(id: number, sessionId = "s1", text = `t${id}`): BusEnvelope {
  return {
    id,
    ts: "2026-09-07T12:00:00.000Z",
    sessionId,
    type: "turn.delta",
    payload: { delta: { type: "text", text } },
  };
}

function frame(item: BusEnvelope): string {
  return `id: ${item.id}\nevent: ${item.type}\ndata: ${JSON.stringify(item)}\n\n`;
}

function streaming(chunks: string[], hold: Promise<void>): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        await hold;
        controller.close();
      },
    }),
    { status: 200 },
  );
}

function manualTick(): { tick: (flush: () => void) => void; flush: () => void } {
  let pending: (() => void) | undefined;
  return {
    tick: (flush) => {
      pending = flush;
    },
    flush: () => {
      const flush = pending;
      pending = undefined;
      flush?.();
    },
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 5));

describe("serverFeed", () => {
  it("opens one stream, batches per frame with deltas coalesced, and filters per session", async () => {
    let streams = 0;
    const hold = deferred();
    const fetch: Fetch = async () => {
      streams += 1;
      return streaming(
        [": connected\n\n", frame(envelope(1)), frame(envelope(2)), frame(envelope(3, "s2"))],
        hold.promise,
      );
    };
    const frames = manualTick();
    const feed = serverFeed(keyworkClient(ticket, { fetch }), { tick: frames.tick });
    const all: BusEnvelope[][] = [];
    const mine: BusEnvelope[][] = [];
    const notices: StreamNotice[] = [];
    feed.onNotice((notice) => notices.push(notice));
    feed.subscribe((batch) => all.push([...batch]));
    feed.subscribeSession("s2", (batch) => mine.push([...batch]));
    await feed.open();
    await feed.open();
    await settle();
    expect(all).toEqual([]);
    frames.flush();
    expect(all).toHaveLength(1);
    expect(all[0]?.map((item) => item.id)).toEqual([2, 3]);
    expect(all[0]?.[0]?.payload).toEqual({ delta: { type: "text", text: "t1t2" } });
    expect(mine).toEqual([[envelope(3, "s2")]]);
    expect(notices).toEqual([{ kind: "connected" }]);
    expect(streams).toBe(1);
    feed.close();
    hold.resolve();
  });

  it("survives a dropped stream by resuming, and reports a gap notice", async () => {
    let streams = 0;
    const hold = deferred();
    const fetch: Fetch = async (_url, init) => {
      streams += 1;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (streams === 1) return streaming([frame(envelope(1))], Promise.resolve());
      expect(headers["last-event-id"]).toBe("1");
      return streaming(
        [": resumed with a gap, events 2 to 2 are gone\n\n", frame(envelope(3))],
        hold.promise,
      );
    };
    const feed = serverFeed(keyworkClient(ticket, { fetch, delay: async () => undefined }), {
      tick: (flush) => flush(),
    });
    const seen: number[] = [];
    const notices: StreamNotice[] = [];
    feed.onNotice((notice) => notices.push(notice));
    feed.subscribe((batch) => seen.push(...batch.map((item) => item.id)));
    await feed.open();
    await settle();
    expect(seen).toEqual([1, 3]);
    expect(notices).toEqual([{ kind: "gap", from: 2, to: 2 }]);
    feed.close();
    hold.resolve();
  });

  it("is lost, not retried, when the server refuses the token", async () => {
    const fetch: Fetch = async () => new Response("", { status: 401 });
    const feed = serverFeed(keyworkClient(ticket, { fetch }), { tick: (flush) => flush() });
    const reasons: Error[] = [];
    feed.whenLost((reason) => reasons.push(reason));
    await expect(feed.open()).rejects.toBeInstanceOf(ServerRefusal);
    expect(reasons).toHaveLength(1);
    const late: Error[] = [];
    feed.whenLost((reason) => late.push(reason));
    expect(late).toEqual(reasons);
  });

  it("flushes what is pending when closed", async () => {
    const hold = deferred();
    const fetch: Fetch = async () => streaming([frame(envelope(1))], hold.promise);
    const frames = manualTick();
    const feed = serverFeed(keyworkClient(ticket, { fetch }), { tick: frames.tick });
    const seen: number[] = [];
    feed.subscribe((batch) => seen.push(...batch.map((item) => item.id)));
    await feed.open();
    await settle();
    expect(seen).toEqual([]);
    feed.close();
    expect(seen).toEqual([1]);
    hold.resolve();
  });
});
