import type { Fetch } from "@keywork-app/client";
import type { RoutineFile } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { fakeRanch, wrenDetail, wrenRemoval, wrenRoutines } from "./testing.ts";
import {
  creatureClient,
  creatureDetailSchema,
  modelPolicySchema,
  statusOfRefusal,
} from "./wire.ts";

interface Seen {
  method: string;
  path: string;
  body: string | undefined;
  contentType: string | undefined;
}

const tidyFile: RoutineFile = {
  title: "storehouse tidy",
  instructions: "fold old shelves",
  trigger: { kind: "manual" },
  enabled: true,
};

function fetchServing(answer: (seen: Seen) => { status: number; body?: unknown } | Error): {
  fetch: Fetch;
  seen: Seen[];
} {
  const seen: Seen[] = [];
  const fetch: Fetch = async (path, init = {}) => {
    const headers = init.headers as Record<string, string> | undefined;
    const call: Seen = {
      method: init.method ?? "GET",
      path,
      body: typeof init.body === "string" ? init.body : undefined,
      contentType: headers?.["content-type"],
    };
    seen.push(call);
    const served = answer(call);
    if (served instanceof Error) throw served;
    return new Response(served.body === undefined ? null : JSON.stringify(served.body), {
      status: served.status,
      statusText: `status ${served.status}`,
    });
  };
  return { fetch, seen };
}

const unreachable = (): { fetch: Fetch; seen: Seen[] } =>
  fetchServing(() => new Error("raw fetch must not be used here"));

describe("the creature client over the typed ranch routes", () => {
  it("prefers the ranch routes the client carries for the five routes they serve, and projects their answers", async () => {
    const ranch = fakeRanch();
    const client = creatureClient({ fetch: unreachable().fetch, ranch: ranch.routes });
    const read = await client.read("wren");
    expect(read.ok && read.value.name).toBe("Wren");
    const asked = await client.removal("wren", true);
    expect(asked.ok && asked.value.stays.workshop).toBe("ws-wren");
    const done = await client.remove("wren", false);
    expect(done.ok && done.value.goes.workshop).toBe("ws-wren");
    const routines = await client.routines("wren");
    expect(routines.ok && routines.value.map((row) => [row.id, row.schedule.enabled])).toEqual([
      ["nightly", true],
      ["tidy", false],
    ]);
    const put = await client.putRoutine("wren", "tidy", tidyFile);
    expect(put.ok && put.value.schedule.enabled).toBe(true);
    const health = await client.workshopHealth("ws-wren");
    expect(health.ok && health.value.health).toBe("up");
    expect(ranch.calls.map((call) => call[0])).toEqual([
      "creature",
      "removeCreature",
      "removeCreature",
      "routines",
      "putRoutine",
      "workshopHealth",
    ]);
    expect(ranch.calls[1]).toEqual([
      "removeCreature",
      "wren",
      { confirmed: false, keepWorkshop: true },
    ]);
    expect(ranch.calls[2]).toEqual([
      "removeCreature",
      "wren",
      { confirmed: true, keepWorkshop: false },
    ]);
  });

  it("turns a served refusal into a reading carrying the status its kind stands for", async () => {
    const ranch = fakeRanch({
      detail: { refused: "missing", detail: "no creature has that slug" },
    });
    const client = creatureClient({ fetch: unreachable().fetch, ranch: ranch.routes });
    expect(await client.read("wren")).toEqual({
      ok: false,
      status: 404,
      detail: "no creature has that slug",
    });
    expect(statusOfRefusal("deferred")).toBe(501);
    expect(statusOfRefusal("unserved")).toBe(503);
    expect(statusOfRefusal("conflict")).toBe(409);
  });

  it("still reaches the routes the ranch client lacks over raw fetch", async () => {
    const { fetch, seen } = fetchServing(() => ({ status: 404, body: { error: "no route" } }));
    const client = creatureClient({ fetch, ranch: fakeRanch().routes });
    expect(await client.change("wren", { name: "Tam" })).toEqual({
      ok: false,
      status: 404,
      detail: "no route",
    });
    expect(await client.report("wren")).toEqual({ ok: false, status: 404, detail: "no route" });
    expect(seen.map((call) => `${call.method} ${call.path}`)).toEqual([
      "PATCH /creatures/wren",
      "GET /creatures/wren/report",
    ]);
  });
});

describe("the creature client over raw fetch", () => {
  it("reads a creature as the fixture shapes it", async () => {
    const detail = wrenDetail();
    const { fetch, seen } = fetchServing(() => ({ status: 200, body: detail }));
    const read = await creatureClient({ fetch }).read("wren");
    expect(read.ok && read.value.name).toBe("Wren");
    expect(seen.map((call) => `${call.method} ${call.path}`)).toEqual(["GET /creatures/wren"]);
  });

  it("takes the 409 removal listing as the answer it asked for, and the confirmed 200 as the deed", async () => {
    const { fetch, seen } = fetchServing((call) =>
      call.path.includes("confirmed=true")
        ? { status: 200, body: { removed: true, removal: wrenRemoval(true) } }
        : {
            status: 409,
            body: { error: "removing wren needs confirmed=true", removal: wrenRemoval(false) },
          },
    );
    const client = creatureClient({ fetch });
    const asked = await client.removal("wren", false);
    expect(asked.ok && asked.value.goes.workshop).toBe("ws-wren");
    const done = await client.remove("wren", true);
    expect(done.ok && done.value.stays.workshop).toBe("ws-wren");
    expect(seen.map((call) => call.path)).toEqual([
      "/creatures/wren?confirmed=false&keepWorkshop=false",
      "/creatures/wren?confirmed=true&keepWorkshop=true",
    ]);
  });

  it("sends a change as JSON with its content type and puts a routine file back whole", async () => {
    const { fetch, seen } = fetchServing((call) =>
      call.method === "PATCH"
        ? { status: 404, body: { error: "no route" } }
        : { status: 200, body: { routine: wrenRoutines()[0] } },
    );
    const client = creatureClient({ fetch });
    const changed = await client.change("wren", { models: { loop: "inherit" } });
    expect(changed).toEqual({ ok: false, status: 404, detail: "no route" });
    const put = await client.putRoutine("wren", "tidy", { ...tidyFile, enabled: false });
    expect(put.ok).toBe(true);
    expect(seen[0]).toEqual({
      method: "PATCH",
      path: "/creatures/wren",
      body: '{"models":{"loop":"inherit"}}',
      contentType: "application/json",
    });
    expect(seen[1]?.method).toBe("PUT");
    expect(seen[1]?.path).toBe("/creatures/wren/routines/tidy");
    expect(JSON.parse(seen[1]?.body ?? "{}")).toMatchObject({
      enabled: false,
      title: "storehouse tidy",
    });
  });

  it("says plainly when a route answers a shape it cannot read, or when the node is unreachable", async () => {
    const odd = creatureClient(fetchServing(() => ({ status: 200, body: { nope: 1 } })));
    expect(await odd.read("wren")).toEqual({
      ok: false,
      status: 200,
      detail: "GET /creatures/wren answered a shape this pane cannot read",
    });
    const lost = creatureClient(fetchServing(() => new Error("no server")));
    expect(await lost.report("wren")).toEqual({ ok: false, status: 0, detail: "no server" });
    const silent = creatureClient(fetchServing(() => ({ status: 503 })));
    expect(await silent.workshopHealth("ws-wren")).toEqual({
      ok: false,
      status: 503,
      detail: "status 503",
    });
  });

  it("fills a missing model class with inherit and refuses a half reference", () => {
    expect(modelPolicySchema.parse({})).toEqual({
      strong: "inherit",
      loop: "inherit",
      decide: "inherit",
      vision: "inherit",
    });
    expect(modelPolicySchema.safeParse({ strong: { provider: "x" } }).success).toBe(false);
    expect(creatureDetailSchema.safeParse({ ...wrenDetail(), threads: [{ id: 1 }] }).success).toBe(
      false,
    );
  });
});
