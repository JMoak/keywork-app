import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { type HelperPort, openHelper, processSpawn } from "./port.ts";
import {
  type HelperReply,
  helperLine,
  helperProtocolVersion,
  parseHelperReply,
} from "./protocol.ts";
import {
  signalPipePath,
  standIn,
  standInEnvironment,
  standInScript,
  standInSpawn,
} from "./stand-in.ts";

const v = helperProtocolVersion;
const display = { x: 0, y: 0, width: 1920, height: 1080, scaleFactor: 1 };
const opened: HelperPort[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((port) => port.stop()));
});

async function helper(): Promise<{ port: HelperPort; replies: HelperReply[] }> {
  const port = await openHelper(standInSpawn());
  if (port === undefined) throw new Error("the stand-in never said hello");
  opened.push(port);
  const replies: HelperReply[] = [];
  port.onReply((reply) => replies.push(reply));
  return { port, replies };
}

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function inProcess(now = { at: 1000 }) {
  const lines: HelperReply[] = [];
  const exits: number[] = [];
  const helper = standIn({
    write: (line) => {
      const reply = parseHelperReply(line);
      if (reply !== undefined) lines.push(reply);
    },
    exit: (code) => exits.push(code),
    now: () => now.at,
    later: () => () => undefined,
  });
  return { helper, lines, exits, now };
}

describe("the input helper stand-in, in process", () => {
  it("refuses everything before hello, and a version it does not speak", () => {
    const { helper, lines, exits } = inProcess();
    helper.receive(JSON.stringify({ v, kind: "release-all" }));
    expect(lines.at(-1)).toEqual({ v, kind: "refused", reason: "version" });
    helper.receive(JSON.stringify({ v, kind: "hello", versions: [99] }));
    expect(lines).toContainEqual({ v, kind: "refused", reason: "version" });
    expect(exits).toEqual([2]);
  });

  it("refuses input for another grant or past its expiry, and malformed lines", () => {
    const { helper, lines, now } = inProcess();
    helper.receive(JSON.stringify({ v, kind: "hello", versions: [1] }));
    helper.receive(JSON.stringify({ v, kind: "grant", grantId: "g1", expiresAt: 2000, display }));
    helper.receive(
      JSON.stringify({ v, kind: "key", grantId: "g2", seq: 1, code: "KeyA", down: true }),
    );
    expect(lines.at(-1)).toEqual({ v, kind: "refused", seq: 1, reason: "wrong-grant" });
    now.at = 2000;
    helper.receive(
      JSON.stringify({ v, kind: "key", grantId: "g1", seq: 2, code: "KeyA", down: true }),
    );
    expect(lines.at(-1)).toEqual({ v, kind: "refused", seq: 2, reason: "expired" });
    helper.receive(
      JSON.stringify({ v, kind: "ptr", grantId: "g1", seq: 3, action: "move", x: 2, y: 0 }),
    );
    expect(lines.at(-1)).toEqual({ v, kind: "refused", reason: "malformed" });
  });

  it("reports simulated local input only while it holds a grant", () => {
    const { helper, lines } = inProcess();
    helper.receive(JSON.stringify({ v, kind: "hello", versions: [1] }));
    helper.localInput();
    expect(lines.map((line) => line.kind)).not.toContain("local-input");
    helper.receive(JSON.stringify({ v, kind: "grant", grantId: "g1", expiresAt: 2000, display }));
    helper.localInput();
    expect(lines.at(-1)).toEqual({ v, kind: "local-input" });
  });

  it("names its control pipe for each platform", () => {
    expect(signalPipePath("keywork-stand-in", "win32")).toBe("\\\\.\\pipe\\keywork-stand-in");
    expect(signalPipePath("keywork-stand-in", "linux")).toMatch(/keywork-stand-in\.sock$/);
    expect(standInEnvironment.safeParse({ KEYWORK_STAND_IN_PIPE: "a/b" }).success).toBe(false);
  });
});

describe("the input helper stand-in, as a process", () => {
  it("says hello, refuses input without a live grant, then applies sequenced input and reports what it holds", async () => {
    const { port, replies } = await helper();
    expect(port.impl).toBe("stand-in");
    port.input({ kind: "key", grantId: "g1", seq: 1, code: "KeyA", down: true });
    await until(() => replies.some((reply) => reply.kind === "refused"));
    expect(replies).toContainEqual({ v, kind: "refused", seq: 1, reason: "no-grant" });
    expect(await port.grant({ grantId: "g1", expiresAt: Date.now() + 60_000, display })).toBe(true);
    port.input({ kind: "key", grantId: "g1", seq: 2, code: "ShiftLeft", down: true });
    port.input({ kind: "ptr", grantId: "g1", seq: 1, action: "move", x: 0.5, y: 0.5 });
    port.input({
      kind: "ptr",
      grantId: "g1",
      seq: 2,
      action: "down",
      x: 0.5,
      y: 0.5,
      button: "left",
    });
    expect(await port.releaseAll()).toEqual({ keys: ["ShiftLeft"], buttons: ["left"] });
    expect(replies.filter((reply) => reply.kind === "applied")).toHaveLength(3);
  });

  it("releases everything and exits when stdin closes", async () => {
    const child = processSpawn(process.execPath, [standInScript])();
    const output: string[] = [];
    child.onOutput((chunk) => output.push(chunk));
    child.write(helperLine({ v, kind: "hello", versions: [1] }));
    child.write(
      helperLine({ v, kind: "grant", grantId: "g1", expiresAt: Date.now() + 60_000, display }),
    );
    child.write(helperLine({ v, kind: "key", grantId: "g1", seq: 1, code: "KeyQ", down: true }));
    await until(() => output.join("").includes('"applied"'));
    child.end();
    await child.exited;
    expect(output.join("")).toContain('"kind":"released","keys":["KeyQ"]');
  });

  it("exits by itself when the grant expires", async () => {
    const { port, replies } = await helper();
    await port.grant({ grantId: "g1", expiresAt: Date.now() + 100, display });
    await until(() => replies.some((reply) => reply.kind === "bye"));
  });
});

describe("the shared consent rules, against the stand-in", () => {
  const rules = JSON.parse(
    readFileSync(
      new URL("../../../../../../fixtures/screen/consent-rules.json", import.meta.url),
      "utf8",
    ),
  ) as ConsentRules;

  for (const rule of rules.cases) {
    it(rule.name, async () => {
      let { port, replies } = await helper();
      let seq = 0;
      for (const step of rule.steps) {
        if (step.do === "grant") {
          await port.grant({ grantId: "g1", expiresAt: Date.now() + step.lifetimeMs, display });
        }
        if (step.do === "wait") await new Promise((resolve) => setTimeout(resolve, step.ms));
        if (step.do === "restart") {
          await port.stop();
          ({ port, replies } = await helper());
        }
        if (step.do === "input") {
          seq += 1;
          const sent = seq;
          port.input({ kind: "key", grantId: "g1", seq: sent, code: "KeyA", down: false });
          const answered = (reply: HelperReply) =>
            (reply.kind === "applied" || reply.kind === "refused") && reply.seq === sent;
          await until(() => replies.some(answered) || replies.some((r) => r.kind === "bye"));
          const answer = replies.find(answered);
          expect(answer?.kind === "applied" ? "applied" : "refused").toBe(step.expect);
        }
      }
    });
  }
});

interface ConsentRules {
  readonly cases: readonly {
    readonly name: string;
    readonly steps: readonly (
      | { do: "grant"; lifetimeMs: number }
      | { do: "wait"; ms: number }
      | { do: "restart" }
      | { do: "input"; expect: "applied" | "refused" }
    )[];
  }[];
}
