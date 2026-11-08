import type { Setting } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { type Fetch, keyworkClient } from "./client.ts";

const ticket = { url: "http://127.0.0.1:4770/", token: "t0k3n" };

const setting: Setting = {
  id: "set-1",
  creature: "wren",
  sessionId: "s1",
  what: { kind: "file", ref: "src/app.ts", title: "the change you asked for" },
  rung: "card",
  why: "you asked to see the entry point",
  at: "2026-11-08T09:00:00.000Z",
  until: "seen",
  state: "live",
};

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body: string | undefined;
}

function serving(answer: (call: Call) => Response): { calls: Call[]; fetch: Fetch } {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init = {}) => {
    const call = {
      url,
      method: init.method ?? "GET",
      body: typeof init.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    return answer(call);
  };
  return { calls, fetch };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the yard's routes", () => {
  it("lists the live settings with GET /show for a cold start", async () => {
    const server = serving(() => json(200, { settings: [setting] }));
    const client = keyworkClient(ticket, { fetch: server.fetch });
    expect(await client.settings()).toEqual([setting]);
    expect(server.calls).toEqual([
      { url: "http://127.0.0.1:4770/show", method: "GET", body: undefined },
    ]);
  });

  it("posts the keeper's outcome to POST /show/{id}/answer and settles nothing itself", async () => {
    const server = serving(() => json(200, { ...setting, state: "dismissed" }));
    const client = keyworkClient(ticket, { fetch: server.fetch });
    expect(await client.answerSetting("set 1", "dismissed")).toBeUndefined();
    expect(server.calls).toEqual([
      {
        url: "http://127.0.0.1:4770/show/set%201/answer",
        method: "POST",
        body: JSON.stringify({ outcome: "dismissed" }),
      },
    ]);
  });

  it("returns the server's refusal in its own words", async () => {
    const server = serving(() =>
      json(409, { error: "setting set-1 is pinned; unpin or dismiss it" }),
    );
    const client = keyworkClient(ticket, { fetch: server.fetch });
    expect(await client.answerSetting("set-1", "seen")).toEqual({
      refused: "conflict",
      detail: "setting set-1 is pinned; unpin or dismiss it",
    });
    expect(await client.settings()).toMatchObject({ refused: "conflict" });
  });
});
