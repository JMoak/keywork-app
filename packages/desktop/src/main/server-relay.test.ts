import { describe, expect, it } from "vitest";
import type { RelayEnd, RelayRequest } from "../shared/channels.ts";
import { relayRefusedStatus, serverRelay } from "./server-relay.ts";

const ticket = { url: "http://127.0.0.1:4770", token: "secret" };

function request(overrides: Partial<RelayRequest> = {}): RelayRequest {
  return {
    requestId: 1,
    workspace: "C:/work",
    path: "/sessions",
    method: "GET",
    headers: {},
    body: undefined,
    ...overrides,
  };
}

function sink() {
  const chunks: string[] = [];
  const ends: RelayEnd[] = [];
  const decoder = new TextDecoder();
  return {
    chunks,
    ends,
    sink: {
      chunk: (_id: number, bytes: Uint8Array) => {
        chunks.push(decoder.decode(bytes));
      },
      end: (end: RelayEnd) => {
        ends.push(end);
      },
    },
  };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("serverRelay", () => {
  it("adds the bearer token in main, forwards the path, and streams the body back in chunks", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const relay = serverRelay({
      ticketFor: () => ticket,
      fetch: async (url, init) => {
        seen.push({ url, init });
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("id: 1\n"));
            controller.enqueue(new TextEncoder().encode("data: {}\n\n"));
            controller.close();
          },
        });
        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    });
    const out = sink();
    const head = await relay.start(
      request({ path: "/events", headers: { "last-event-id": "7" } }),
      out.sink,
    );
    await settled();
    expect(head.status).toBe(200);
    expect(head.headers).toEqual([["content-type", "text/event-stream"]]);
    expect(seen[0]?.url).toBe("http://127.0.0.1:4770/events");
    expect(seen[0]?.init.headers).toEqual({ "last-event-id": "7", authorization: "Bearer secret" });
    expect(out.chunks.join("")).toBe("id: 1\ndata: {}\n\n");
    expect(out.ends).toEqual([{ requestId: 1 }]);
  });

  it("never lets a renderer-supplied authorization header replace the ticket", async () => {
    let sent: RequestInit | undefined;
    const relay = serverRelay({
      ticketFor: () => ticket,
      fetch: async (_url, init) => {
        sent = init;
        return new Response(null, { status: 204 });
      },
    });
    await relay.start(request({ headers: { authorization: "Bearer forged" } }), sink().sink);
    const headers = (sent?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret");
  });

  it("refuses a workspace with no open server and reports an unreachable server", async () => {
    const relay = serverRelay({
      ticketFor: (workspace) => (workspace === "C:/work" ? ticket : undefined),
      fetch: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const missing = await relay.start(request({ workspace: "D:/other" }), sink().sink);
    expect(missing.status).toBe(relayRefusedStatus);
    expect(missing.statusText).toContain("no server is open");
    const down = await relay.start(request(), sink().sink);
    expect(down.status).toBe(relayRefusedStatus);
    expect(down.statusText).toContain("ECONNREFUSED");
  });

  it("aborts an in-flight stream and ends it with the reason", async () => {
    let abortSignal: AbortSignal | undefined;
    const relay = serverRelay({
      ticketFor: () => ticket,
      fetch: async (_url, init) => {
        abortSignal = init.signal ?? undefined;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            init.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
          },
        });
        return new Response(body, { status: 200 });
      },
    });
    const out = sink();
    await relay.start(request({ requestId: 9 }), out.sink);
    relay.abort(9);
    await settled();
    expect(abortSignal?.aborted).toBe(true);
    expect(out.ends).toEqual([{ requestId: 9, error: "aborted" }]);
  });
});
