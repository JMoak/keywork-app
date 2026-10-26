import type { ServerTicket } from "@keywork-app/client";
import { describe, expect, it } from "vitest";
import { type FileSeams, recentStore } from "./recents.ts";
import {
  expectedServerVersion,
  type ServerProcess,
  type ServeSpec,
  type ServeState,
} from "./serve-process.ts";
import type { LiveServer } from "./ticket.ts";
import {
  chooseBinary,
  readTicket,
  type ServerLoss,
  versionOfLine,
  type WorkspaceSeams,
  workspaceHost,
} from "./workspace.ts";

interface FakeProcess extends ServerProcess {
  listeners: Array<(state: ServeState) => void>;
  stopped: number;
  spec: ServeSpec;
}

function fakeProcess(spec: ServeSpec, outcome: "ready" | "unresolved"): FakeProcess {
  const ticket: ServerTicket = { url: "http://127.0.0.1:4771", token: "spawned" };
  const process: FakeProcess = {
    spec,
    listeners: [],
    stopped: 0,
    state: { kind: "stopped" },
    start: async () =>
      outcome === "ready"
        ? { ok: true, ticket, version: expectedServerVersion, pid: 5 }
        : {
            ok: false,
            failure: { kind: "unresolved", message: "no model", nextAction: "connect" },
          },
    stop: async () => {
      process.stopped += 1;
    },
    watch: (listener) => {
      process.listeners.push(listener);
      return () => undefined;
    },
  };
  return process;
}

function memoryFs(initial: Record<string, string>): FileSeams & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    readText: async (path) => files.get(path),
    writeText: async (path, text) => {
      files.set(path, text);
    },
    rename: async (from, to) => {
      files.set(to, files.get(from) ?? "");
      files.delete(from);
    },
  };
}

interface Harness {
  seams: WorkspaceSeams;
  processes: FakeProcess[];
  fs: ReturnType<typeof memoryFs>;
}

const workspaceIdentity = "5de0568f6bc0";
const workspaceTicketFile = `/home/me/.keywork/workspaces/${workspaceIdentity}/server.json`;
const userTicketFile = "/home/me/.keywork/server.json";

type Answer = "ok" | "dead" | "old" | "foreign" | "unnamed";

function harness(options: {
  ticket?: ServerTicket | "corrupt";
  ticketAnswers?: Answer;
  userTicket?: ServerTicket;
  answers?: Record<string, Answer>;
  onPath?: string;
  pathVersion?: string;
  outcome?: "ready" | "unresolved";
}): Harness {
  const fs = memoryFs({
    ...(options.ticket !== undefined && {
      [workspaceTicketFile]: options.ticket === "corrupt" ? "{" : JSON.stringify(options.ticket),
    }),
    ...(options.userTicket !== undefined && {
      [userTicketFile]: JSON.stringify(options.userTicket),
    }),
  });
  const processes: FakeProcess[] = [];
  const answerFor = (ticket: ServerTicket): Answer =>
    options.answers?.[ticket.url] ?? options.ticketAnswers ?? "ok";
  return {
    fs,
    processes,
    seams: {
      locateTickets: async () => ({
        identity: workspaceIdentity,
        files: [workspaceTicketFile, userTicketFile],
      }),
      readText: fs.readText,
      removeFile: async (path) => {
        fs.files.delete(path);
      },
      probeTicket: async (ticket) => liveServer(answerFor(ticket)),
      supervise: (spec) => {
        const process = fakeProcess(spec, options.outcome ?? "ready");
        processes.push(process);
        return process;
      },
      keyworkOnPath: async () => options.onPath,
      binaryVersion: async () => options.pathVersion,
      bundledBinary: "/app/resources/sidecar/keywork",
      recents: recentStore("/data/recents.json", fs),
    },
  };
}

function liveServer(answer: Answer): LiveServer | undefined {
  switch (answer) {
    case "dead":
      return undefined;
    case "old":
      return { version: "0.0.0", identity: workspaceIdentity };
    case "foreign":
      return { version: expectedServerVersion, identity: "0123456789ab" };
    case "unnamed":
      return { version: expectedServerVersion, identity: undefined };
    case "ok":
      return { version: expectedServerVersion, identity: workspaceIdentity };
  }
}

const terminalTicket: ServerTicket = { url: "http://127.0.0.1:4770", token: "terminal" };

describe("workspaceHost: attach first, spawn second", () => {
  it("attaches to a running server named by the ticket and never spawns", async () => {
    const h = harness({ ticket: terminalTicket });
    const host = workspaceHost(h.seams);
    const opened = await host.open("/work");
    expect(opened).toEqual({
      ok: true,
      opened: {
        workspace: "/work",
        server: terminalTicket,
        attached: true,
        version: expectedServerVersion,
        binary: undefined,
      },
    });
    expect(h.processes).toHaveLength(0);
    expect((await host.recent()).map((entry) => entry.path)).toEqual(["/work"]);
    await host.close("/work");
  });

  it.each([
    ["absent", {}],
    ["dead", { ticket: terminalTicket, ticketAnswers: "dead" as const }],
    ["corrupt", { ticket: "corrupt" as const }],
  ])("spawns its own server when the ticket is %s", async (_case, options) => {
    const h = harness(options);
    const host = workspaceHost(h.seams);
    const opened = await host.open("/work");
    expect(opened).toMatchObject({
      ok: true,
      opened: { attached: false, binary: "/app/resources/sidecar/keywork" },
    });
    expect(h.processes).toHaveLength(1);
    expect(h.processes[0]?.spec).toEqual({
      binary: "/app/resources/sidecar/keywork",
      cwd: "/work",
    });
    expect(h.fs.files.has(workspaceTicketFile) && _case === "absent").toBe(false);
  });

  it("refuses a running server of another version instead of spawning beside it", async () => {
    const h = harness({ ticket: terminalTicket, ticketAnswers: "old" });
    const opened = await workspaceHost(h.seams).open("/work");
    expect(opened).toMatchObject({
      ok: false,
      failure: { kind: "version-mismatch", actual: "0.0.0", ticket: terminalTicket },
    });
    expect(h.processes).toHaveLength(0);
  });

  it("reads the per-workspace ticket before the user-level one", async () => {
    const userLevel: ServerTicket = { url: "http://127.0.0.1:4790", token: "user" };
    const h = harness({ ticket: terminalTicket, userTicket: userLevel });
    expect(await workspaceHost(h.seams).open("/work")).toMatchObject({
      ok: true,
      opened: { server: terminalTicket, attached: true },
    });
  });

  it("never lets a stale per-workspace ticket shadow the live user-level one", async () => {
    const userLevel: ServerTicket = { url: "http://127.0.0.1:4790", token: "user" };
    const h = harness({
      ticket: terminalTicket,
      userTicket: userLevel,
      answers: { [terminalTicket.url]: "dead" },
    });
    expect(await workspaceHost(h.seams).open("/work")).toMatchObject({
      ok: true,
      opened: { server: userLevel, attached: true },
    });
    expect(h.processes).toHaveLength(0);
  });

  it("spawns rather than attach when every ticket names a dead port", async () => {
    const h = harness({
      ticket: terminalTicket,
      userTicket: { url: "http://127.0.0.1:4790", token: "user" },
      ticketAnswers: "dead",
    });
    expect(await workspaceHost(h.seams).open("/work")).toMatchObject({
      ok: true,
      opened: { attached: false },
    });
    expect(h.processes).toHaveLength(1);
  });

  it("never attaches to a server that names another workspace, and trusts one that names none", async () => {
    const userLevel: ServerTicket = { url: "http://127.0.0.1:4790", token: "user" };
    const foreign = harness({ userTicket: userLevel, ticketAnswers: "foreign" });
    expect(await workspaceHost(foreign.seams).open("/work")).toMatchObject({
      opened: { attached: false },
    });
    const unnamed = harness({ userTicket: userLevel, ticketAnswers: "unnamed" });
    expect(await workspaceHost(unnamed.seams).open("/work")).toMatchObject({
      opened: { server: userLevel, attached: true },
    });
  });

  it("returns the serve failure and stops the failed process", async () => {
    const h = harness({ outcome: "unresolved" });
    const host = workspaceHost(h.seams);
    const opened = await host.open("/work");
    expect(opened).toMatchObject({
      ok: false,
      failure: { kind: "unresolved", nextAction: "connect" },
    });
    expect(h.processes[0]?.stopped).toBe(1);
    expect(await host.recent()).toEqual([]);
  });

  it("reuses an open workspace, stops only servers it started, and relays losses", async () => {
    const h = harness({});
    const host = workspaceHost(h.seams);
    const losses: ServerLoss[] = [];
    host.onServerLost((loss) => losses.push(loss));
    const first = await host.open("/work");
    const again = await host.open("/work");
    expect(again).toEqual(first);
    expect(h.processes).toHaveLength(1);
    h.processes[0]?.listeners[0]?.({
      kind: "failed",
      failure: { kind: "failed", exitCode: 1, detail: "crash" },
    });
    expect(losses).toEqual([
      {
        workspace: "/work",
        failure: { kind: "failed", exitCode: 1, detail: "crash" },
        reattaching: false,
      },
    ]);
    await host.close("/work");
    expect(h.processes[0]?.stopped).toBe(1);
    await host.close("/work");
    expect(h.processes[0]?.stopped).toBe(1);
  });

  it("follows a restarted server to its new ticket, and only ever hands the ticket to main", async () => {
    const h = harness({});
    const host = workspaceHost(h.seams);
    await host.open("/work");
    expect(host.ticketFor("/work")).toEqual({ url: "http://127.0.0.1:4771", token: "spawned" });
    h.processes[0]?.listeners[0]?.({
      kind: "ready",
      ticket: { url: "http://127.0.0.1:4799", token: "restarted" },
      version: expectedServerVersion,
      pid: 6,
    });
    expect(host.ticketFor("/work")).toEqual({ url: "http://127.0.0.1:4799", token: "restarted" });
    expect(host.ticketFor("/elsewhere")).toBeUndefined();
  });

  it("clears the tickets a force-killed server of its own left behind, never a foreign one", async () => {
    const own = harness({});
    const ownHost = workspaceHost(own.seams);
    await ownHost.open("/work");
    const spawned = JSON.stringify({ url: "http://127.0.0.1:4771", token: "spawned" });
    own.fs.files.set(workspaceTicketFile, spawned);
    own.fs.files.set(userTicketFile, spawned);
    await ownHost.close("/work");
    expect(own.fs.files.has(workspaceTicketFile)).toBe(false);
    expect(own.fs.files.has(userTicketFile)).toBe(false);

    const foreign = harness({});
    const foreignHost = workspaceHost(foreign.seams);
    await foreignHost.open("/work");
    foreign.fs.files.set(workspaceTicketFile, JSON.stringify(terminalTicket));
    await foreignHost.close("/work");
    expect(foreign.fs.files.has(workspaceTicketFile)).toBe(true);
  });

  it("restarts a server it started by stopping it and spawning afresh, and lists its open roots", async () => {
    const h = harness({});
    const host = workspaceHost(h.seams);
    const first = await host.open("/work");
    expect(host.openRoots()).toEqual(["/work"]);
    const restarted = await host.restart("/work");
    expect(restarted.ok).toBe(true);
    expect(h.processes).toHaveLength(2);
    expect(h.processes[0]?.stopped).toBe(1);
    expect(h.processes[1]?.stopped).toBe(0);
    expect(restarted).toEqual(first);
    expect(host.openRoots()).toEqual(["/work"]);
    await host.close("/work");
    expect(host.openRoots()).toEqual([]);
  });

  it("restarts an attached workspace by attaching again, never spawning beside the terminal's server", async () => {
    const h = harness({ ticket: terminalTicket });
    const host = workspaceHost(h.seams);
    await host.open("/work");
    const restarted = await host.restart("/work");
    expect(restarted).toMatchObject({ ok: true, opened: { attached: true } });
    expect(h.processes).toHaveLength(0);
  });

  it("closes everything it holds on closeAll", async () => {
    const h = harness({});
    const host = workspaceHost(h.seams);
    await host.open("/a");
    await host.open("/b");
    await host.closeAll();
    expect(h.processes.map((process) => process.stopped)).toEqual([1, 1]);
  });

  it("makes closeAll wait for a close already in flight, so quit cannot outrun a stopping server", async () => {
    const h = harness({});
    let finishStop: () => void = () => undefined;
    const supervise = h.seams.supervise;
    h.seams.supervise = (spec) => {
      const process = supervise(spec);
      process.stop = () =>
        new Promise((resolve) => {
          finishStop = () => {
            (process as FakeProcess).stopped += 1;
            resolve();
          };
        });
      return process;
    };
    const host = workspaceHost(h.seams);
    await host.open("/a");
    const closing = host.close("/a");
    let allClosed = false;
    const all = host.closeAll().then(() => {
      allClosed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(allClosed).toBe(false);
    finishStop();
    await Promise.all([closing, all]);
    expect(h.processes[0]?.stopped).toBe(1);
  });
});

describe("binary choice", () => {
  it("prefers keywork on PATH only when its version matches, else the bundled sidecar", async () => {
    const bundled = "/app/resources/sidecar/keywork";
    const choose = (onPath: string | undefined, version: string | undefined) =>
      chooseBinary({
        keyworkOnPath: async () => onPath,
        binaryVersion: async () => version,
        bundledBinary: bundled,
      });
    expect(await choose("/usr/bin/keywork", expectedServerVersion)).toBe("/usr/bin/keywork");
    expect(await choose("/usr/bin/keywork", "0.0.0")).toBe(bundled);
    expect(await choose("/usr/bin/keywork", undefined)).toBe(bundled);
    expect(await choose(undefined, undefined)).toBe(bundled);
  });

  it("reads keywork --version output and the ticket file shape", async () => {
    expect(versionOfLine("keywork 0.2.0\n")).toBe("0.2.0");
    expect(versionOfLine("nope")).toBeUndefined();
    expect(await readTicket("/t", async () => '{"url":"http://x","token":"y"}')).toEqual({
      url: "http://x",
      token: "y",
    });
    expect(await readTicket("/t", async () => '{"url":1}')).toBeUndefined();
    expect(await readTicket("/t", async () => undefined)).toBeUndefined();
  });
});
