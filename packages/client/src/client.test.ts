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
      if (call.url.endsWith("/prompt")) {
        const queued = call.body?.includes("queue") === true;
        return json(202, { sessionId: "s1", accepted: true, queued, behavior: "queue" });
      }
      if (call.url.endsWith("/inject")) {
        const queued = call.body?.includes("and then") === true;
        return json(202, { sessionId: "s1", accepted: true, queued });
      }
      if (call.url.endsWith("/abort")) return json(200, { sessionId: "s1", interrupted: true });
      return json(404, { error: "no such route" });
    });
    const client = keyworkClient(ticket, { fetch });
    expect(client.url).toBe("http://127.0.0.1:4770");
    expect(await client.sessions()).toEqual([]);
    expect((await client.createSession()).id).toBe("s1");
    expect((await client.session("s1"))?.id).toBe("s1");
    expect(await client.prompt("s1", "hi", "steer")).toBe("started");
    expect(await client.prompt("s1", "later", "queue")).toBe("queued");
    expect(await client.inject("s1", { text: "from voice", client: "wispr-flow" })).toBe("started");
    expect(await client.inject("s1", { text: "and then", client: "wispr-flow" })).toBe("queued");
    expect(await client.abort("s1")).toBe("aborted");
    for (const call of calls) expect(call.headers.authorization).toBe("Bearer t0k3n");
    expect(calls.filter((call) => call.url.endsWith("/prompt")).map((call) => call.body)).toEqual([
      '{"text":"hi","behavior":"steer"}',
      '{"text":"later","behavior":"queue"}',
    ]);
    expect(calls.find((call) => call.url.endsWith("/inject"))?.body).toBe(
      '{"text":"from voice","client":"wispr-flow"}',
    );
  });

  it("reports missing sessions as outcomes rather than errors", async () => {
    const { fetch } = recordingFetch(() => json(404, { error: "no session has that id" }));
    const client = keyworkClient(ticket, { fetch });
    expect(await client.session("nope")).toBeUndefined();
    expect(await client.prompt("nope", "hi", "queue")).toBe("missing");
    expect(await client.inject("nope", { text: "hi", client: "cli" })).toBe("missing");
    expect(await client.abort("nope")).toBe("missing");
    expect(await client.entries("nope")).toBeUndefined();
    expect(await client.fork("nope", "e1")).toBe("missing");
    expect(await client.labelEntry("nope", "e1", "x")).toBe("missing");
    expect(await client.moveLeaf("nope", "e1")).toBe("missing");
    expect(await client.changes("nope")).toBe("missing");
    expect(await client.changedFile("nope", "a.txt")).toBe("missing");
  });

  it("walks the tree routes: entries, fork, label, and leaf with their bodies", async () => {
    const forked = { sessionId: "s2" };
    const { calls, fetch } = recordingFetch((call) => {
      if (call.url.endsWith("/entries")) return json(200, { sessionId: "s1", entries: [] });
      if (call.url.endsWith("/fork")) return json(201, forked);
      if (call.url.endsWith("/label")) return json(200, { entryId: "e1", label: null });
      if (call.url.endsWith("/leaf")) return json(200, { leafId: "e1" });
      return json(404, { error: "no such route" });
    });
    const client = keyworkClient(ticket, { fetch });
    expect((await client.entries("s1"))?.sessionId).toBe("s1");
    expect(await client.fork("s1", "e1")).toEqual(forked);
    expect(await client.labelEntry("s1", "e1", null)).toEqual({ entryId: "e1", label: null });
    expect(await client.moveLeaf("s1", "e1")).toEqual({ leafId: "e1" });
    expect(calls.map((call) => call.body)).toEqual([
      undefined,
      '{"entryId":"e1"}',
      '{"entryId":"e1","label":null}',
      '{"entryId":"e1"}',
    ]);
  });

  it("tells an unknown entry from a missing session and a busy leaf move from a baseline gap", async () => {
    const { fetch } = recordingFetch((call) => {
      if (call.url.endsWith("/leaf")) return json(409, { error: "a turn is running" });
      if (call.url.includes("/changes")) return json(409, { error: "no baseline" });
      return json(404, { error: "no entry has that id" });
    });
    const client = keyworkClient(ticket, { fetch });
    expect(await client.fork("s1", "e9")).toBe("unknown-entry");
    expect(await client.labelEntry("s1", "e9", "x")).toBe("unknown-entry");
    expect(await client.moveLeaf("s1", "e9")).toBe("busy");
    expect(await client.changes("s1")).toBe("no-baseline");
    expect(await client.changedFile("s1", "a.txt")).toBe("no-baseline");
  });

  it("reads changes and one changed file by its query path", async () => {
    const changes = { baseline: "session start", files: [] };
    const { calls, fetch } = recordingFetch((call) => {
      if (call.url.endsWith("/changes")) return json(200, changes);
      if (call.url.includes("escape")) return json(403, { error: "escapes the workspace scope" });
      return json(200, { path: "src/a b.ts", before: "x", after: "y", truncated: false });
    });
    const client = keyworkClient(ticket, { fetch });
    expect(await client.changes("s1")).toEqual(changes);
    expect(await client.changedFile("s1", "../escape")).toBe("outside-scope");
    expect(await client.changedFile("s1", "src/a b.ts")).toMatchObject({ before: "x", after: "y" });
    expect(calls[2]?.url).toBe("http://127.0.0.1:4770/sessions/s1/changes/file?path=src%2Fa+b.ts");
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
    await expect(client.prompt("s1", "", "queue")).rejects.toThrow(ServerRefusal);
    await expect(client.prompt("s1", "", "queue")).rejects.toThrow("the body is not { text }");
  });

  it("reads the server document and summarizes it", async () => {
    const { calls, fetch } = recordingFetch(() =>
      json(200, {
        info: { version: "0.2.0" },
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
      version: "0.2.0",
      operationIds: ["createSession", "getDocument", "listSessions"],
    });
    expect(calls[0]?.headers.authorization).toBe("Bearer t0k3n");
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

describe("keyworkClient memory routes", () => {
  const garden = {
    trusted: true,
    layers: [],
    inbox: [],
    ledger: [],
    audit: [],
    gardener: { state: "idle" },
    airlocks: [],
  };
  const digest = {
    arc: "launch",
    candidates: [],
    questions: [],
    decisions: { candidates: {}, questions: {} },
  };

  it("reads the garden, the inbox, notes, daily logs and the ledger with their layers encoded", async () => {
    const { calls, fetch } = recordingFetch((call) => {
      if (call.url.endsWith("/memory")) return json(200, garden);
      if (call.url.endsWith("/memory/inbox"))
        return json(200, { trusted: true, items: [], count: 0 });
      if (call.url.endsWith("/memory/notes/Stray%20Claim"))
        return json(200, { trusted: true, name: "Stray Claim", relations: [], curing: 0 });
      if (call.url.endsWith("/memory/notes/Inert%20Claim")) return json(200, { trusted: false });
      if (call.url.endsWith("/memory/notes?layer=workspace"))
        return json(200, { trusted: true, notes: [] });
      if (call.url.endsWith("/memory/notes")) return json(404, { error: "no layer" });
      if (call.url.endsWith("/memory/daily"))
        return json(200, { trusted: true, dates: ["2026-09-07"] });
      if (call.url.endsWith("/memory/daily/2026-09-07"))
        return json(200, { trusted: true, date: "2026-09-07", entries: [] });
      if (call.url.endsWith("/memory/ledger")) return json(200, { trusted: true, entries: [] });
      return json(404, { error: "no such route" });
    });
    const client = keyworkClient(ticket, { fetch });
    expect(await client.memory()).toEqual(garden);
    expect((await client.memoryInbox()).count).toBe(0);
    expect((await client.memoryNotes("workspace"))?.notes).toEqual([]);
    expect(await client.memoryNotes()).toBeUndefined();
    expect((await client.memoryNote("Stray Claim"))?.name).toBe("Stray Claim");
    expect(await client.memoryNote("Inert Claim")).toBeUndefined();
    expect((await client.memoryDailyDates()).dates).toEqual(["2026-09-07"]);
    expect((await client.memoryDaily("2026-09-07")).entries).toEqual([]);
    expect((await client.memoryLedger()).entries).toEqual([]);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("maps approve, discard and revert through inert and missing", async () => {
    const { fetch } = recordingFetch((call) => {
      if (call.url.endsWith("/inbox/a/approve"))
        return json(200, { path: "A.md", staged: false, ledgerId: "l1" });
      if (call.url.endsWith("/inbox/bot/approve")) return json(200, {});
      if (call.url.endsWith("/inbox/b/discard")) return json(200, {});
      if (call.url.endsWith("/inbox/gone/approve")) return json(404, { error: "no staged item" });
      if (call.url.endsWith("/inbox/gone/discard")) return json(404, { error: "no staged item" });
      if (call.url.endsWith("/ledger/l1/revert")) return json(200, { outcome: "reverted" });
      if (call.url.endsWith("/ledger/l2/revert")) return json(200, { outcome: "needs-rebase" });
      return json(403, { error: "memory is inert: this workspace is untrusted" });
    });
    const client = keyworkClient(ticket, { fetch });
    expect(await client.approveStagedItem("a")).toEqual({
      kind: "approved",
      result: { path: "A.md", staged: false, ledgerId: "l1" },
    });
    expect(await client.approveStagedItem("bot")).toEqual({ kind: "approved", result: null });
    expect(await client.discardStagedItem("b")).toBe("discarded");
    expect(await client.approveStagedItem("gone")).toBe("missing");
    expect(await client.discardStagedItem("gone")).toBe("missing");
    expect(await client.approveStagedItem("inert")).toBe("inert");
    expect(await client.revertLedgerEntry("l1")).toEqual({ kind: "reverted" });
    expect(await client.revertLedgerEntry("l2")).toEqual({ kind: "needs-rebase" });
    expect(await client.revertLedgerEntry("l3")).toBe("inert");
  });

  it("asks the garden with the query and an optional arc", async () => {
    const { calls, fetch } = recordingFetch(() =>
      json(200, { trusted: true, hits: [], source: "lexical" }),
    );
    const client = keyworkClient(ticket, { fetch });
    expect((await client.askMemory({ query: "thirds" })).source).toBe("lexical");
    await client.askMemory({ query: "thirds", arc: "launch" });
    expect(calls.map((call) => call.body)).toEqual([
      '{"query":"thirds"}',
      '{"query":"thirds","arc":"launch"}',
    ]);
  });

  it("walks the airlock verbs with their typed refusals", async () => {
    const { calls, fetch } = recordingFetch((call) => {
      if (call.url.endsWith("/arcs/launch/airlock") && call.method === "GET")
        return json(200, { trusted: true, ...digest });
      if (call.url.endsWith("/arcs/none/airlock")) return json(404, { error: "no review" });
      if (call.url.endsWith("/candidates/Weak%20Note"))
        return json(409, { error: "below the bar" });
      if (call.url.endsWith("/candidates/Strong%20Note")) return json(200, digest);
      if (call.url.endsWith("/questions") && call.body?.includes("carry") === true)
        return json(409, { error: "no successor" });
      if (call.url.endsWith("/questions")) return json(200, digest);
      if (call.url.endsWith("/deliver")) return json(200, { delivered: 2 });
      if (call.url.endsWith("/arcs/launch/airlock/finish"))
        return json(200, { kind: "undecided", items: ["q"] });
      return json(403, { error: "memory is inert" });
    });
    const client = keyworkClient(ticket, { fetch });
    expect(await client.airlock("launch")).toEqual({ trusted: true, ...digest });
    expect(await client.airlock("none")).toBeUndefined();
    expect(await client.triageAirlockCandidate("launch", "Strong Note", "deliver")).toEqual({
      kind: "digest",
      digest,
    });
    expect(await client.triageAirlockCandidate("launch", "Weak Note", "deliver")).toEqual({
      kind: "ineligible",
      detail: "below the bar",
    });
    expect(await client.triageAirlockQuestion("launch", "q", "carry")).toEqual({
      kind: "no-successor",
      detail: "no successor",
    });
    expect(await client.triageAirlockQuestion("launch", "q", "drop")).toEqual({
      kind: "digest",
      digest,
    });
    expect(await client.deliverAirlock("launch")).toEqual({
      kind: "delivered",
      delivered: 2,
    });
    expect(await client.finishAirlock("launch", true)).toEqual({
      kind: "finished",
      outcome: { kind: "undecided", items: ["q"] },
    });
    expect(await client.finishAirlock("inert")).toBe("inert");
    expect(calls.at(-2)?.body).toBe('{"force":true}');
  });
});

describe("keyworkClient workspace routes", () => {
  const listing = {
    path: "src",
    entries: [{ name: "a.ts", kind: "file", ignored: false, hidden: false }],
  };
  const slice = {
    path: "src/a.ts",
    bytes: 12,
    from: 0,
    to: 12,
    text: "hello world\n",
    truncated: false,
    encoding: "utf-8",
  };

  it("reads the workspace, a tree level, and a file slice at its range", async () => {
    const { calls, fetch } = recordingFetch((call) => {
      if (call.url.endsWith("/workspace")) return json(200, { trust: "undecided" });
      if (call.url.includes("/tree?")) return json(200, listing);
      return json(200, slice);
    });
    const client = keyworkClient(ticket, { fetch });
    expect(await client.workspace()).toEqual({ trust: "undecided" });
    expect(await client.tree("src")).toEqual(listing);
    expect(await client.file("src/a.ts", { from: 3, to: 9 })).toEqual(slice);
    expect(calls.map((call) => call.url.replace(ticket.url, "/"))).toEqual([
      "/workspace",
      "/tree?path=src&hidden=true",
      "/files?path=src%2Fa.ts&from=3&to=9",
    ]);
  });

  it("names each refusal of a tree or file read", async () => {
    const answer = (status: number) =>
      keyworkClient(ticket, { fetch: recordingFetch(() => json(status, { error: "no" })).fetch });
    expect(await answer(403).tree("../etc")).toBe("outside-scope");
    expect(await answer(404).tree("gone")).toBe("missing");
    expect(await answer(403).file("../etc/passwd")).toBe("outside-scope");
    expect(await answer(404).file("gone.txt")).toBe("missing");
    expect(await answer(413).file("huge.bin")).toBe("too-large");
    expect(await answer(415).file("photo.png")).toBe("binary");
    await expect(answer(500).file("a.txt")).rejects.toThrow(ServerRefusal);
  });

  it("posts an empty body to trust the root and types both refusals with the server's words", async () => {
    const { calls, fetch } = recordingFetch((call) => {
      if (call.body !== "{}") return json(400, { error: "the trust route takes no body" });
      return json(200, { trusted: true, root: "C:/work", reopens: true });
    });
    expect(await keyworkClient(ticket, { fetch }).trustWorkspace()).toEqual({
      trusted: true,
      root: "C:/work",
      reopens: true,
    });
    expect(calls[0]).toMatchObject({ method: "POST", body: "{}" });
    const refused = (status: number, error: string) =>
      keyworkClient(ticket, { fetch: recordingFetch(() => json(status, { error })).fetch });
    expect(await refused(409, "C:/work is marked untrusted").trustWorkspace()).toEqual({
      refused: "untrusted",
      message: "C:/work is marked untrusted",
    });
    expect(await refused(400, "refusing to blanket-trust a home").trustWorkspace()).toEqual({
      refused: "home",
      message: "refusing to blanket-trust a home",
    });
  });
});

describe("keyworkClient trash routes", () => {
  it("moves a session to the trash, lists it, restores it and discards it with typed refusals", async () => {
    const summary = { id: "s1", title: "Lights", messageCount: 2 };
    const { calls, fetch } = recordingFetch((call) => {
      if (call.url.endsWith("/sessions/busy")) return json(409, { error: "a turn is running" });
      if (call.url.endsWith("/sessions/gone") || call.url.includes("/trash/gone"))
        return json(404, { error: "nothing in the trash has that id" });
      if (call.url.endsWith("/trash") && call.method === "GET")
        return json(200, { sessions: [summary] });
      if (call.url.endsWith("/trash")) return json(200, { purged: 3 });
      if (call.url.endsWith("/restore")) return json(201, summary);
      if (call.url.includes("/trash/")) return json(200, { sessionId: "s1", discarded: true });
      return json(200, summary);
    });
    const client = keyworkClient(ticket, { fetch });
    expect(await client.removeSession("s1")).toEqual(summary);
    expect(await client.removeSession("busy")).toBe("busy");
    expect(await client.removeSession("gone")).toBe("missing");
    expect(await client.listTrash()).toEqual([summary]);
    expect(await client.restoreSession("s1")).toEqual(summary);
    expect(await client.restoreSession("gone")).toBe("missing");
    expect(await client.discardTrashedSession("s1")).toBe("discarded");
    expect(await client.discardTrashedSession("gone")).toBe("missing");
    expect(await client.purgeTrash()).toEqual({ purged: 3 });
    expect(calls.map((call) => `${call.method} ${call.url.replace(ticket.url, "/")}`)).toEqual([
      "DELETE /sessions/s1",
      "DELETE /sessions/busy",
      "DELETE /sessions/gone",
      "GET /trash",
      "POST /trash/s1/restore",
      "POST /trash/gone/restore",
      "DELETE /trash/s1",
      "DELETE /trash/gone",
      "DELETE /trash",
    ]);
  });
});
