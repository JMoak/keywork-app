import type { ServerDocument, ServerTicket } from "@keywork-app/client";
import { describe, expect, it } from "vitest";
import {
  type ChildHandle,
  exitFailureOf,
  expectedServerVersion,
  type ServeState,
  type Spawn,
  type SupervisorSeams,
  superviseServer,
  treeKillCommand,
  unresolvedFailure,
} from "./serve-process.ts";

interface ScriptedChild {
  handle: ChildHandle;
  say(text: string): void;
  complain(text: string): void;
  exit(code: number | null): void;
}

function scriptedChild(pid: number): ScriptedChild {
  const out = channel();
  const err = channel();
  let finish: (code: number | null) => void = () => undefined;
  const exited = new Promise<number | null>((resolve) => {
    finish = resolve;
  });
  return {
    handle: {
      pid,
      stdout: out.iterable,
      stderr: err.iterable,
      exited,
      signal: (name) => {
        if (name === "SIGKILL") {
          out.close();
          err.close();
          finish(137);
        }
      },
    },
    say: out.push,
    complain: err.push,
    exit: (code) => {
      out.close();
      err.close();
      finish(code);
    },
  };
}

function channel(): { iterable: AsyncIterable<string>; push(text: string): void; close(): void } {
  const queue: string[] = [];
  const waiters: Array<() => void> = [];
  let closed = false;
  const wake = (): void => {
    for (const waiter of waiters.splice(0)) waiter();
  };
  return {
    push: (text) => {
      queue.push(text);
      wake();
    },
    close: () => {
      closed = true;
      wake();
    },
    iterable: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          const next = queue.shift();
          if (next !== undefined) {
            yield next;
            continue;
          }
          if (closed) return;
          await new Promise<void>((resolve) => waiters.push(resolve));
        }
      },
    },
  };
}

interface Harness {
  seams: SupervisorSeams;
  children: ScriptedChild[];
  spawned: Array<{ command: string; args: readonly string[]; cwd: string }>;
  delays: number[];
  states: ServeState[];
  document: ServerDocument;
}

function harness(options: { platform?: NodeJS.Platform; version?: string } = {}): Harness {
  const children: ScriptedChild[] = [];
  const spawned: Harness["spawned"] = [];
  const delays: number[] = [];
  const document: ServerDocument = {
    version: options.version ?? expectedServerVersion,
    operationIds: [],
  };
  const spawn: Spawn = (command, args, cwd) => {
    spawned.push({ command, args, cwd });
    const child = scriptedChild(100 + children.length);
    children.push(child);
    if (command === "taskkill") child.exit(0);
    return child.handle;
  };
  return {
    seams: {
      spawn,
      delay: async (ms) => {
        delays.push(ms);
      },
      freePort: async () => 4771,
      fetchDocument: async (ticket: ServerTicket) => {
        if (ticket.url.includes("dead")) throw new Error("connection refused");
        return document;
      },
      platform: options.platform ?? "linux",
    },
    children,
    spawned,
    delays,
    states: [],
    document,
  };
}

function announce(child: ScriptedChild, port = 4771): void {
  child.say(`listening on http://127.0.0.1:${port}\n`);
  child.say("token abc123\n");
  child.say("ticket /home/me/.keywork/server.json\n");
}

const spec = { binary: "/opt/keywork", cwd: "/work" };
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 2));

describe("superviseServer", () => {
  it("spawns serve on a free port, reads the ticket, health-checks, and reports ready", async () => {
    const h = harness();
    const server = superviseServer(spec, h.seams);
    server.watch((state) => h.states.push(state));
    const starting = server.start();
    await tick();
    expect(h.spawned[0]).toEqual({
      command: "/opt/keywork",
      args: ["serve", "--port", "4771"],
      cwd: "/work",
    });
    announce(h.children[0] as ScriptedChild);
    const started = await starting;
    expect(started).toEqual({
      ok: true,
      ticket: { url: "http://127.0.0.1:4771", token: "abc123" },
      version: expectedServerVersion,
      pid: 100,
    });
    expect(h.states.map((state) => state.kind)).toEqual(["starting", "ready"]);
  });

  it("maps exit codes and stderr into typed failures", async () => {
    const cases: Array<[number, string, object]> = [
      [2, "keywork serve: --port wants a whole number", { kind: "usage" }],
      [
        3,
        "no provider configured · run keywork connect\n\nconnect hint",
        {
          kind: "unresolved",
          message: "no provider configured",
          nextAction: "run keywork connect",
        },
      ],
      [
        1,
        "keywork serve: listen EADDRINUSE: address already in use",
        { kind: "port-in-use", port: 4771 },
      ],
      [1, "keywork serve: something broke", { kind: "failed", exitCode: 1 }],
    ];
    for (const [code, stderr, expected] of cases) {
      const h = harness();
      const server = superviseServer(spec, h.seams);
      const starting = server.start();
      await tick();
      const child = h.children[0] as ScriptedChild;
      child.complain(stderr);
      child.exit(code);
      const started = await starting;
      expect(started.ok).toBe(false);
      if (!started.ok) expect(started.failure).toMatchObject(expected);
      expect(server.state.kind).toBe("failed");
    }
  });

  it("reports a ticket that never comes and a server that does not answer", async () => {
    const silent = harness();
    const quiet = superviseServer(spec, silent.seams);
    const quietStart = quiet.start();
    await tick();
    (silent.children[0] as ScriptedChild).exit(0);
    expect(await quietStart).toMatchObject({ ok: false, failure: { kind: "no-ticket" } });

    const dead = harness();
    const unreachable = superviseServer(spec, dead.seams);
    const deadStart = unreachable.start();
    await tick();
    const child = dead.children[0] as ScriptedChild;
    child.say("listening on http://dead:4771\ntoken t\n");
    const outcome = await deadStart;
    expect(outcome).toMatchObject({ ok: false, failure: { kind: "unreachable" } });
    expect(await child.handle.exited).toBe(137);
  });

  it("refuses a version mismatch and stops the child it started", async () => {
    const h = harness({ version: "9.9.9" });
    const server = superviseServer(spec, h.seams);
    const starting = server.start();
    await tick();
    announce(h.children[0] as ScriptedChild);
    expect(await starting).toEqual({
      ok: false,
      failure: {
        kind: "version-mismatch",
        expected: expectedServerVersion,
        actual: "9.9.9",
        ticket: { url: "http://127.0.0.1:4771", token: "abc123" },
      },
    });
    expect(h.delays).toEqual([2000]);
  });

  it("restarts after an unexpected exit with 250ms doubling to 5s, and not after stop", async () => {
    const h = harness();
    const server = superviseServer(spec, h.seams);
    server.watch((state) => h.states.push(state));
    const starting = server.start();
    await tick();
    announce(h.children[0] as ScriptedChild);
    await starting;
    (h.children[0] as ScriptedChild).exit(1);
    await tick();
    expect(h.delays).toEqual([250]);
    expect(h.children).toHaveLength(2);
    announce(h.children[1] as ScriptedChild);
    await tick();
    expect(server.state.kind).toBe("ready");
    (h.children[1] as ScriptedChild).exit(1);
    await tick();
    expect(h.delays).toEqual([250, 500]);
    announce(h.children[2] as ScriptedChild);
    await tick();
    await server.stop();
    expect(server.state).toEqual({ kind: "stopped" });
    expect(h.children).toHaveLength(3);
    expect(h.states.map((state) => state.kind)).toEqual([
      "starting",
      "ready",
      "failed",
      "starting",
      "ready",
      "failed",
      "starting",
      "ready",
      "stopped",
    ]);
  });

  it("stops through SIGTERM, escalating to SIGKILL after the grace period", async () => {
    const h = harness();
    const server = superviseServer(spec, h.seams);
    const starting = server.start();
    await tick();
    announce(h.children[0] as ScriptedChild);
    await starting;
    await server.stop();
    expect(h.delays).toEqual([2000]);
    expect(await (h.children[0] as ScriptedChild).handle.exited).toBe(137);
  });

  it("stops through taskkill on Windows and waits for the child to be gone", async () => {
    const h = harness({ platform: "win32" });
    const server = superviseServer(spec, h.seams);
    const starting = server.start();
    await tick();
    announce(h.children[0] as ScriptedChild);
    await starting;
    const stopping = server.stop();
    await tick();
    expect(h.spawned[1]).toEqual({
      command: "taskkill",
      args: ["/pid", "100", "/T", "/F"],
      cwd: ".",
    });
    (h.children[0] as ScriptedChild).exit(null);
    await stopping;
    expect(server.state).toEqual({ kind: "stopped" });
  });
});

describe("failure parsing", () => {
  it("splits keywork's unresolved line into the message and the next action", () => {
    expect(unresolvedFailure("no model bound · run keywork connect\n\nhint")).toEqual({
      kind: "unresolved",
      message: "no model bound",
      nextAction: "run keywork connect",
    });
    expect(unresolvedFailure("odd")).toEqual({
      kind: "unresolved",
      message: "odd",
      nextAction: "",
    });
  });

  it("names the tree-kill command only where one is needed", () => {
    expect(treeKillCommand(7, "win32")).toEqual({
      command: "taskkill",
      args: ["/pid", "7", "/T", "/F"],
    });
    expect(treeKillCommand(7, "darwin")).toBeUndefined();
    expect(exitFailureOf(null, "boom", undefined)).toEqual({
      kind: "failed",
      exitCode: null,
      detail: "boom",
    });
    expect(exitFailureOf(0, "", 4771)).toMatchObject({ kind: "no-ticket" });
  });
});
