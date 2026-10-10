import { readFile } from "node:fs/promises";
import { isSurfaceRefusal } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { type Fetch, keyworkClient } from "./client.ts";

const ticket = { url: "http://127.0.0.1:4770", token: "t0k3n" };

interface Call {
  path: string;
  method: string;
  body: string | undefined;
}

function recordingFetch(answer: (call: Call) => Response): { calls: Call[]; fetch: Fetch } {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init = {}) => {
    const call: Call = {
      path: url.slice(ticket.url.length),
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

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
}

async function fixtureServer(): Promise<{ calls: Call[]; fetch: Fetch }> {
  const bodies = Object.fromEntries(
    await Promise.all(
      ["mcp", "arcs", "bots", "workspaces", "flavors"].map(
        async (name) => [`/${name}`, await fixture(name)] as const,
      ),
    ),
  );
  return recordingFetch((call) => {
    const body = bodies[call.path];
    return body === undefined ? json(404, { error: "no such route" }) : json(200, body);
  });
}

describe("the surface routes", () => {
  it("lists every surface whole from the recorded shapes", async () => {
    const { calls, fetch } = await fixtureServer();
    const client = keyworkClient(ticket, { fetch });
    const servers = await client.mcpServers();
    expect(servers.map((server) => `${server.name}:${server.state}`)).toEqual([
      "filesystem:connected",
      "remote-docs:connecting",
      "broken:down",
      "parked:down",
    ]);
    expect(servers[2]?.lastError).toBe("spawn nonexistent-server ENOENT");
    const arcs = await client.arcs();
    expect(arcs).toMatchObject({ ordinals: { "arc-0": 0, "arc-1": 1, pricing: 2 } });
    const bots = await client.bots();
    expect(bots.map((bot) => `${bot.sigil} ${bot.name}`)).toEqual(["◆ reviewer", "✎ scribe"]);
    const workspaces = await client.workspaces();
    expect(workspaces.map((choice) => choice.slug)).toEqual([undefined, "docs", "spike"]);
    const flavors = await client.flavors();
    expect(flavors.active).toBe("keywork-night");
    expect(flavors.placeholders).toEqual(["system"]);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /mcp",
      "GET /arcs",
      "GET /bots",
      "GET /workspaces",
      "GET /flavors",
    ]);
  });

  it("drives the mcp verbs with their paths and bodies", async () => {
    const status = { name: "filesystem", state: "connected", enabled: true, toolCount: 11 };
    const { calls, fetch } = recordingFetch((call) =>
      call.path.endsWith("/tools") ? json(200, { tools: ["read", "write"] }) : json(200, status),
    );
    const client = keyworkClient(ticket, { fetch });
    expect(await client.restartMcpServer("filesystem")).toEqual(status);
    expect(await client.setMcpServerEnabled("filesystem", false)).toEqual(status);
    expect(await client.mcpServerTools("filesystem")).toEqual(["read", "write"]);
    expect(calls.map((call) => [call.method, call.path, call.body])).toEqual([
      ["POST", "/mcp/filesystem/restart", undefined],
      ["POST", "/mcp/filesystem/enabled", '{"enabled":false}'],
      ["GET", "/mcp/filesystem/tools", undefined],
    ]);
  });

  it("drives the arc verbs: create, close, abandon, bind and release", async () => {
    const { calls, fetch } = recordingFetch((call) => {
      if (call.path === "/arcs")
        return json(201, { slug: "arc-3", status: "active", created: "t", sessions: 0 });
      if (call.path.endsWith("/close"))
        return json(200, { kind: "pending", candidates: 2, questions: 1, wedged: 0 });
      if (call.path.endsWith("/abandon")) return json(200, { slug: "arc-3", abandoned: true });
      return json(200, { sessionId: "s1", arc: call.body?.includes("null") ? null : "arc-3" });
    });
    const client = keyworkClient(ticket, { fetch });
    expect(await client.createArc()).toMatchObject({ slug: "arc-3" });
    expect(await client.createArc("named")).toMatchObject({ slug: "arc-3" });
    expect(await client.closeArc("arc-3")).toEqual({
      kind: "pending",
      candidates: 2,
      questions: 1,
      wedged: 0,
    });
    expect(await client.closeArc("arc-3", "ship it")).toMatchObject({ kind: "pending" });
    expect(await client.abandonArc("arc-3")).toBe("abandoned");
    expect(await client.bindSessionArc("s1", "arc-3")).toEqual({ sessionId: "s1", arc: "arc-3" });
    expect(await client.bindSessionArc("s1", null)).toEqual({ sessionId: "s1", arc: null });
    expect(calls.map((call) => [call.path, call.body])).toEqual([
      ["/arcs", "{}"],
      ["/arcs", '{"slug":"named"}'],
      ["/arcs/arc-3/close", "{}"],
      ["/arcs/arc-3/close", '{"direction":"ship it"}'],
      ["/arcs/arc-3/abandon", undefined],
      ["/sessions/s1/arc", '{"slug":"arc-3"}'],
      ["/sessions/s1/arc", '{"slug":null}'],
    ]);
  });

  it("drives the bot and workspace verbs with the default workspace spelled out", async () => {
    const { calls, fetch } = recordingFetch((call) => {
      if (call.path === "/bots") return json(201, { name: "scribe", sigil: "✎", source: "user" });
      if (call.path === "/sessions/s1/bot") return json(200, { sessionId: "s1", bot: "scribe" });
      if (call.path === "/workspaces") return json(201, { slug: "docs" });
      if (call.path === "/workspaces/use") return json(200, { slug: "docs", reopens: true });
      return json(200, { dir: "packages/ui" });
    });
    const client = keyworkClient(ticket, { fetch });
    expect(await client.createBot({ slug: "scribe", scope: "user" })).toMatchObject({
      sigil: "✎",
    });
    expect(await client.switchSessionBot("s1", "scribe")).toEqual({
      sessionId: "s1",
      bot: "scribe",
    });
    expect(await client.createWorkspace("docs")).toEqual({ slug: "docs" });
    expect(await client.useWorkspace("docs")).toEqual({ slug: "docs", reopens: true });
    expect(await client.focusWorkspaceDir(null, "packages/ui")).toEqual({ dir: "packages/ui" });
    expect(await client.unfocusWorkspaceDir("docs", "packages/ui")).toEqual({
      dir: "packages/ui",
    });
    expect(calls.map((call) => [call.path, call.body])).toEqual([
      ["/bots", '{"slug":"scribe","scope":"user"}'],
      ["/sessions/s1/bot", '{"slug":"scribe"}'],
      ["/workspaces", '{"slug":"docs"}'],
      ["/workspaces/use", '{"slug":"docs"}'],
      ["/workspaces/default/focus", '{"dir":"packages/ui"}'],
      ["/workspaces/docs/unfocus", '{"dir":"packages/ui"}'],
    ]);
  });

  it("maps 403 to not-ready, 404 to missing, 400 to invalid, each with the server's words", async () => {
    const notice = "arcs need a trusted workspace with memory · /init sets one up";
    const { fetch } = recordingFetch((call) => {
      if (call.path.startsWith("/arcs")) return json(403, { error: notice });
      if (call.path.endsWith("/focus"))
        return json(400, { error: "dir is not a directory inside the root" });
      return json(404, { error: "no server has that name" });
    });
    const client = keyworkClient(ticket, { fetch });
    const missing = { refused: "missing", detail: "no server has that name" };
    expect(await client.arcs()).toEqual({ refused: "not-ready", detail: notice });
    expect(await client.createArc()).toEqual({ refused: "not-ready", detail: notice });
    expect(await client.restartMcpServer("ghost")).toEqual(missing);
    expect(await client.mcpServerTools("ghost")).toEqual(missing);
    expect(await client.switchSessionBot("nope", "scribe")).toEqual(missing);
    expect(await client.useWorkspace("nope")).toEqual(missing);
    expect(await client.focusWorkspaceDir(null, "/etc")).toEqual({
      refused: "invalid",
      detail: "dir is not a directory inside the root",
    });
  });

  it("types each 409 by its route: archived arcs, existing names, a busy session", async () => {
    const { fetch } = recordingFetch(() => json(409, { error: "a turn is running" }));
    const client = keyworkClient(ticket, { fetch });
    const refusals = await Promise.all([
      client.closeArc("arc-0"),
      client.abandonArc("arc-0"),
      client.bindSessionArc("s1", "arc-0"),
      client.createArc("arc-0"),
      client.createBot({ slug: "scribe", scope: "user" }),
      client.createWorkspace("docs"),
      client.switchSessionBot("s1", "scribe"),
    ]);
    expect(refusals.map((refusal) => (isSurfaceRefusal(refusal) ? refusal.refused : "?"))).toEqual([
      "archived",
      "archived",
      "archived",
      "exists",
      "exists",
      "exists",
      "busy",
    ]);
    expect(refusals.at(-1)).toEqual({ refused: "busy", detail: "a turn is running" });
  });
});
