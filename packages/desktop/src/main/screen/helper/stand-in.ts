import { rmSync } from "node:fs";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { type HelperSpawn, processSpawn } from "./port.ts";
import {
  type HelperButton,
  type HelperGrant,
  type HelperReply,
  type HelperRequest,
  helperLine,
  helperProtocolVersion,
  lineReader,
  parseHelperRequest,
} from "./protocol.ts";

export const standInImpl = "stand-in";

export const standInScript = fileURLToPath(import.meta.url);

export const localInputSignal = "local-input";

export const standInEnvironment = z.object({
  KEYWORK_STAND_IN_PIPE: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,48}$/)
    .optional()
    .describe(
      "Names the control pipe the stand-in input helper listens on while it runs. A line " +
        "`local-input` on it makes the stand-in report physical input, as the native helper " +
        "does when the keeper touches this machine, so a driver can exercise local-input " +
        "preemption without the native helper. Unset, the stand-in never reports local input.",
    ),
});

export function standInSpawn(pipe?: string): HelperSpawn {
  return processSpawn(
    process.execPath,
    [standInScript],
    pipe === undefined ? {} : { KEYWORK_STAND_IN_PIPE: pipe },
  );
}

export function signalPipePath(pipe: string, platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? `\\\\.\\pipe\\${pipe}` : join(tmpdir(), `${pipe}.sock`);
}

export function sendLocalInput(pipe: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect(signalPipePath(pipe));
    socket.once("error", reject);
    socket.end(`${localInputSignal}\n`, () => resolve());
  });
}

export interface StandInIo {
  write(line: string): void;
  exit(code: number): void;
  now(): number;
  later(run: () => void, ms: number): () => void;
}

export interface StandIn {
  receive(line: string): void;
  localInput(): void;
  closed(): void;
}

export function standIn(io: StandInIo): StandIn {
  const keys = new Set<string>();
  const buttons = new Set<HelperButton>();
  let greeted = false;
  let grant: HelperGrant | undefined;
  let cancelExpiry = (): void => {};
  let finished = false;

  const reply = (message: HelperReply): void => io.write(helperLine(message));

  const releaseAll = (): void => {
    reply({
      v: helperProtocolVersion,
      kind: "released",
      keys: [...keys].sort(),
      buttons: [...buttons].sort(),
    });
    keys.clear();
    buttons.clear();
  };

  const finish = (code: number): void => {
    if (finished) return;
    finished = true;
    cancelExpiry();
    releaseAll();
    reply({ v: helperProtocolVersion, kind: "bye" });
    io.exit(code);
  };

  const refusalOf = (request: Extract<HelperRequest, { kind: "ptr" | "key" }>) => {
    if (grant === undefined) return "no-grant" as const;
    if (request.grantId !== grant.grantId) return "wrong-grant" as const;
    if (io.now() >= grant.expiresAt) return "expired" as const;
    return undefined;
  };

  const apply = (request: Extract<HelperRequest, { kind: "ptr" | "key" }>): void => {
    if (request.kind === "key") {
      if (request.down) keys.add(request.code);
      else keys.delete(request.code);
    } else if (request.button !== undefined && request.action !== "move") {
      if (request.action === "down") buttons.add(request.button);
      if (request.action === "up") buttons.delete(request.button);
    }
    reply({ v: helperProtocolVersion, kind: "applied", seq: request.seq });
  };

  const greet = (versions: readonly number[]): void => {
    if (!versions.includes(helperProtocolVersion)) {
      reply({ v: helperProtocolVersion, kind: "refused", reason: "version" });
      finish(2);
      return;
    }
    greeted = true;
    reply({
      v: helperProtocolVersion,
      kind: "hello",
      version: helperProtocolVersion,
      impl: standInImpl,
    });
  };

  const hold = (next: HelperGrant): void => {
    cancelExpiry();
    grant = next;
    cancelExpiry = io.later(() => finish(0), Math.max(0, next.expiresAt - io.now()));
    reply({
      v: helperProtocolVersion,
      kind: "granted",
      grantId: next.grantId,
      expiresAt: next.expiresAt,
    });
  };

  const inject = (request: Extract<HelperRequest, { kind: "ptr" | "key" }>): void => {
    const refused = refusalOf(request);
    if (refused === undefined) apply(request);
    else reply({ v: helperProtocolVersion, kind: "refused", seq: request.seq, reason: refused });
  };

  const handle = (request: HelperRequest): void => {
    if (request.kind === "hello") greet(request.versions);
    else if (request.kind === "grant")
      hold({ grantId: request.grantId, expiresAt: request.expiresAt, display: request.display });
    else if (request.kind === "ptr" || request.kind === "key") inject(request);
    else if (request.kind === "release-all") releaseAll();
    else finish(0);
  };

  return {
    receive: (line) => {
      if (finished) return;
      const request = parseHelperRequest(line);
      if (request === undefined) {
        reply({ v: helperProtocolVersion, kind: "refused", reason: "malformed" });
        return;
      }
      if (!greeted && request.kind !== "hello") {
        reply({ v: helperProtocolVersion, kind: "refused", reason: "version" });
        return;
      }
      handle(request);
    },
    localInput: () => {
      if (!finished && grant !== undefined)
        reply({ v: helperProtocolVersion, kind: "local-input" });
    },
    closed: () => finish(0),
  };
}

function runStandIn(pipe: string | undefined): void {
  let stopListening = (): void => {};
  const helper = standIn({
    write: (line) => process.stdout.write(line),
    exit: (code) => {
      stopListening();
      process.exitCode = code;
      process.stdout.end(() => process.exit(code));
    },
    now: Date.now,
    later: (run, ms) => {
      const timer = setTimeout(run, ms);
      return () => clearTimeout(timer);
    },
  });
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", lineReader(helper.receive));
  process.stdin.on("end", helper.closed);
  if (pipe !== undefined) stopListening = listenForLocalInput(signalPipePath(pipe), helper);
}

function listenForLocalInput(path: string, helper: StandIn): () => void {
  if (process.platform !== "win32") rmSync(path, { force: true });
  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    socket.on("error", () => undefined);
    socket.on(
      "data",
      lineReader((line) => {
        if (line === localInputSignal) helper.localInput();
      }),
    );
  });
  server.on("error", () => undefined);
  server.listen(path);
  return () => server.close();
}

async function signalFromCommandLine(pipe: string | undefined): Promise<void> {
  if (pipe === undefined) {
    process.stderr.write(
      "set KEYWORK_STAND_IN_PIPE to the pipe the console's stand-in listens on\n",
    );
    process.exitCode = 2;
    return;
  }
  try {
    await sendLocalInput(pipe);
  } catch (error) {
    process.stderr.write(`no stand-in listens on ${signalPipePath(pipe)}: ${String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { KEYWORK_STAND_IN_PIPE: pipe } = standInEnvironment.parse(process.env);
  if (process.argv[2] === localInputSignal) void signalFromCommandLine(pipe);
  else runStandIn(pipe);
}
