import type { ServerDocument, ServerTicket } from "@keywork-app/client";
import { keyworkProfile } from "@keywork-app/product";
import { describe, expect, it } from "vitest";
import { nodeConsentCard, sidecarNodeServing } from "./node-consent.ts";
import { type FileSeams, recentStore } from "./recents.ts";
import {
  bundledEngineVersion,
  type EngineSource,
  expectedContract,
  type ServeFailure,
  type ServerProcess,
  type ServeSpec,
  type ServeStart,
  type ServeState,
} from "./serve-process.ts";
import type { LiveServer } from "./ticket.ts";
import {
  chooseEngine,
  contractRefusal,
  type EngineLaunch,
  type EngineSeams,
  launchableEngine,
  type NodeRun,
  type NodeServing,
  nodeTicketWaitsMs,
  readTicket,
  reattachWaitsMs,
  type ServerLoss,
  serveSpecFor,
  versionOfLine,
  type WorkspaceClock,
  type WorkspaceSeams,
  workspaceHost,
} from "./workspace.ts";

interface FakeProcess extends ServerProcess {
  listeners: Array<(state: ServeState) => void>;
  stopped: number;
  spec: ServeSpec;
}

type Outcome = "ready" | "unresolved" | "other-contract";

const spawnedTicket: ServerTicket = { url: "http://127.0.0.1:4771", token: "spawned" };

function startOutcome(outcome: Outcome): ServeStart {
  switch (outcome) {
    case "ready":
      return { ok: true, ticket: spawnedTicket, version: bundledEngineVersion, pid: 5 };
    case "unresolved":
      return {
        ok: false,
        failure: { kind: "unresolved", message: "no model", nextAction: "connect" },
      };
    case "other-contract":
      return { ok: false, failure: otherContract(spawnedTicket) };
  }
}

function otherContract(ticket: ServerTicket): ServeFailure {
  return { kind: "contract-mismatch", expected: expectedContract, actual: "1.7", ticket };
}

function fakeProcess(spec: ServeSpec, outcome: Outcome): FakeProcess {
  const process: FakeProcess = {
    spec,
    listeners: [],
    stopped: 0,
    state: { kind: "stopped" },
    start: async () => startOutcome(outcome),
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

type Answer = "ok" | "dead" | "old" | "foreign" | "unnamed" | "other-contract" | "no-contract";

const sidecarPath = "/app/resources/sidecar/keywork";

const sidecar: EngineLaunch = {
  origin: "sidecar",
  command: sidecarPath,
  entry: [],
  from: sidecarPath,
};

const checkout = {
  root: "/src/stead/repos/keywork",
  cli: "/src/stead/repos/keywork/packages/cli/src/main.ts",
};

const sibling: EngineLaunch = {
  origin: "sibling repo",
  command: "bun",
  entry: [checkout.cli],
  from: checkout.cli,
};

function harness(options: {
  ticket?: ServerTicket | "corrupt";
  ticketAnswers?: Answer;
  userTicket?: ServerTicket;
  answers?: Record<string, Answer>;
  engine?: EngineLaunch;
  outcome?: Outcome;
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
      fetchDocument: async (ticket) => servedDocument(answerFor(ticket)),
      supervise: (spec) => {
        const process = fakeProcess(spec, options.outcome ?? "ready");
        processes.push(process);
        return process;
      },
      engine: async () => options.engine ?? sidecar,
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
      return { version: bundledEngineVersion, identity: "0123456789ab" };
    case "unnamed":
      return { version: bundledEngineVersion, identity: undefined };
    case "ok":
    case "other-contract":
    case "no-contract":
      return { version: bundledEngineVersion, identity: workspaceIdentity };
  }
}

function servedDocument(answer: Answer): ServerDocument {
  const served = (version: string, contract: string | undefined): ServerDocument => ({
    version,
    contract,
    operationIds: [],
  });
  switch (answer) {
    case "dead":
      throw new Error("connection refused");
    case "old":
      return served("0.0.0", expectedContract);
    case "other-contract":
      return served(bundledEngineVersion, "1.7");
    case "no-contract":
      return served(bundledEngineVersion, undefined);
    case "foreign":
    case "unnamed":
    case "ok":
      return served(bundledEngineVersion, expectedContract);
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
        version: bundledEngineVersion,
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

  it("says quitting stops only an engine it spawned, never one it attached to", async () => {
    const spawning = workspaceHost(harness({}).seams);
    const attaching = workspaceHost(harness({ ticket: terminalTicket }).seams);
    await spawning.open("/work");
    await attaching.open("/work");
    expect(spawning.stopsWithTheApp("/work")).toBe(true);
    expect(attaching.stopsWithTheApp("/work")).toBe(false);
    expect(spawning.stopsWithTheApp("/elsewhere")).toBe(false);
  });

  it("attaches to a running server of another release that speaks the same contract", async () => {
    const h = harness({ ticket: terminalTicket, ticketAnswers: "old" });
    const opened = await workspaceHost(h.seams).open("/work");
    expect(opened).toMatchObject({ ok: true, opened: { attached: true, version: "0.0.0" } });
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
      version: bundledEngineVersion,
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

describe("workspaceHost: the contract is the identity of an engine", () => {
  it("refuses an attached ticket whose contract differs, naming the ticket and both contracts, and never spawns beside it", async () => {
    const h = harness({ ticket: terminalTicket, ticketAnswers: "other-contract" });
    const host = workspaceHost(h.seams);
    expect(await host.open("/work")).toEqual({
      ok: false,
      failure: {
        kind: "contract-mismatch",
        expected: expectedContract,
        actual: "1.7",
        ticket: terminalTicket,
        source: { origin: "ticket", from: terminalTicket.url },
      },
    });
    expect(h.processes).toHaveLength(0);
    expect(await host.recent()).toEqual([]);
  });

  it("refuses an attached ticket that names no contract at all", async () => {
    const h = harness({ ticket: terminalTicket, ticketAnswers: "no-contract" });
    expect(await workspaceHost(h.seams).open("/work")).toMatchObject({
      ok: false,
      failure: { kind: "contract-mismatch", actual: undefined, expected: expectedContract },
    });
    expect(h.processes).toHaveLength(0);
  });

  it("refuses a spawned engine whose contract differs, naming where it came from, and stops it", async () => {
    const h = harness({ engine: sibling, outcome: "other-contract" });
    const host = workspaceHost(h.seams);
    expect(await host.open("/work")).toEqual({
      ok: false,
      failure: {
        kind: "contract-mismatch",
        expected: expectedContract,
        actual: "1.7",
        ticket: spawnedTicket,
        source: { origin: "sibling repo", from: checkout.cli },
      },
    });
    expect(h.processes[0]?.stopped).toBe(1);
    expect(await host.recent()).toEqual([]);
  });

  it("runs the sibling checkout through bun, its CLI ahead of the serve verb, and reports that file as the binary", async () => {
    const h = harness({ engine: sibling });
    expect(await workspaceHost(h.seams).open("/work")).toMatchObject({
      ok: true,
      opened: { attached: false, binary: checkout.cli },
    });
    expect(h.processes[0]?.spec).toEqual({ binary: "bun", cwd: "/work", entry: [checkout.cli] });
  });

  it("names the engine a later contract loss came from", async () => {
    const h = harness({ engine: sibling });
    const host = workspaceHost(h.seams);
    const losses: ServerLoss[] = [];
    host.onServerLost((loss) => losses.push(loss));
    await host.open("/work");
    h.processes[0]?.listeners[0]?.({ kind: "failed", failure: otherContract(spawnedTicket) });
    expect(losses).toEqual([
      {
        workspace: "/work",
        failure: {
          ...otherContract(spawnedTicket),
          source: { origin: "sibling repo", from: checkout.cli },
        },
        reattaching: false,
      },
    ]);
  });
});

describe("engine choice", () => {
  const seamsWith = (overrides: Partial<EngineSeams>): EngineSeams => ({
    packaged: false,
    bundledBinary: sidecarPath,
    keyworkBin: "/opt/keywork-bin",
    siblingCheckout: async () => checkout,
    keyworkOnPath: async () => "/usr/bin/keywork",
    ...overrides,
  });
  const direct = (origin: "sidecar" | "KEYWORK_BIN" | "PATH", binary: string): EngineLaunch => ({
    origin,
    command: binary,
    entry: [],
    from: binary,
  });

  it("packaged: the sidecar it ships, never KEYWORK_BIN, a checkout or PATH, which it does not even look at", async () => {
    let lookedOnPath = 0;
    const seams = seamsWith({
      packaged: true,
      keyworkOnPath: async () => {
        lookedOnPath += 1;
        return "/usr/bin/keywork";
      },
    });
    expect(await chooseEngine(seams)).toEqual(sidecar);
    expect(lookedOnPath).toBe(0);
  });

  it("development: KEYWORK_BIN, then the sibling checkout through bun, then PATH, then the sidecar", async () => {
    expect(await chooseEngine(seamsWith({}))).toEqual(direct("KEYWORK_BIN", "/opt/keywork-bin"));
    expect(await chooseEngine(seamsWith({ keyworkBin: undefined }))).toEqual(sibling);
    const noCheckout = { keyworkBin: "", siblingCheckout: async () => undefined };
    expect(await chooseEngine(seamsWith(noCheckout))).toEqual(direct("PATH", "/usr/bin/keywork"));
    expect(
      await chooseEngine(seamsWith({ ...noCheckout, keyworkOnPath: async () => undefined })),
    ).toEqual(sidecar);
  });

  it("gives the terminal pane one launchable file, so a checkout run through bun yields to the next choice", async () => {
    expect(await launchableEngine(seamsWith({}))).toBe("/opt/keywork-bin");
    expect(await launchableEngine(seamsWith({ keyworkBin: undefined }))).toBe("/usr/bin/keywork");
    expect(await launchableEngine(seamsWith({ packaged: true }))).toBe(sidecarPath);
  });

  it("writes the entry into the serve spec only when the engine runs through one", () => {
    expect(serveSpecFor(sidecar, "/work")).toEqual({ binary: sidecarPath, cwd: "/work" });
    expect(serveSpecFor(sibling, "/work")).toEqual({
      binary: "bun",
      cwd: "/work",
      entry: [checkout.cli],
    });
  });

  it("launches a fresh home from the existing engine directory while retaining its workspace identity", () => {
    expect(serveSpecFor(sidecar, "/missing/home", true)).toEqual({
      binary: sidecarPath,
      cwd: "/missing/home",
      launchCwd: "/app/resources/sidecar",
      home: true,
    });
    expect(serveSpecFor(sibling, "/missing/home", true)).toEqual({
      binary: "bun",
      cwd: "/missing/home",
      launchCwd: "/src/stead/repos/keywork/packages/cli/src",
      entry: [checkout.cli],
      home: true,
    });
  });
});

describe("the refusal in the keeper's words", () => {
  const refusal = (source: EngineSource | undefined, actual: string | null = "1.7") =>
    contractRefusal({
      kind: "contract-mismatch",
      expected: "1.25",
      actual: actual ?? undefined,
      ticket: terminalTicket,
      source,
    });

  it("names where the engine came from, both contracts, and the next step", () => {
    expect(refusal({ origin: "PATH", from: String.raw`C:\bin\keywork.cmd` })).toEqual({
      message: String.raw`the engine on PATH (C:\bin\keywork.cmd) speaks contract 1.7; ${keyworkProfile.name} was built for contract 1.25`,
      nextAction: "put an engine that speaks 1.25 first on PATH, or name one in KEYWORK_BIN",
    });
    expect(refusal({ origin: "ticket", from: terminalTicket.url })).toEqual({
      message: `the engine already serving this folder (127.0.0.1:4770) speaks contract 1.7; ${keyworkProfile.name} was built for contract 1.25`,
      nextAction: "stop that engine and open the folder again",
    });
    expect(refusal({ origin: "sidecar", from: sidecarPath })).toEqual({
      message: `the engine this console ships (${sidecarPath}) speaks contract 1.7; ${keyworkProfile.name} was built for contract 1.25`,
      nextAction: `reinstall ${keyworkProfile.name}; its console and engine were built apart`,
    });
    expect(refusal({ origin: "KEYWORK_BIN", from: "/opt/keywork-bin" })).toEqual({
      message: `the engine KEYWORK_BIN names (/opt/keywork-bin) speaks contract 1.7; ${keyworkProfile.name} was built for contract 1.25`,
      nextAction: "point KEYWORK_BIN at an engine that speaks 1.25, or unset it",
    });
    expect(refusal({ origin: "sibling repo", from: checkout.cli }, null)).toEqual({
      message: `the engine in the sibling checkout (${checkout.cli}) names no contract; ${keyworkProfile.name} was built for contract 1.25`,
      nextAction: "bring that checkout to contract 1.25",
    });
    expect(refusal(undefined)).toEqual({
      message: `the engine speaks contract 1.7; ${keyworkProfile.name} was built for contract 1.25`,
      nextAction: "",
    });
  });

  it("offers the restart for the node this console installed, and names a node it did not", () => {
    const fromTheNode = (node: "this-install" | "another-install") =>
      refusal({ origin: "ticket", from: terminalTicket.url, node });
    expect(fromTheNode("this-install")).toEqual({
      message: `the node ${keyworkProfile.name} installed, serving this folder (127.0.0.1:4770), speaks contract 1.7; ${keyworkProfile.name} was built for contract 1.25`,
      nextAction: `restart the node on the engine ${keyworkProfile.name} ships (\`keywork node restart\`); ${keyworkProfile.name} asks before it does`,
    });
    expect(fromTheNode("another-install")).toEqual({
      message: `the node serving this folder (127.0.0.1:4770), which ${keyworkProfile.name} did not install, speaks contract 1.7; ${keyworkProfile.name} was built for contract 1.25`,
      nextAction: `${keyworkProfile.name} never restarts a node it did not install; run \`keywork node restart\` with the engine that installed it, then open the folder again`,
    });
  });
});

describe("binary choice", () => {
  it("reads keywork --version output in both forms, and the ticket file shape", async () => {
    expect(versionOfLine("keywork 0.2.0\n")).toBe("0.2.0");
    expect(versionOfLine("keywork 0.2.0 · contract 1.25\n")).toBe("0.2.0");
    expect(versionOfLine("keywork 0.2.0 contract 1.25")).toBeUndefined();
    expect(versionOfLine("nope")).toBeUndefined();
    expect(await readTicket("/t", async () => '{"url":"http://x","token":"y"}')).toEqual({
      url: "http://x",
      token: "y",
    });
    expect(await readTicket("/t", async () => '{"url":1}')).toBeUndefined();
    expect(await readTicket("/t", async () => undefined)).toBeUndefined();
  });
});

describe("workspaceHost: the node serves what you open", () => {
  const nodeTickets: ServerTicket[] = [
    { url: "http://127.0.0.1:53111", token: "node" },
    { url: "http://127.0.0.1:53112", token: "node-again" },
  ];

  interface NodeWorld {
    node: NodeServing;
    clock: WorkspaceClock;
    calls: string[];
    waits: number[];
  }

  interface NodeOptions {
    serves?: boolean;
    add?: NodeRun;
    ticketAfterWaits?: number;
  }

  function nodeWorld(h: Harness, answers: Record<string, Answer>, options: NodeOptions): NodeWorld {
    const calls: string[] = [];
    const waits: number[] = [];
    const ticketAfterWaits = options.ticketAfterWaits ?? 1;
    let waitsSinceAdd: number | undefined;
    let adds = 0;
    const publish = (): void => {
      const ticket = nodeTickets[adds - 1] ?? nodeTickets[0];
      h.fs.files.set(workspaceTicketFile, JSON.stringify(ticket));
    };
    return {
      calls,
      waits,
      node: {
        serves: async () => options.serves ?? true,
        add: async (folder) => {
          calls.push(`add ${folder}`);
          const ran = options.add ?? { code: 0, output: `serves: ${folder}` };
          if (ran.code !== 0) return ran;
          adds += 1;
          waitsSinceAdd = 0;
          if (ticketAfterWaits === 0) publish();
          return ran;
        },
        remove: async (folder) => {
          calls.push(`remove ${folder}`);
          for (const ticket of nodeTickets) answers[ticket.url] = "dead";
          h.fs.files.delete(workspaceTicketFile);
          return { code: 0, output: `stopped serving: ${folder}` };
        },
      },
      clock: {
        every: () => () => undefined,
        wait: async (ms) => {
          waits.push(ms);
          if (ms === 0 || waitsSinceAdd === undefined) return;
          waitsSinceAdd += 1;
          if (waitsSinceAdd === ticketAfterWaits) publish();
        },
      },
    };
  }

  function servedHost(options: NodeOptions = {}) {
    const answers: Record<string, Answer> = {};
    const h = harness({ answers });
    const world = nodeWorld(h, answers, options);
    const host = workspaceHost({ ...h.seams, node: world.node, clock: world.clock });
    return { h, world, host, answers };
  }

  it("hands an opened folder to the node, waits for its ticket and attaches, never spawning", async () => {
    const { h, world, host } = servedHost({ ticketAfterWaits: 2 });
    expect(await host.open("/work")).toEqual({
      ok: true,
      opened: {
        workspace: "/work",
        server: nodeTickets[0],
        attached: true,
        version: bundledEngineVersion,
        binary: undefined,
        servedByNode: true,
      },
    });
    expect(world.calls).toEqual(["add /work"]);
    expect(world.waits).toEqual([0, nodeTicketWaitsMs[0], nodeTicketWaitsMs[1]]);
    expect(host.servingOf("/work")).toBe("node");
    expect(host.servingOf("/elsewhere")).toBeUndefined();
    expect(h.processes).toHaveLength(0);
    expect((await host.recent()).map((entry) => entry.path)).toEqual(["/work"]);
  });

  it("spawns its own engine as before when no node is installed and running", async () => {
    const { h, world, host } = servedHost({ serves: false });
    const opened = await host.open("/work");
    expect(opened).toMatchObject({ ok: true, opened: { attached: false } });
    expect(opened.ok && opened.opened.servedByNode).toBeFalsy();
    expect(world.calls).toEqual([]);
    expect(h.processes).toHaveLength(1);
  });

  it("fails in words when the node refuses the folder, and never spawns beside it", async () => {
    const { h, host } = servedHost({
      add: { code: 2, output: "\nkeywork node workspace add: no folder at /work\n" },
    });
    expect(await host.open("/work")).toEqual({
      ok: false,
      failure: {
        kind: "unresolved",
        message:
          "the node did not take this folder: keywork node workspace add: no folder at /work",
        nextAction: "run `keywork node workspace add` in that folder to read the whole output",
      },
    });
    expect(h.processes).toHaveLength(0);
    expect(await host.recent()).toEqual([]);
  });

  it("fails in words when the node's ticket never appears within the bounded wait", async () => {
    const { h, world, host } = servedHost({ ticketAfterWaits: Number.POSITIVE_INFINITY });
    expect(await host.open("/work")).toEqual({
      ok: false,
      failure: {
        kind: "unresolved",
        message: "the node took this folder but did not start serving it within 20 s",
        nextAction:
          "`keywork node workspace list` shows what the node is doing with it; a node older than this console serves opened folders after `keywork node restart`",
      },
    });
    expect(world.waits).toEqual([0, ...nodeTicketWaitsMs]);
    expect(h.processes).toHaveLength(0);
  });

  it("refuses the node's ticket when it speaks another contract, and never spawns", async () => {
    const { h, host, answers } = servedHost({ ticketAfterWaits: 0 });
    const ticket = nodeTickets[0] as ServerTicket;
    answers[ticket.url] = "other-contract";
    expect(await host.open("/work")).toEqual({
      ok: false,
      failure: { ...otherContract(ticket), source: { origin: "ticket", from: ticket.url } },
    });
    expect(h.processes).toHaveLength(0);
  });

  it("hands a folder it lost back to the node rather than spawning beside it", async () => {
    const { h, world, host, answers } = servedHost({ ticketAfterWaits: 0 });
    await host.open("/work");
    answers[(nodeTickets[0] as ServerTicket).url] = "dead";
    h.fs.files.delete(workspaceTicketFile);
    expect(await host.open("/work")).toMatchObject({
      ok: true,
      opened: { server: nodeTickets[1], attached: true, servedByNode: true },
    });
    expect(world.calls).toEqual(["add /work", "add /work"]);
    expect(world.waits.filter((ms) => ms > 0)).toEqual([...reattachWaitsMs]);
    expect(h.processes).toHaveLength(0);
  });

  it("stops serving: the node lets the folder go and the console runs it for the rest of the session", async () => {
    const { h, world, host } = servedHost({ ticketAfterWaits: 0 });
    await host.open("/work");
    const stopped = await host.stopServing("/work");
    expect(stopped).toMatchObject({
      ok: true,
      opened: { attached: false, server: spawnedTicket },
    });
    expect(stopped.ok && stopped.opened.servedByNode).toBeFalsy();
    expect(world.calls).toEqual(["add /work", "remove /work"]);
    expect(h.processes).toHaveLength(1);
    expect(host.servingOf("/work")).toBe("console");
    await host.restart("/work");
    expect(world.calls).toEqual(["add /work", "remove /work"]);
    expect(h.processes).toHaveLength(2);
  });

  it("says a folder that runs with the console has no node to stop serving it", async () => {
    const h = harness({});
    const host = workspaceHost(h.seams);
    expect(await host.stopServing("/work")).toEqual({
      ok: false,
      failure: {
        kind: "unresolved",
        message: `this folder runs with the console; ${keyworkProfile.name} has no node to hand it to`,
        nextAction: "",
      },
    });
  });
});

describe("the node the packaged console hands folders to", () => {
  it("attaches and detaches one client lease without removing the shared workspace", async () => {
    const runs: { args: readonly string[]; cwd: string | undefined }[] = [];
    const serving = sidecarNodeServing({
      sidecar: sidecarPath,
      consolePid: 7300,
      clientId: () => "client-one",
      run: async (binary, args, cwd) => {
        expect(binary).toBe(sidecarPath);
        runs.push({ args, cwd });
        if (args[1] === "status")
          return {
            code: 0,
            output: JSON.stringify({
              runtimeCompatibility: 1,
              registration: { installed: true },
              liveness: "running",
              node: null,
            }),
          };
        return { code: 0, output: "" };
      },
    });
    await serving.add("C:/src/notes");
    await serving.remove("C:/src/notes");
    expect(runs).toEqual([
      { args: ["node", "status", "--json"], cwd: undefined },
      {
        args: [
          "node",
          "client",
          "attach",
          "C:/src/notes",
          "--product",
          "keywork",
          "--client",
          "client-one",
          "--console",
          "7300",
          "--contract",
          expectedContract,
          "--json",
        ],
        cwd: undefined,
      },
      { args: ["node", "client", "detach", "--client", "client-one", "--json"], cwd: undefined },
    ]);
  });

  it("serves only when the node is installed and running here", async () => {
    const servesWhen = (installed: boolean, liveness: string) =>
      sidecarNodeServing({
        sidecar: sidecarPath,
        consolePid: 7300,
        run: async () => ({
          code: 0,
          output: JSON.stringify({
            registration: { installed, program: sidecarPath },
            liveness,
            node:
              liveness === "absent" ? null : { startedAt: "2026-11-07T09:00:00Z", workspaces: [] },
          }),
        }),
      }).serves();
    expect(await servesWhen(true, "running")).toBe(true);
    expect(await servesWhen(true, "absent")).toBe(false);
    expect(await servesWhen(true, "stale")).toBe(false);
    expect(await servesWhen(false, "running")).toBe(false);
  });

  it("keeps home and project permission scopes explicit before any folder is selected", () => {
    const why = (folder: string | undefined) =>
      nodeConsentCard({
        platform: "win32",
        machine: "moak-main",
        account: "moakj",
        folder,
      }).detail.split("\n\n")[1];
    expect(why(undefined)).toBe(
      "Your creature can have a private home before you choose a project. Opening a project grants only the access you approve.",
    );
    expect(why("C:/src/stead")).toBe(why(undefined));
  });
});
describe("managed home and client leases", () => {
  it("opens a development home with --home and keeps it out of project recents", async () => {
    const h = harness({});
    const host = workspaceHost({ ...h.seams, homePath: "/private/home" });
    expect(await host.openHome?.()).toMatchObject({
      ok: true,
      opened: { workspace: "/private/home" },
    });
    expect(h.processes[0]?.spec).toMatchObject({ cwd: "/private/home", home: true });
    expect(await host.recent()).toEqual([]);
    expect(host.ticketFor("/private/home")).toEqual(spawnedTicket);
    await host.closeAll();
    expect(h.processes[0]?.stopped).toBe(1);
  });

  it("refuses to spawn an app-owned engine when a packaged shared runtime is unavailable", async () => {
    const h = harness({});
    const node: NodeServing = {
      required: true,
      serves: async () => false,
      add: async () => ({ code: 0, output: "" }),
      remove: async () => ({ code: 0, output: "" }),
    };
    const host = workspaceHost({ ...h.seams, node, homePath: "/private/home" });
    expect(await host.openHome?.()).toMatchObject({ ok: false, failure: { kind: "unresolved" } });
    expect(h.processes).toEqual([]);
  });

  it("renews the home's own lease and releases it without stopping shared work", async () => {
    const shared = { url: "http://127.0.0.1:53111", token: "shared" };
    const h = harness({ ticket: shared });
    const calls: string[] = [];
    let beat: () => Promise<void> = async () => {};
    const node: NodeServing = {
      required: true,
      serves: async () => true,
      add: async (path, home) => {
        calls.push(`attach ${path} ${home}`);
        return { code: 0, output: "" };
      },
      renew: async (path, home) => {
        calls.push(`renew ${path} ${home}`);
        return { code: 0, output: "" };
      },
      remove: async (path) => {
        calls.push(`detach ${path}`);
        return { code: 0, output: "" };
      },
    };
    const host = workspaceHost({
      ...h.seams,
      node,
      homePath: "/private/home",
      clock: {
        every: (_ms, tick) => {
          beat = tick;
          return () => {};
        },
        wait: async () => {},
      },
    });
    expect(await host.openHome?.()).toMatchObject({ ok: true, opened: { servedByNode: true } });
    await beat();
    await beat();
    await beat();
    expect(calls).toEqual(["attach /private/home true", "renew /private/home true"]);
    expect(await host.stopServing("/private/home")).toMatchObject({ ok: false });
    expect(calls).toHaveLength(2);
    await host.closeAll();
    expect(calls.at(-1)).toBe("detach /private/home");
    expect(h.processes).toEqual([]);
    expect(await host.recent()).toEqual([]);
  });

  it("shares an in-flight open within one host instead of starting competing engines", async () => {
    const h = harness({});
    const host = workspaceHost(h.seams);
    const results = await Promise.all([host.open("/work"), host.open("/work")]);
    expect(results[0]).toEqual(results[1]);
    expect(h.processes).toHaveLength(1);
    await host.closeAll();
  });

  it("keeps renewing and releasing the managed lease after reconnecting to its ticket", async () => {
    const shared = { url: "http://127.0.0.1:53112", token: "shared" };
    const answers: Record<string, Answer> = {};
    const h = harness({ ticket: shared, answers });
    const calls: string[] = [];
    let beat: () => Promise<void> = async () => {};
    const node: NodeServing = {
      required: true,
      serves: async () => true,
      add: async () => {
        calls.push("attach");
        return { code: 0, output: "" };
      },
      renew: async () => {
        calls.push("renew");
        return { code: 0, output: "" };
      },
      remove: async () => {
        calls.push("detach");
        return { code: 0, output: "" };
      },
    };
    const host = workspaceHost({
      ...h.seams,
      node,
      clock: {
        every: (_ms, tick) => {
          beat = tick;
          return () => {};
        },
        wait: async () => {
          answers[shared.url] = "ok";
        },
      },
    });
    await host.open("/work");
    answers[shared.url] = "dead";
    expect(await host.open("/work")).toMatchObject({
      ok: true,
      opened: { servedByNode: true },
    });
    expect(host.servingOf("/work")).toBe("node");
    await beat();
    await beat();
    await beat();
    await host.closeAll();
    expect(calls).toEqual(["attach", "renew", "detach"]);
    expect(h.processes).toEqual([]);
  });

  it("presents structured admission failures without launching another engine", async () => {
    const h = harness({});
    const node: NodeServing = {
      required: true,
      serves: async () => true,
      add: async () => ({
        code: 3,
        output: JSON.stringify({
          message: "The shared contract differs.",
          recovery: "update-products",
        }),
      }),
      remove: async () => ({ code: 0, output: "" }),
    };
    const host = workspaceHost({ ...h.seams, node });
    expect(await host.open("/work")).toEqual({
      ok: false,
      failure: {
        kind: "unresolved",
        message: "The shared contract differs.",
        nextAction:
          "Update the app that does not support the shared engine's contract. Incompatible engine changes require the maintenance steps in the upgrade guide.",
      },
    });
    expect(h.processes).toEqual([]);
  });

  it.each(["close", "closeAll"] as const)(
    "%s waits for a pending shared-runtime attachment and releases its lease",
    async (method) => {
      const shared = { url: "http://127.0.0.1:53113", token: "shared" };
      const h = harness({ ticket: shared });
      let finishAttach: () => void = () => {};
      const attaching = new Promise<void>((resolve) => {
        finishAttach = resolve;
      });
      const calls: string[] = [];
      const node: NodeServing = {
        required: true,
        serves: async () => true,
        add: async () => {
          await attaching;
          calls.push("attach");
          return { code: 0, output: "" };
        },
        remove: async () => {
          calls.push("detach");
          return { code: 0, output: "" };
        },
      };
      const host = workspaceHost({ ...h.seams, node });
      const opened = host.open("/work");
      const closed = method === "close" ? host.close("/work") : host.closeAll();
      finishAttach();
      await Promise.all([opened, closed]);
      expect(host.openRoots()).toEqual([]);
      expect(calls).toEqual(["attach", "detach"]);
      expect(h.processes).toEqual([]);
    },
  );
});
