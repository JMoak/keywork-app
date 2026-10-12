import { readFile } from "node:fs/promises";
import type { BusEnvelope, PermissionRule } from "@keywork-app/protocol";
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
  | "afterRevoke",
  Recorded
>;

const fixture = (name: string): URL => new URL(`./fixtures/${name}`, import.meta.url);

const answers = async (): Promise<GrantAnswers> =>
  JSON.parse(await readFile(fixture("grants.json"), "utf8")) as GrantAnswers;

async function grantRuns(): Promise<ToolRun[]> {
  const text = await readFile(fixture("grants.jsonl"), "utf8");
  const envelopes = text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as BusEnvelope);
  return projectAll(emptyProjection, envelopes).entries.flatMap((entry) =>
    entry.kind === "tool" ? [entry.run] : [],
  );
}

function answering(recorded: Recorded): { bodies: unknown[]; fetch: Fetch } {
  const bodies: unknown[] = [];
  const fetch: Fetch = async (_url, init = {}) => {
    bodies.push(typeof init.body === "string" ? JSON.parse(init.body) : undefined);
    return new Response(JSON.stringify(recorded.body), { status: recorded.status });
  };
  return { bodies, fetch };
}

const gitAdd: PermissionRule = { action: "bash", resource: "git add *", effect: "allow" };

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
});

describe("the grants fixture projected", () => {
  it("folds scope and the trusted gate into quiet row words, never into an ask", async () => {
    const runs = await grantRuns();
    expect(runs.map((run) => [run.callId, run.phase, grantWord(run)])).toEqual([
      ["g1", "done", "session grant"],
      ["g2", "done", "session grant"],
      ["g3", "done", "workspace grant"],
      ["g4", "done", undefined],
      ["g5", "done", undefined],
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
});
