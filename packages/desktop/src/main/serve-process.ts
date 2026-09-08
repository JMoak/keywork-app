import {
  type KeyworkClient,
  keyworkClient,
  parseServeLine,
  reconnectDelayMs,
  type ServeLine,
  type ServerDocument,
  type ServerTicket,
  serveTicket,
} from "@keywork-app/client";

export const expectedServerVersion = "0.0.1";

export interface ChildHandle {
  readonly pid: number;
  readonly stdout: AsyncIterable<string>;
  readonly stderr: AsyncIterable<string>;
  readonly exited: Promise<number | null>;
  signal(name: "SIGTERM" | "SIGKILL"): void;
}

export type Spawn = (command: string, args: readonly string[], cwd: string) => ChildHandle;

export type Delay = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface SupervisorSeams {
  spawn: Spawn;
  delay: Delay;
  freePort(): Promise<number>;
  fetchDocument(ticket: ServerTicket): Promise<ServerDocument>;
  platform: NodeJS.Platform;
}

export interface ServeSpec {
  binary: string;
  cwd: string;
  args?: readonly string[] | undefined;
}

export type ServeFailure =
  | { kind: "usage"; detail: string }
  | { kind: "unresolved"; message: string; nextAction: string }
  | { kind: "port-in-use"; port: number; detail: string }
  | { kind: "failed"; exitCode: number | null; detail: string }
  | { kind: "unreachable"; ticket: ServerTicket; detail: string }
  | { kind: "version-mismatch"; expected: string; actual: string; ticket: ServerTicket }
  | { kind: "no-ticket"; detail: string };

export type ServeStart =
  | { ok: true; ticket: ServerTicket; version: string; pid: number }
  | { ok: false; failure: ServeFailure };

export type ServeState =
  | { kind: "starting"; attempt: number }
  | { kind: "ready"; ticket: ServerTicket; version: string; pid: number }
  | { kind: "failed"; failure: ServeFailure }
  | { kind: "stopped" };

export interface ServerProcess {
  start(): Promise<ServeStart>;
  stop(): Promise<void>;
  watch(listener: (state: ServeState) => void): () => void;
  readonly state: ServeState;
}

export const killGraceMs = 2000;

export function superviseServer(spec: ServeSpec, seams: SupervisorSeams): ServerProcess {
  const listeners = new Set<(state: ServeState) => void>();
  let state: ServeState = { kind: "stopped" };
  let child: ChildHandle | undefined;
  let stopping = false;
  let restarts = 0;

  const enter = (next: ServeState): void => {
    state = next;
    for (const listener of [...listeners]) listener(next);
  };

  const launch = async (attempt: number): Promise<ServeStart> => {
    enter({ kind: "starting", attempt });
    const port = await seams.freePort();
    const running = seams.spawn(
      spec.binary,
      ["serve", "--port", String(port), ...(spec.args ?? [])],
      spec.cwd,
    );
    child = running;
    const stderr = collect(running.stderr);
    const outcome = await Promise.race([
      awaitTicket(running.stdout),
      running.exited.then(async (code) => exitFailure(code, await stderr, port)),
    ]);
    if (!outcome.ok) {
      enter({ kind: "failed", failure: outcome.failure });
      return outcome;
    }
    const checked = await healthCheck(outcome.ticket, seams.fetchDocument);
    if (!checked.ok) {
      await terminate(running, seams);
      enter({ kind: "failed", failure: checked.failure });
      return checked;
    }
    const ready = {
      ok: true as const,
      ticket: outcome.ticket,
      version: checked.version,
      pid: running.pid,
    };
    enter({ kind: "ready", ...ready });
    running.exited.then((code) => onExit(running, code, stderr));
    return ready;
  };

  const onExit = async (
    exited: ChildHandle,
    code: number | null,
    stderr: Promise<string>,
  ): Promise<void> => {
    if (stopping || child !== exited) return;
    restarts += 1;
    enter({ kind: "failed", failure: exitFailureOf(code, await stderr, undefined) });
    await seams.delay(reconnectDelayMs(restarts - 1));
    if (!stopping) await launch(restarts);
  };

  return {
    get state() {
      return state;
    },
    start: () => {
      stopping = false;
      restarts = 0;
      return launch(0);
    },
    stop: async () => {
      stopping = true;
      const running = child;
      child = undefined;
      if (running !== undefined) await terminate(running, seams);
      enter({ kind: "stopped" });
    },
    watch: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function healthCheckClient(ticket: ServerTicket): KeyworkClient {
  return keyworkClient(ticket);
}

export async function healthCheck(
  ticket: ServerTicket,
  fetchDocument: (ticket: ServerTicket) => Promise<ServerDocument>,
): Promise<{ ok: true; version: string } | { ok: false; failure: ServeFailure }> {
  let document: ServerDocument;
  try {
    document = await fetchDocument(ticket);
  } catch (cause) {
    return { ok: false, failure: { kind: "unreachable", ticket, detail: messageOf(cause) } };
  }
  if (document.version !== expectedServerVersion) {
    return {
      ok: false,
      failure: {
        kind: "version-mismatch",
        expected: expectedServerVersion,
        actual: document.version,
        ticket,
      },
    };
  }
  return { ok: true, version: document.version };
}

export function exitFailureOf(
  code: number | null,
  stderr: string,
  port: number | undefined,
): ServeFailure {
  const detail = stderr.trim();
  if (code === 0 || (code === null && detail === "")) {
    return { kind: "no-ticket", detail: "keywork serve exited before announcing its address" };
  }
  if (code === 2) return { kind: "usage", detail };
  if (code === 3) return unresolvedFailure(detail);
  if (port !== undefined && /EADDRINUSE|address already in use/i.test(detail)) {
    return { kind: "port-in-use", port, detail };
  }
  return { kind: "failed", exitCode: code, detail };
}

export function unresolvedFailure(stderr: string): ServeFailure {
  const [firstLine = ""] = stderr.split("\n");
  const separator = firstLine.lastIndexOf(" · ");
  if (separator === -1) return { kind: "unresolved", message: firstLine, nextAction: "" };
  return {
    kind: "unresolved",
    message: firstLine.slice(0, separator),
    nextAction: firstLine.slice(separator + 3),
  };
}

export function treeKillCommand(
  pid: number,
  platform: NodeJS.Platform,
): { command: string; args: string[] } | undefined {
  return platform === "win32"
    ? { command: "taskkill", args: ["/pid", String(pid), "/T", "/F"] }
    : undefined;
}

async function terminate(child: ChildHandle, seams: SupervisorSeams): Promise<void> {
  const kill = treeKillCommand(child.pid, seams.platform);
  if (kill !== undefined) {
    await seams.spawn(kill.command, kill.args, ".").exited;
    await child.exited;
    return;
  }
  child.signal("SIGTERM");
  const grace = new AbortController();
  const outcome = await Promise.race([
    child.exited.then(() => "exited" as const),
    seams.delay(killGraceMs, grace.signal).then(() => "timeout" as const),
  ]);
  grace.abort();
  if (outcome === "timeout") {
    child.signal("SIGKILL");
    await child.exited;
  }
}

async function awaitTicket(stdout: AsyncIterable<string>): Promise<ServeStart> {
  const lines: ServeLine[] = [];
  for await (const chunk of stdout) {
    for (const line of chunk.split("\n")) {
      if (line.trim() === "") continue;
      lines.push(parseServeLine(line));
      const ticket = serveTicket(lines);
      if (ticket !== undefined) return { ok: true, ticket, version: "", pid: 0 };
    }
  }
  return new Promise<ServeStart>(() => undefined);
}

function exitFailure(code: number | null, stderr: string, port: number): ServeStart {
  return { ok: false, failure: exitFailureOf(code, stderr, port) };
}

async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of chunks) text += chunk;
  return text;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
