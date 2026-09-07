import type { BusEnvelope } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { type Fetch, keyworkClient, reconnectDelayMs, ServerRefusal } from "./client.ts";
import type { StreamNotice } from "./sse.ts";

const ticket = { url: "http://127.0.0.1:4770/", token: "t0k3n" };

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function recordingFetch(answer: (call: Call) => Response): { calls: Call[]; fetch: Fetch } {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init = {}) => {
    const call: Call = {
      url,
      method: init.method ?? "GET",
      headers: Object.fromEntries(
        Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ]),
      ),
      body: typeof init.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    return answer(call);
  };
  return { calls, fetch };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function sse(frames: string[]): Response {
  return new Response(frames.join(""), { status: 200 });
}

function frame(envelope: BusEnvelope): string {
  return `id: ${envelope.id}\nevent: ${envelope.type}\ndata: ${JSON.stringify(envelope)}\n\n`;
}

function modeEnvelope(id: number): BusEnvelope {
  return {
    id,
    ts: "2026-09-06T12:00:00.000Z",
    sessionId: "s1",
    type: "session.mode",
    payload: { mode: `m${id}` },
  };
}

describe("keyworkClient routes", () => {
  it("sends the bearer token on every route and trims the url", async () => {
    const { calls, fetch } = recordingFetch((call) => {
      if (call.url.endsWith("/sessions") && call.method === "GET")
        return json(200, { sessions: [] });
      if (call.url.endsWith("/sessions")) return json(201, { id: "s1" });
      if (call.url.endsWith("/sessions/s1")) return json(200, { id: "s1", messages: [] });
      if (call.url.endsWith("/prompt")) return json(202, { sessionId: "s1", accepted: true });
      if (call.url.endsWith("/abort")) return json(200, { sessionId: "s1", interrupted: true });
      return json(404, { error: "no such route" });
    });
    const client = keyworkClient(ticket, { fetch });
    expect(client.url).toBe("http://127.0.0.1:4770");
    expect(await client.sessions()).toEqual([]);
    expect((await client.createSession()).id).toBe("s1");
    expect((await client.session("s1"))?.id).toBe("s1");
    expect(await client.prompt("s1", "hi")).toBe("accepted");
    expect(await client.abort("s1")).toBe("aborted");
    for (const call of calls) expect(call.headers.authorization).toBe("Bearer t0k3n");
    expect(calls.find((call) => call.url.endsWith("/prompt"))?.body).toBe('{"text":"hi"}');
  });

  it("reports missing sessions as outcomes rather than errors", async () => {
    const { fetch } = recordingFetch(() => json(404, { error: "no session has that id" }));
    const client = keyworkClient(ticket, { fetch });
    expect(await client.session("nope")).toBeUndefined();
    expect(await client.prompt("nope", "hi")).toBe("missing");
    expect(await client.abort("nope")).toBe("missing");
  });

  it("raises a ServerRefusal carrying the server's detail", async () => {
    const { fetch } = recordingFetch((call) =>
      call.url.endsWith("/sessions")
        ? new Response("", { status: 401 })
        : json(400, { error: "the body is not { text }" }),
    );
    const client = keyworkClient(ticket, { fetch });
    await expect(client.sessions()).rejects.toMatchObject({
      status: 401,
      message: "the server refused the token",
    });
    await expect(client.prompt("s1", "")).rejects.toThrow(ServerRefusal);
    await expect(client.prompt("s1", "")).rejects.toThrow("the body is not { text }");
  });

  it("reads the server document without a token and summarizes it", async () => {
    const { calls, fetch } = recordingFetch(() =>
      json(200, {
        info: { version: "0.0.1" },
        paths: {
          "/doc": { get: { operationId: "getDocument" } },
          "/sessions": {
            get: { operationId: "listSessions" },
            post: { operationId: "createSession" },
          },
        },
      }),
    );
    const doc = await keyworkClient(ticket, { fetch }).document();
    expect(doc).toEqual({
      version: "0.0.1",
      operationIds: ["createSession", "getDocument", "listSessions"],
    });
    expect(calls[0]?.headers.authorization).toBeUndefined();
  });
});

describe("keyworkClient events", () => {
  it("yields envelopes, surfaces notices, and resumes from the last id after a drop", async () => {
    let streams = 0;
    const { calls, fetch } = recordingFetch(() => {
      streams += 1;
      if (streams === 1)
        return sse([": connected\n\n", frame(modeEnvelope(1)), frame(modeEnvelope(2))]);
      return sse([": resumed with a gap, events 3 to 3 are gone\n\n", frame(modeEnvelope(4))]);
    });
    const delays: number[] = [];
    const notices: StreamNotice[] = [];
    const stop = new AbortController();
    const seen: number[] = [];
    const client = keyworkClient(ticket, { fetch, delay: async (ms) => void delays.push(ms) });
    for await (const envelope of client.events({
      signal: stop.signal,
      onNotice: (n) => notices.push(n),
    })) {
      seen.push(envelope.id);
      if (envelope.id === 4) stop.abort();
    }
    expect(seen).toEqual([1, 2, 4]);
    expect(delays).toEqual([250]);
    expect(calls[1]?.headers["last-event-id"]).toBe("2");
    expect(notices).toEqual([{ kind: "connected" }, { kind: "gap", from: 3, to: 3 }]);
  });

  it("starts from `since` and stops cleanly on abort without reconnecting", async () => {
    const stop = new AbortController();
    const { calls, fetch } = recordingFetch(() => {
      stop.abort();
      return sse([frame(modeEnvelope(9))]);
    });
    const seen: number[] = [];
    for await (const envelope of keyworkClient(ticket, { fetch }).events({
      since: 8,
      signal: stop.signal,
    })) {
      seen.push(envelope.id);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers["last-event-id"]).toBe("8");
    expect(seen).toEqual([]);
  });

  it("refuses to loop on a rejected token", async () => {
    const { fetch } = recordingFetch(() => new Response("", { status: 401 }));
    const events = keyworkClient(ticket, { fetch }).events();
    await expect(events[Symbol.asyncIterator]().next()).rejects.toThrow(ServerRefusal);
  });

  it("backs off from 250ms doubling to a 5s ceiling", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(reconnectDelayMs)).toEqual([
      250, 500, 1000, 2000, 4000, 5000, 5000,
    ]);
  });
});
