import type { Fetch } from "@keywork-app/client";
import { describe, expect, it } from "vitest";
import { choresOverFetch } from "./port.ts";
import { morningRuns, morningTriage, nightlyTests, runRow, wren } from "./testing.ts";

interface Exchange {
  method: string;
  path: string;
  body: unknown;
}

function fakeNode(answer: (exchange: Exchange) => Response): { fetch: Fetch; seen: Exchange[] } {
  const seen: Exchange[] = [];
  const fetch: Fetch = async (path, init = {}) => {
    const exchange = {
      method: init.method ?? "GET",
      path,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    seen.push(exchange);
    return answer(exchange);
  };
  return { fetch, seen };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("the chores port over the node's routes", () => {
  it("reads creatures, chores and runs from their routes", async () => {
    const { fetch, seen } = fakeNode(({ path }) => {
      if (path === "/creatures") return json(200, { creatures: [{ ...wren, sigil: "w" }] });
      if (path.endsWith("/runs?limit=20")) return json(200, { runs: morningRuns });
      return json(200, { routines: [morningTriage] });
    });
    const port = choresOverFetch(fetch);
    expect(await port.creatures()).toEqual({ ok: true, value: [wren] });
    expect(await port.chores("wren")).toEqual({ ok: true, value: [morningTriage] });
    expect(await port.runs("wren", "morning-triage")).toEqual({ ok: true, value: morningRuns });
    expect(await port.notificationSettings()).toBeUndefined();
    expect(seen.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /creatures",
      "GET /creatures/wren/routines",
      "GET /creatures/wren/routines/morning-triage/runs?limit=20",
    ]);
  });

  it("writes the routine file with PUT and sends each verb to its own route", async () => {
    const run = runRow({ runId: "r-60", firedAt: "2026-11-05T15:00:00.000Z", status: "running" });
    const { fetch, seen } = fakeNode(({ method, path }) => {
      if (method === "PUT") return json(201, { routine: nightlyTests, created: true });
      if (path.endsWith("/run") || path.endsWith("/cancel")) return json(202, { run });
      if (path.endsWith("/accept")) return json(200, { routine: nightlyTests });
      return json(200, { removed: nightlyTests });
    });
    const port = choresOverFetch(fetch);
    const file = nightlyTests.routine;
    if (file === null) throw new Error("fixture without a routine");
    expect(await port.put("wren", file)).toEqual({
      ok: true,
      value: { row: nightlyTests, created: true },
    });
    expect((await port.run("wren", "nightly-tests")).ok).toBe(true);
    expect((await port.cancel("wren", "nightly-tests")).ok).toBe(true);
    expect((await port.accept("wren", "nightly-tests", "a1b2c3d4e5f60718")).ok).toBe(true);
    expect((await port.remove("wren", "nightly-tests")).ok).toBe(true);
    expect(seen).toEqual([
      { method: "PUT", path: "/creatures/wren/routines/nightly-tests", body: file },
      { method: "POST", path: "/creatures/wren/routines/nightly-tests/run", body: undefined },
      { method: "POST", path: "/creatures/wren/routines/nightly-tests/cancel", body: undefined },
      {
        method: "POST",
        path: "/creatures/wren/routines/nightly-tests/accept",
        body: { digest: "a1b2c3d4e5f60718" },
      },
      { method: "DELETE", path: "/creatures/wren/routines/nightly-tests", body: undefined },
    ]);
  });

  it("takes the skipped run a 409 carries as the answer, and the node's own words for a refusal", async () => {
    const skipped = runRow({
      runId: "r-61",
      firedAt: "2026-11-05T15:00:00.000Z",
      status: "skipped",
      reason: "the previous run r-60 is still active",
    });
    const { fetch } = fakeNode(({ path }) => {
      if (path.endsWith("/run")) return json(409, { run: skipped });
      if (path.endsWith("/cancel")) return json(409, { error: "the chore has no run in progress" });
      if (path === "/creatures")
        return json(503, { error: "creatures is not served by this host" });
      return new Response("<html>", { status: 502, statusText: "Bad Gateway" });
    });
    const port = choresOverFetch(fetch);
    expect(await port.run("wren", "morning-triage")).toEqual({ ok: true, value: skipped });
    expect(await port.cancel("wren", "morning-triage")).toEqual({
      ok: false,
      status: 409,
      error: "the chore has no run in progress",
    });
    expect(await port.creatures()).toEqual({
      ok: false,
      status: 503,
      error: "creatures is not served by this host",
    });
    expect(await port.chores("wren")).toEqual({ ok: false, status: 502, error: "502 Bad Gateway" });
  });

  it("names a shape it cannot read and a node it cannot reach, and escapes path segments", async () => {
    const unreadable = choresOverFetch(async () => json(200, { routines: [{ id: 1 }] }));
    expect(await unreadable.chores("wren")).toEqual({
      ok: false,
      status: 200,
      error: "the node answered /creatures/wren/routines in a shape this console does not read",
    });
    const unreachable = choresOverFetch(async () => {
      throw new Error("the node is not reachable");
    });
    expect(await unreachable.creatures()).toEqual({
      ok: false,
      status: 0,
      error: "the node is not reachable",
    });
    const { fetch, seen } = fakeNode(() => json(200, { routines: [] }));
    await choresOverFetch(fetch).chores("a b/c");
    expect(seen[0]?.path).toBe("/creatures/a%20b%2Fc/routines");
  });
});
