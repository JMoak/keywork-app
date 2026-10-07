import { existsSync } from "node:fs";
import { spawn as spawnPty } from "node-pty";
import { spawnChild } from "./child.ts";
import { type PtyLaunch, type PtyProcess, type PtySeams, windowsTreeKill } from "./pty.ts";

export interface NativePtyOptions {
  keyworkBinary(): Promise<string>;
  secretsFor(workspace: string): readonly string[];
}

export function nativePtySeams(options: NativePtyOptions): PtySeams {
  return {
    spawn: spawnNative,
    platform: process.platform,
    env: process.env,
    exists: existsSync,
    keyworkBinary: options.keyworkBinary,
    secretsFor: options.secretsFor,
    treeKill: (pid) => windowsTreeKill(pid, (command, args) => spawnChild(command, args, ".")),
  };
}

function spawnNative(launch: PtyLaunch): PtyProcess {
  const pty = spawnPty(launch.file, [...launch.args], {
    name: "xterm-256color",
    cwd: launch.cwd,
    cols: launch.cols,
    rows: launch.rows,
    env: launch.env,
    useConpty: true,
  });
  return {
    pid: pty.pid,
    write: (data) => pty.write(data),
    resize: (cols, rows) => pty.resize(cols, rows),
    kill: () => pty.kill(),
    onData: (listener) => pty.onData(listener),
    onExit: (listener) => pty.onExit(listener),
  };
}
