import { spawn as spawnProcess } from "node:child_process";
import { createServer } from "node:net";
import type { ChildHandle, Spawn } from "./serve-process.ts";
import { spawnsThroughShell } from "./system.ts";

export interface ChildLaunch {
  file: string;
  args: readonly string[];
  verbatim: boolean;
}

export const spawnChild: Spawn = (command, args, cwd) => {
  const launch = childLaunch(command, args, process.platform, process.env.ComSpec);
  const child = spawnProcess(launch.file, [...launch.args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    windowsVerbatimArguments: launch.verbatim,
  });
  const exited = new Promise<number | null>((resolve) => {
    child.once("exit", (code) => resolve(code));
    child.once("error", () => resolve(null));
  });
  const handle: ChildHandle = {
    pid: child.pid ?? -1,
    stdout: lines(child.stdout),
    stderr: lines(child.stderr),
    exited,
    signal: (name) => {
      child.kill(name);
    },
  };
  return handle;
};

export function childLaunch(
  command: string,
  args: readonly string[],
  platform: NodeJS.Platform,
  comspec = "cmd.exe",
): ChildLaunch {
  if (!spawnsThroughShell(command, platform)) return { file: command, args, verbatim: false };
  const line = [caretEscaped(command), ...args.map(batchArgument)].join(" ");
  return { file: comspec, args: ["/d", "/s", "/c", `"${line}"`], verbatim: true };
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : undefined;
      probe.close(() => (port === undefined ? reject(new Error("no free port")) : resolve(port)));
    });
  });
}

export const commandPatienceMs = 5000;

export async function commandOutput(
  command: string,
  args: readonly string[],
  patienceMs = commandPatienceMs,
): Promise<string> {
  const child = spawnChild(command, args, ".");
  let text = "";
  const read = (async () => {
    for await (const chunk of child.stdout) text += chunk;
    await child.exited;
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const gaveUp = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      child.signal("SIGKILL");
      resolve();
    }, patienceMs);
  });
  await Promise.race([read, gaveUp]);
  clearTimeout(timer);
  return text;
}

// cmd.exe reads the line once to start the batch file and again when the batch expands %*, so
// an argument is quoted the way the final program splits arguments, then caret-escaped twice.
function batchArgument(arg: string): string {
  return caretEscaped(caretEscaped(argvQuoted(arg)));
}

function argvQuoted(arg: string): string {
  const escaped = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1");
  return `"${escaped}"`;
}

function caretEscaped(text: string): string {
  return text.replace(/[()[\]%!^"`<>&|;, *?]/g, "^$&");
}

async function* lines(stream: NodeJS.ReadableStream | null): AsyncIterable<string> {
  if (stream === null) return;
  stream.setEncoding("utf8");
  for await (const chunk of stream) yield String(chunk);
}
