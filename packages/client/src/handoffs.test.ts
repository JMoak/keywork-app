import { describe, expect, it } from "vitest";
import { type Fetch, keyworkClient } from "./client.ts";

const ticket = { url: "http://127.0.0.1:4770/", token: "t0k3n" };

function serving(answer: () => Response): { urls: string[]; fetch: Fetch } {
  const urls: string[] = [];
  const fetch: Fetch = async (url, init = {}) => {
    urls.push(`${init.method ?? "GET"} ${url}`);
    return answer();
  };
  return { urls, fetch };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the hand-off tally", () => {
  it("answers a refusal from a host that keeps no tally, and from an older server", async () => {
    const unkept = keyworkClient(ticket, {
      fetch: serving(() => json(503, { error: "this host keeps no hand-off tally" })).fetch,
    });
    expect(await unkept.creatureHandoffs()).toEqual({
      refused: "unserved",
      detail: "this host keeps no hand-off tally",
    });
    const older = keyworkClient(ticket, {
      fetch: serving(() => new Response("not found", { status: 404 })).fetch,
    });
    expect(await older.creatureHandoffs()).toMatchObject({ refused: "missing" });
  });
});
