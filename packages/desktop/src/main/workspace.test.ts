import type { ServerDocument, ServerTicket } from "@keywork-app/client";
import { describe, expect, it } from "vitest";
import { type FileSeams, recentStore } from "./recents.ts";
import {
  expectedServerVersion,
  type ServerProcess,
  type ServeSpec,
  type ServeState,
} from "./serve-process.ts";
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

function harness(options: {
  ticket?: ServerTicket | "corrupt";
  ticketAnswers?: "ok" | "dead" | "old";
  onPath?: string;
  pathVersion?: string;
  outcome?: "ready" | "unresolved";
}): Harness {
  const ticketFile = "/home/me/.keywork/server.json";
  const fs = memoryFs(
    options.ticket === undefined
      ? {}
      : { [ticketFile]: options.ticket === "corrupt" ? "{" : JSON.stringify(options.ticket) },
  );
  const processes: FakeProcess[] = [];
  const answers = options.ticketAnswers ?? "ok";
  return {
    fs,
    processes,
    seams: {
      ticketFile,
      readText: fs.readText,
      fetchDocument: async (): Promise<ServerDocument> => {
        if (answers === "dead") throw new Error("refused");
        return { version: answers === "old" ? "0.0.0" : expectedServerVersion, operationIds: [] };
      },
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
    expect(h.fs.files.has(h.seams.ticketFile) && _case === "absent").toBe(false);
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
      { workspace: "/work", failure: { kind: "failed", exitCode: 1, detail: "crash" } },
    ]);
    await host.close("/work");
    expect(h.processes[0]?.stopped).toBe(1);
    await host.close("/work");
    expect(h.processes[0]?.stopped).toBe(1);
  });

  it("closes everything it holds on closeAll", async () => {
    const h = harness({});
    const host = workspaceHost(h.seams);
    await host.open("/a");
    await host.open("/b");
    await host.closeAll();
    expect(h.processes.map((process) => process.stopped)).toEqual([1, 1]);
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
    expect(versionOfLine("keywork 0.0.1\n")).toBe("0.0.1");
    expect(versionOfLine("nope")).toBeUndefined();
    expect(await readTicket("/t", async () => '{"url":"http://x","token":"y"}')).toEqual({
      url: "http://x",
      token: "y",
    });
    expect(await readTicket("/t", async () => '{"url":1}')).toBeUndefined();
    expect(await readTicket("/t", async () => undefined)).toBeUndefined();
  });
});
