import { readFile } from "node:fs/promises";
import type { ResolutionFailure, TurnRestored } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { keyworkClientOver } from "./client.ts";

interface Sent {
  method: string;
  path: string;
  body: unknown;
}

function serverAnswering(answer: (sent: Sent) => Response) {
  const sent: Sent[] = [];
  const client = keyworkClientOver(async (path, init = {}) => {
    const call = {
      method: init.method ?? "GET",
      path,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    sent.push(call);
    return answer(call);
  });
  return { client, sent };
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const missingSession = (): Response => json(404, { error: "no session has that id" });

const unknownModel: ResolutionFailure = {
  code: "unknown-model",
  message: "no model matches mock/gamma",
  reference: "mock/gamma",
  provider: "mock",
  known: ["mock/alpha", "mock/beta"],
};

describe("the session verbs", () => {
  it("post each verb's body to its route and return the server's answer", async () => {
    const { client, sent } = serverAnswering(({ path }) => {
      if (path.endsWith("/model"))
        return json(200, {
          model: { provider: "mock", model: "beta" },
          notice: "model → mock/beta",
        });
      if (path.endsWith("/thinking")) return json(200, { thinking: true });
      if (path.endsWith("/effort")) return json(200, { effort: null });
      if (path.endsWith("/compact")) return json(200, { compacted: null, notices: [] });
      if (path.endsWith("/rename")) return json(200, { title: "Lights" });
      return json(500, { error: "unexpected" });
    });
    expect(await client.setModel("s 1", "mock/beta")).toEqual({
      model: { provider: "mock", model: "beta" },
      notice: "model → mock/beta",
    });
    expect(await client.setThinking("s 1", true)).toEqual({ thinking: true });
    expect(await client.setEffort("s 1", null)).toEqual({ effort: null });
    expect(await client.compact("s 1")).toEqual({ compacted: null, notices: [] });
    expect(await client.compact("s 1", "the parser")).toEqual({ compacted: null, notices: [] });
    expect(await client.rename("s 1", "Lights")).toEqual({ title: "Lights" });
    expect(sent).toEqual([
      { method: "POST", path: "/sessions/s%201/model", body: { reference: "mock/beta" } },
      { method: "POST", path: "/sessions/s%201/thinking", body: { on: true } },
      { method: "POST", path: "/sessions/s%201/effort", body: { level: null } },
      { method: "POST", path: "/sessions/s%201/compact", body: {} },
      { method: "POST", path: "/sessions/s%201/compact", body: { focus: "the parser" } },
      { method: "POST", path: "/sessions/s%201/rename", body: { title: "Lights" } },
    ]);
  });

  it("types an unresolved model with the server's failure, never throwing", async () => {
    const { client } = serverAnswering(() =>
      json(400, { error: unknownModel.message, failure: unknownModel }),
    );
    expect(await client.setModel("s1", "mock/gamma")).toEqual({
      refused: "unresolved",
      detail: "no model matches mock/gamma",
      failure: unknownModel,
    });
  });

  it("types a refused body, a running turn and a missing session for every verb", async () => {
    const busy = serverAnswering(() => json(409, { error: "a turn is running" })).client;
    expect(await busy.setModel("s1", "x")).toEqual({
      refused: "busy",
      detail: "a turn is running",
    });
    expect(await busy.compact("s1")).toMatchObject({ refused: "busy" });
    expect(await busy.undo("s1")).toMatchObject({ refused: "busy" });
    expect(await busy.redo("s1")).toMatchObject({ refused: "busy" });
    expect(await busy.restoreTurn("s1", 1)).toMatchObject({ refused: "busy" });

    const invalid = serverAnswering(() =>
      json(400, { error: 'the body must be { level: "low" | "medium" } ' }),
    ).client;
    expect(await invalid.setEffort("s1", "high")).toMatchObject({ refused: "invalid" });
    expect(await invalid.rename("s1", "x")).toMatchObject({ refused: "invalid" });
    expect(await invalid.setModel("s1", "x")).toMatchObject({ refused: "invalid" });

    const gone = serverAnswering(missingSession).client;
    for (const reading of [
      await gone.setModel("s9", "x"),
      await gone.setThinking("s9", false),
      await gone.setEffort("s9", "low"),
      await gone.compact("s9"),
      await gone.undo("s9"),
      await gone.redo("s9"),
      await gone.restoreTurn("s9", 1),
      await gone.context("s9"),
      await gone.cost("s9"),
      await gone.exportSession("s9"),
      await gone.rename("s9", "x"),
    ]) {
      expect(reading).toBe("missing");
    }
  });

  it("returns the undone prompt and tells nothing-to-undo from a busy session", async () => {
    const undone = {
      prompt: { entryId: "e3", text: "say hello" },
      filesNote: "files put back",
      undoable: false,
      redoable: true,
    };
    let turn = 0;
    const { client } = serverAnswering(({ path }) => {
      turn += 1;
      if (path.endsWith("/redo")) return json(404, { error: "nothing to redo" });
      if (turn === 1) return json(200, undone);
      if (turn === 2) {
        return json(409, {
          error: "a turn is running",
        });
      }
      return json(404, { error: "nothing to undo" });
    });
    expect(await client.undo("s1")).toEqual(undone);
    expect(await client.undo("s1")).toEqual({ refused: "busy", detail: "a turn is running" });
    expect(await client.undo("s1")).toEqual({ refused: "nothing", detail: "nothing to undo" });
    expect(await client.redo("s1")).toEqual({ refused: "nothing", detail: "nothing to redo" });
  });

  it("reads the context and cost reports as the server sends them", async () => {
    const estimated = (tokens: number) => ({ tokens, basis: "estimated" });
    const context = {
      used: 40,
      window: 200_000,
      flushAt: 175_424,
      compactAt: 183_616,
      declared: false,
      parts: {
        system: estimated(137),
        tools: estimated(1728),
        injected: estimated(0),
        conversation: { tokens: 40, basis: "reported" },
        free: estimated(198_095),
      },
      thresholds: { flushAt: 177_289, compactAt: 185_481 },
      fullness: 0.0002,
      flushDue: false,
      compactionDue: false,
      basis: "estimated",
    };
    const cost = {
      rollup: { nanos: 0, pricedTurns: 0, meteredTurns: 0, unpricedTurns: 1 },
      usage: { inputTokens: 12, outputTokens: 5 },
      basis: "metered by the provider",
      models: [],
    };
    const { client, sent } = serverAnswering(({ path }) =>
      json(200, path.endsWith("/context") ? context : cost),
    );
    expect(await client.context("s1")).toEqual(context);
    expect(await client.cost("s1")).toEqual(cost);
    expect(sent.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /sessions/s1/context",
      "GET /sessions/s1/cost",
    ]);
  });

  it("exports inline as html, to a file as its path, and types a refused path", async () => {
    const { client, sent } = serverAnswering(({ body }) => {
      const out = (body as { out?: string }).out;
      if (out === undefined) {
        return new Response("<!doctype html><title>s1</title>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (out === "..") return json(403, { error: ".. escapes the workspace scope" });
      return json(201, { file: `<cwd>/${out}/s1.html` });
    });
    expect(await client.exportSession("s1")).toEqual({
      html: "<!doctype html><title>s1</title>",
    });
    expect(await client.exportSession("s1", { scope: "tree", out: "exports" })).toEqual({
      file: "<cwd>/exports/s1.html",
    });
    expect(await client.exportSession("s1", { out: ".." })).toEqual({
      refused: "outside-scope",
      detail: ".. escapes the workspace scope",
    });
    expect(sent.map((call) => call.body)).toEqual([
      {},
      { scope: "tree", out: "exports" },
      { out: ".." },
    ]);
  });
});

describe("restoring to just before a turn", () => {
  type RestoreAnswers = Record<
    "restored" | "restoreUnknownTurn" | "restoreMalformed",
    { status: number; body: unknown }
  >;

  const recorded = async (): Promise<RestoreAnswers> =>
    JSON.parse(
      await readFile(new URL("./fixtures/restored.json", import.meta.url), "utf8"),
    ) as RestoreAnswers;

  const replaying = (answer: RestoreAnswers[keyof RestoreAnswers]) =>
    serverAnswering(() => json(answer.status, answer.body));

  it("posts the turn and hands back the server's report whole", async () => {
    const { restored } = await recorded();
    const { client, sent } = replaying(restored);
    const report = (await client.restoreTurn("s 1", 1)) as TurnRestored;
    expect(report).toEqual(restored.body);
    expect(report.prompt.text).toBe("write two lines to notes.txt");
    expect(report.files).toEqual([{ path: "notes.txt", added: 0, deleted: 2 }]);
    expect(sent).toEqual([{ method: "POST", path: "/sessions/s%201/restore", body: { turn: 1 } }]);
  });

  it("reads an unknown turn as nothing to restore and a turn below one as invalid", async () => {
    const { restoreUnknownTurn, restoreMalformed } = await recorded();
    expect(await replaying(restoreUnknownTurn).client.restoreTurn("s1", 9)).toEqual({
      refused: "nothing",
      detail: "no turn 9 on this session's path",
    });
    expect(await replaying(restoreMalformed).client.restoreTurn("s1", 0)).toEqual({
      refused: "invalid",
      detail: "the body must be { turn: a positive integer }",
    });
  });
});

describe("the preset switch", () => {
  it("sends confirmed only when asked and tells a loosening refusal from a missing switch", async () => {
    const { client, sent } = serverAnswering(({ body }) => {
      const { name, confirmed } = body as { name: string; confirmed?: true };
      if (name === "careful")
        return json(501, { error: "this server was started without a preset switch" });
      if (confirmed !== true) return json(409, { error: "loosening needs confirmed: true" });
      return json(200, { from: "standard", to: name });
    });
    expect(await client.applyPreset("open")).toEqual({
      refused: "needs-confirmation",
      detail: "loosening needs confirmed: true",
    });
    expect(await client.applyPreset("open", true)).toEqual({ from: "standard", to: "open" });
    expect(await client.applyPreset("careful")).toEqual({
      refused: "unavailable",
      detail: "this server was started without a preset switch",
    });
    expect(sent.map((call) => call.body)).toEqual([
      { name: "open" },
      { name: "open", confirmed: true },
      { name: "careful" },
    ]);
    expect(sent.every((call) => call.path === "/preset" && call.method === "POST")).toBe(true);
  });
});

describe("the events filter", () => {
  async function pathsOpened(options: { session?: string }) {
    const paths: string[] = [];
    const controller = new AbortController();
    const client = keyworkClientOver(
      async (path) => {
        paths.push(path);
        return new Response("", { status: 200 });
      },
      { delay: async () => controller.abort() },
    );
    for await (const _ of client.events({ ...options, signal: controller.signal })) break;
    return paths;
  }

  it("asks for one session's envelopes beside the process-level ones", async () => {
    expect(await pathsOpened({})).toEqual(["/events"]);
    expect(await pathsOpened({ session: "s 1" })).toEqual(["/events?session=s+1"]);
  });
});
