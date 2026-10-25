import { readFile } from "node:fs/promises";
import { type BusEnvelope, isGrantAheadRefusal, type PermissionRule } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { type Fetch, keyworkClient, ServerRefusal } from "./client.ts";
import { projectAll } from "./projection/project.ts";
import { grantWord, toolRowText } from "./projection/tool-row.ts";
import { emptyProjection, type ToolRun } from "./projection/types.ts";

const ticket = { url: "http://127.0.0.1:4770", token: "t0k3n" };

interface Recorded {
  status: number;
  body: unknown;
}

type GrantAnswers = Record<
  | "pendingWrite"
  | "writeBeyondOnce"
  | "nothingToRemember"
  | "permissions"
  | "revoked"
  | "revokedAgain"
  | "revokeMalformed"
  | "afterRevoke"
  | "grantedWorkspace"
  | "grantedSession"
  | "grantWrite"
  | "grantDelete"
  | "grantMalformed"
  | "grantUnknownSession"
  | "afterGrant",
  Recorded
>;

const fixture = (name: string): URL => new URL(`./fixtures/${name}`, import.meta.url);

const answers = async (): Promise<GrantAnswers> =>
  JSON.parse(await readFile(fixture("grants.json"), "utf8")) as GrantAnswers;

async function grantEnvelopes(): Promise<BusEnvelope[]> {
  const text = await readFile(fixture("grants.jsonl"), "utf8");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as BusEnvelope);
}

async function grantRuns(): Promise<ToolRun[]> {
  return runsOf(await grantEnvelopes());
}

function runsOf(envelopes: readonly BusEnvelope[]): ToolRun[] {
  return projectAll(emptyProjection, envelopes).entries.flatMap((entry) =>
    entry.kind === "tool" ? [entry.run] : [],
  );
}

function answering(recorded: Recorded): { bodies: unknown[]; urls: string[]; fetch: Fetch } {
  const bodies: unknown[] = [];
  const urls: string[] = [];
  const fetch: Fetch = async (url, init = {}) => {
    urls.push(url);
    bodies.push(typeof init.body === "string" ? JSON.parse(init.body) : undefined);
    return new Response(JSON.stringify(recorded.body), { status: recorded.status });
  };
  return { bodies, urls, fetch };
}

const gitAdd: PermissionRule = { action: "bash", resource: "git add *", effect: "allow" };

const npmRun: PermissionRule = { action: "bash", resource: "npm run *", effect: "allow" };

const notesPreview = { path: "notes.txt", before: null, after: "one\ntwo\n" };

describe("answering asks with a scope", () => {
  it("posts the scope beside the verdict and omits it when none is given", async () => {
    const { bodies, fetch } = answering({ status: 200, body: { callId: "g1", settled: true } });
    const client = keyworkClient(ticket, { fetch });
    expect(await client.answerAsk("g1", "granted", "session")).toBe("settled");
    expect(await client.answerAsk("g1", "denied")).toBe("settled");
    expect(bodies).toEqual([{ verdict: "granted", scope: "session" }, { verdict: "denied" }]);
  });

  it("reads a write granted beyond once as the write-once refusal in the server's words", async () => {
    const { fetch } = answering((await answers()).writeBeyondOnce);
    const client = keyworkClient(ticket, { fetch });
    expect(await client.answerAsk("g4", "granted", "workspace")).toEqual({
      refused: "write-once",
      detail: "write and edit are approved once at a time",
    });
  });

  it("reads a call with nothing to remember as its own refusal", async () => {
    const { fetch } = answering((await answers()).nothingToRemember);
    const client = keyworkClient(ticket, { fetch });
    expect(await client.answerAsk("g5", "granted", "session")).toEqual({
      refused: "nothing-to-remember",
      detail: "this call has nothing a grant could remember; approve it once",
    });
  });

  it("throws on a 400 it does not recognise", async () => {
    const { fetch } = answering({ status: 400, body: { error: "the body must be something" } });
    const client = keyworkClient(ticket, { fetch });
    await expect(client.answerAsk("g1", "granted")).rejects.toBeInstanceOf(ServerRefusal);
  });

  it("carries the rules a remembered answer would record on each pending ask", async () => {
    const { fetch } = answering((await answers()).pendingWrite);
    const [pending] = await keyworkClient(ticket, { fetch }).asks();
    expect(pending).toMatchObject({ callId: "g4", tool: "write", rules: [] });
  });

  it("carries a write's preview on its pending ask: the file as it is and as the call would leave it", async () => {
    const { fetch } = answering((await answers()).pendingWrite);
    const [pending] = await keyworkClient(ticket, { fetch }).asks();
    expect(pending?.preview).toEqual(notesPreview);
  });
});

describe("the permissions routes", () => {
  it("lists the bundle, workspace grants and session grants", async () => {
    const { fetch } = answering((await answers()).permissions);
    const view = await keyworkClient(ticket, { fetch }).permissions();
    expect(view.trusted).toBe(true);
    expect(view.bundle).toContainEqual({
      action: "bash",
      resource: "git status*",
      effect: "allow",
    });
    expect(view.workspace).toEqual([gitAdd]);
    expect(view.session).toEqual({
      s1: [{ action: "bash", resource: "mkdir -p *", effect: "allow" }],
    });
  });

  it("revokes a workspace grant and reads both refusals", async () => {
    const recorded = await answers();
    const revoke = async (answer: Recorded, rule: PermissionRule) => {
      const { bodies, fetch } = answering(answer);
      const outcome = await keyworkClient(ticket, { fetch }).revokeWorkspaceGrant(rule);
      return { outcome, body: bodies[0] };
    };
    expect(await revoke(recorded.revoked, gitAdd)).toEqual({
      outcome: { revoked: gitAdd },
      body: { rule: gitAdd },
    });
    expect((await revoke(recorded.revokedAgain, gitAdd)).outcome).toEqual({
      refused: "missing",
      detail: "no workspace grant matches that rule",
    });
    expect((await revoke(recorded.revokeMalformed, gitAdd)).outcome).toMatchObject({
      refused: "invalid",
    });
  });

  it("revokes a session grant on that session's own route and reads a 404 as missing", async () => {
    const urls: string[] = [];
    const missing = { error: "that session holds no grant matching that rule" };
    const fetch: Fetch = async (url) => {
      urls.push(String(url));
      return urls.length === 1
        ? new Response(JSON.stringify({ revoked: gitAdd }), { status: 200 })
        : new Response(JSON.stringify(missing), { status: 404 });
    };
    const client = keyworkClient(ticket, { fetch });
    expect(await client.revokeSessionGrant("s 1", gitAdd)).toEqual({ revoked: gitAdd });
    expect(await client.revokeSessionGrant("s 1", gitAdd)).toEqual({
      refused: "missing",
      detail: "that session holds no grant matching that rule",
    });
    expect(urls[0]).toBe("http://127.0.0.1:4770/permissions/session/s%201/revoke");
  });
});

describe("granting ahead of an ask", () => {
  const clientAnswering = (recorded: Recorded) =>
    keyworkClient(ticket, { fetch: answering(recorded).fetch });

  it("records a workspace rule and a session rule on their own routes, posting the rule alone", async () => {
    const recorded = await answers();
    const workspace = answering(recorded.grantedWorkspace);
    const session = answering(recorded.grantedSession);
    expect(
      await keyworkClient(ticket, { fetch: workspace.fetch }).grantWorkspaceRule(gitAdd),
    ).toEqual({ granted: gitAdd });
    expect(
      await keyworkClient(ticket, { fetch: session.fetch }).grantSessionRule("s 1", npmRun),
    ).toEqual({ granted: npmRun });
    expect([...workspace.urls, ...session.urls]).toEqual([
      "http://127.0.0.1:4770/permissions/workspace/grant",
      "http://127.0.0.1:4770/permissions/session/s%201/grant",
    ]);
    expect([...workspace.bodies, ...session.bodies]).toEqual([{ rule: gitAdd }, { rule: npmRun }]);
  });

  it("reads a rule no answered ask would record as declined, in keywork's own words", async () => {
    const recorded = await answers();
    const writeAnything: PermissionRule = { action: "write", resource: "*", effect: "allow" };
    const removeAnything: PermissionRule = { action: "bash", resource: "rm *", effect: "allow" };
    expect(await clientAnswering(recorded.grantWrite).grantWorkspaceRule(writeAnything)).toEqual({
      refused: "declined",
      detail: "write and edit are approved once at a time",
    });
    expect(await clientAnswering(recorded.grantDelete).grantWorkspaceRule(removeAnything)).toEqual({
      refused: "declined",
      detail: "rm is remembered only as the exact command, never under a wildcard",
    });
  });

  it("reads a malformed rule as invalid and an unknown session as missing", async () => {
    const recorded = await answers();
    const malformed = await clientAnswering(recorded.grantMalformed).grantWorkspaceRule(gitAdd);
    expect(malformed).toMatchObject({ refused: "invalid" });
    expect(isGrantAheadRefusal(malformed)).toBe(true);
    expect(
      await clientAnswering(recorded.grantUnknownSession).grantSessionRule("nobody", npmRun),
    ).toEqual({ refused: "missing", detail: "no session has that id" });
  });

  it("lists a rule granted ahead exactly where an answered grant sits", async () => {
    const view = await clientAnswering((await answers()).afterGrant).permissions();
    expect(view.workspace).toEqual([gitAdd]);
    expect(view.session).toEqual({
      s1: [{ action: "bash", resource: "mkdir -p *", effect: "allow" }, npmRun],
    });
  });
});

describe("the grants fixture projected", () => {
  it("folds scope and the trusted gate into quiet row words, never into an ask", async () => {
    const runs = await grantRuns();
    expect(runs.map((run) => [run.callId, run.phase, grantWord(run)])).toEqual([
      ["g1", "done", "approved for this session"],
      ["g2", "done", "session grant"],
      ["g3", "done", "approved for this workspace"],
      ["g4", "done", "approved"],
      ["g5", "done", "approved"],
      ["g6", "done", "trusted"],
    ]);
    expect(toolRowText(runs[5] as ToolRun)).toMatch(/^bash git status · .*done · trusted$/);
  });

  it("records the rules a remembered answer would keep on each ask", async () => {
    const text = await readFile(fixture("grants.jsonl"), "utf8");
    const asks = text
      .split("\n")
      .filter((line) => line.includes('"gate.ask"'))
      .map((line) => (JSON.parse(line) as BusEnvelope<"gate.ask">).payload.ask);
    expect(asks.map((ask) => [ask.callId, ask.rules?.map((rule) => rule.resource)])).toEqual([
      ["g1", ["mkdir -p *"]],
      ["g3", ["git add *"]],
      ["g4", []],
      ["g5", []],
    ]);
  });

  it("previews the write on its ask and on the asking run, and previews no bash call", async () => {
    const stream = await grantEnvelopes();
    const asks = stream.flatMap((envelope) =>
      envelope.type === "gate.ask" ? [envelope.payload.ask] : [],
    );
    expect(asks.map((ask) => [ask.callId, ask.preview])).toEqual([
      ["g1", undefined],
      ["g3", undefined],
      ["g4", notesPreview],
      ["g5", undefined],
    ]);
    const asked = stream.findIndex(
      (envelope) => envelope.type === "gate.ask" && envelope.payload.ask.callId === "g4",
    );
    const asking = runsOf(stream.slice(0, asked + 1)).find((run) => run.callId === "g4");
    expect(asking).toMatchObject({ phase: "asking", ask: { preview: notesPreview } });
  });

  it("names permissions as changed after each remembered answer, the revoke and both grants ahead", async () => {
    const changed = (await grantEnvelopes()).filter(
      (envelope) => envelope.type === "surface.changed",
    );
    expect(changed.map((envelope) => [envelope.sessionId, envelope.payload])).toEqual(
      Array.from({ length: 5 }, () => ["", { kind: "permissions" }]),
    );
  });
});
