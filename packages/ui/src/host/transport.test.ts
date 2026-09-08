import { describe, expect, it } from "vitest";
import { browserHost } from "./browser.ts";
import type { HostPort, ServerResponseHead } from "./port.ts";
import { hostFetch, plainInit } from "./transport.ts";

const encoder = new TextEncoder();

function hostAnswering(
  chunks: string[],
  status = 200,
): { host: HostPort; seen: unknown[]; cancelled: () => boolean } {
  const seen: unknown[] = [];
  let cancelled = false;
  const head = (): ServerResponseHead => {
    const queue = chunks.map((chunk) => encoder.encode(chunk));
    return {
      status,
      statusText: "",
      headers: [["content-type", "application/json"]],
      read: async () => queue.shift(),
      cancel: () => {
        cancelled = true;
      },
    };
  };
  const host: HostPort = {
    ...browserHost(),
    serverFetch: async (workspace, path, init) => {
      seen.push({ workspace, path, init });
      return head();
    },
  };
  return { host, seen, cancelled: () => cancelled };
}

describe("hostFetch", () => {
  it("routes a request through the host with a plain init and reassembles the streamed body", async () => {
    const { host, seen } = hostAnswering(['{"sess', 'ions":[]}']);
    const response = await hostFetch(host, "C:/work")("/sessions", {
      method: "POST",
      headers: new Headers({ "content-type": "application/json" }),
      body: '{"text":"hi"}',
    });
    expect(seen[0]).toEqual({
      workspace: "C:/work",
      path: "/sessions",
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"text":"hi"}',
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ sessions: [] });
  });

  it("cancels the host stream when the caller aborts", async () => {
    const { host, cancelled } = hostAnswering(["never"]);
    const stop = new AbortController();
    await hostFetch(host, "C:/work")("/events", { signal: stop.signal });
    stop.abort();
    expect(cancelled()).toBe(true);
  });

  it("gives a bodyless response for 204", async () => {
    const { host } = hostAnswering([], 204);
    const response = await hostFetch(host, "C:/work")("/x");
    expect(response.body).toBeNull();
  });

  it("flattens every headers shape to a record", () => {
    expect(plainInit({ headers: [["a", "1"]] }).headers).toEqual({ a: "1" });
    expect(plainInit({ headers: { b: "2" } }).headers).toEqual({ b: "2" });
    expect(plainInit({}).method).toBe("GET");
  });
});
