import { spawn as spawnProcess } from "node:child_process";
import { createServer } from "node:net";
import type { ChildHandle, Spawn } from "./serve-process.ts";
import { spawnsThroughShell } from "./system.ts";

export const spawnChild: Spawn = (command, args, cwd) => {
  const child = spawnProcess(command, [...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: spawnsThroughShell(command, process.platform),
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

export async function commandOutput(command: string, args: readonly string[]): Promise<string> {
  const child = spawnChild(command, args, ".");
  let text = "";
  for await (const chunk of child.stdout) text += chunk;
  await child.exited;
  return text;
}

async function* lines(stream: NodeJS.ReadableStream | null): AsyncIterable<string> {
  if (stream === null) return;
  stream.setEncoding("utf8");
  for await (const chunk of stream) yield String(chunk);
}
