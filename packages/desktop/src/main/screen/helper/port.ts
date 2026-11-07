import { spawn } from "node:child_process";
import {
  type HelperGrant,
  type HelperInput,
  type HelperReleased,
  type HelperReply,
  type HelperRequest,
  helperLine,
  helperProtocolVersion,
  lineReader,
  parseHelperReply,
} from "./protocol.ts";

export const helperHelloTimeoutMs = 3000;

export const releaseWaitMs = 80;

export const exitWaitMs = 100;

export interface HelperProcess {
  write(text: string): void;
  end(): void;
  onOutput(listener: (chunk: string) => void): void;
  kill(): void;
  readonly exited: Promise<void>;
}

export type HelperSpawn = () => HelperProcess;

export interface HelperStopped {
  readonly released: HelperReleased | undefined;
  readonly exited: boolean;
  readonly ms: number;
}

export interface HelperPort {
  readonly impl: string;
  grant(grant: HelperGrant): Promise<boolean>;
  input(input: HelperInput): void;
  releaseAll(): Promise<HelperReleased | undefined>;
  stop(): Promise<HelperStopped>;
  onReply(listener: (reply: HelperReply) => void): () => void;
}

export interface HelperClock {
  now(): number;
}

export function processSpawn(
  command: string,
  args: readonly string[] = [],
  env: Readonly<Record<string, string>> = {},
): HelperSpawn {
  return () => {
    const child = spawn(command, [...args], {
      stdio: ["pipe", "pipe", "ignore"],
      env: { ...process.env, ...env },
      windowsHide: true,
    });
    const exited = new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      child.once("exit", () => resolve());
      child.once("error", () => resolve());
    });
    child.stdin.on("error", () => undefined);
    child.stdout.setEncoding("utf8");
    return {
      write: (text) => {
        if (child.stdin.writable) child.stdin.write(text);
      },
      end: () => child.stdin.end(),
      onOutput: (listener) => child.stdout.on("data", (chunk: string) => listener(chunk)),
      kill: () => child.kill("SIGKILL"),
      exited,
    };
  };
}

export async function openHelper(
  spawnHelper: HelperSpawn,
  clock: HelperClock = Date,
): Promise<HelperPort | undefined> {
  const child = spawnHelper();
  const listeners = new Set<(reply: HelperReply) => void>();
  let gone = false;
  void child.exited.then(() => {
    gone = true;
  });
  child.onOutput(
    lineReader((line) => {
      const reply = parseHelperReply(line);
      if (reply !== undefined) for (const listener of [...listeners]) listener(reply);
    }),
  );
  const send = (request: HelperRequest): void => {
    if (!gone) child.write(helperLine(request));
  };
  const awaitReply = <Kind extends HelperReply["kind"]>(
    kind: Kind,
    withinMs: number,
  ): Promise<Extract<HelperReply, { kind: Kind }> | undefined> =>
    new Promise((resolve) => {
      const done = (reply: Extract<HelperReply, { kind: Kind }> | undefined): void => {
        clearTimeout(timer);
        listeners.delete(listener);
        resolve(reply);
      };
      const listener = (reply: HelperReply): void => {
        if (reply.kind === kind) done(reply as Extract<HelperReply, { kind: Kind }>);
      };
      const timer = setTimeout(() => done(undefined), withinMs);
      listeners.add(listener);
      void child.exited.then(() => done(undefined));
    });

  const hello = awaitReply("hello", helperHelloTimeoutMs);
  send({ v: helperProtocolVersion, kind: "hello", versions: [helperProtocolVersion] });
  const greeted = await hello;
  if (greeted === undefined || greeted.version !== helperProtocolVersion) {
    child.kill();
    return undefined;
  }

  const releaseAll = async (): Promise<HelperReleased | undefined> => {
    if (gone) return undefined;
    const released = awaitReply("released", releaseWaitMs);
    send({ v: helperProtocolVersion, kind: "release-all" });
    const reply = await released;
    return reply === undefined ? undefined : { keys: reply.keys, buttons: reply.buttons };
  };

  return {
    impl: greeted.impl,
    grant: async (grant) => {
      const granted = awaitReply("granted", helperHelloTimeoutMs);
      send({ v: helperProtocolVersion, kind: "grant", ...grant });
      return (await granted)?.grantId === grant.grantId;
    },
    input: (input) => send({ v: helperProtocolVersion, ...input }),
    releaseAll,
    stop: async () => {
      const startedAt = clock.now();
      const released = await releaseAll();
      send({ v: helperProtocolVersion, kind: "bye" });
      child.end();
      const exited = await within(child.exited, exitWaitMs);
      if (!exited) {
        child.kill();
        await within(child.exited, exitWaitMs);
      }
      return { released, exited: gone, ms: clock.now() - startedAt };
    },
    onReply: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function within(promise: Promise<void>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    void promise.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}
