import { delimiter, join } from "node:path";
import type { PtyExit, PtyOpened, PtyOpenRequest } from "../shared/channels.ts";
import { treeKillCommand } from "./serve-process.ts";
import { spawnsThroughShell } from "./system.ts";

export interface PtyHost {
  open(request: PtyOpenRequest, owner: number, sink: PtySink): Promise<PtyOpened>;
  write(id: number, data: string): void;
  resize(id: number, cols: number, rows: number): void;
  close(id: number): void;
  closeOwned(owner: number): void;
  closeAll(): void;
}

export interface PtySink {
  data(id: number, bytes: Uint8Array): void;
  exit(exit: PtyExit): void;
}

export interface PtyProcess {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(listener: (data: string) => void): void;
  onExit(listener: (exit: { exitCode: number; signal?: number | undefined }) => void): void;
}

export interface PtyLaunch {
  file: string;
  args: readonly string[];
  cwd: string;
  cols: number;
  rows: number;
  env: Record<string, string>;
}

export interface PtySeams {
  spawn(launch: PtyLaunch): PtyProcess;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  exists(path: string): boolean;
  keyworkBinary(): Promise<string>;
  secretsFor(workspace: string): readonly string[];
  treeKill(pid: number): void;
  schedule?: ((flush: () => void) => void) | undefined;
}

export const batchLimitBytes = 4096;

export function ptyHost(seams: PtySeams): PtyHost {
  const held = new Map<number, { process: PtyProcess; owner: number }>();
  const ids = idMinter();
  return {
    open: async (request, owner, sink) => {
      const id = ids.next();
      const launch = await launchFor(request, seams);
      const process = seams.spawn(launch);
      const batch = chunkBatcher((text) => sink.data(id, encoder.encode(text)), {
        limit: batchLimitBytes,
        schedule: seams.schedule ?? nextTick,
      });
      process.onData(batch.push);
      process.onExit((exit) => {
        batch.flush();
        held.delete(id);
        sink.exit({ id, exitCode: exit.exitCode, signal: exit.signal });
      });
      held.set(id, { process, owner });
      return { id, title: titleOf(launch, request) };
    },
    write: (id, data) => held.get(id)?.process.write(data),
    resize: (id, cols, rows) => {
      if (cols > 0 && rows > 0) held.get(id)?.process.resize(cols, rows);
    },
    close: (id) => {
      const entry = held.get(id);
      if (entry === undefined) return;
      held.delete(id);
      end(entry.process, seams);
    },
    closeOwned: (owner) => {
      for (const [id, entry] of [...held]) {
        if (entry.owner !== owner) continue;
        held.delete(id);
        end(entry.process, seams);
      }
    },
    closeAll: () => {
      for (const entry of held.values()) end(entry.process, seams);
      held.clear();
    },
  };
}

export async function launchFor(request: PtyOpenRequest, seams: PtySeams): Promise<PtyLaunch> {
  const env = scrubEnv(seams.env, seams.secretsFor(request.workspace), seams.platform);
  const program =
    request.program === "keywork"
      ? commandLine(await seams.keyworkBinary(), request.args, seams.platform, env)
      : commandLine(
          defaultShell(seams.platform, env, seams.exists),
          request.args,
          seams.platform,
          env,
        );
  return { ...program, cwd: request.workspace, cols: request.cols, rows: request.rows, env };
}

export function defaultShell(
  platform: NodeJS.Platform,
  env: Record<string, string>,
  exists: (path: string) => boolean,
): string {
  if (platform !== "win32") return env.SHELL ?? "/bin/sh";
  return (
    findOnPath("pwsh.exe", env, exists) ??
    findOnPath("powershell.exe", env, exists) ??
    env.COMSPEC ??
    "cmd.exe"
  );
}

export function findOnPath(
  name: string,
  env: Record<string, string>,
  exists: (path: string) => boolean,
): string | undefined {
  const path = env.PATH ?? env.Path ?? "";
  for (const dir of path.split(delimiter)) {
    if (dir === "") continue;
    const candidate = join(dir, name);
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

export function commandLine(
  binary: string,
  args: readonly string[],
  platform: NodeJS.Platform,
  env: Record<string, string>,
): { file: string; args: readonly string[] } {
  if (!spawnsThroughShell(binary, platform)) return { file: binary, args };
  return { file: env.COMSPEC ?? "cmd.exe", args: ["/d", "/c", binary, ...args] };
}

export function scrubEnv(
  env: NodeJS.ProcessEnv,
  secrets: readonly string[],
  platform: NodeJS.Platform,
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (
      value === undefined ||
      namesASecret(name) ||
      secrets.some((s) => s !== "" && value.includes(s))
    ) {
      continue;
    }
    clean[name] = value;
  }
  clean.TERM_PROGRAM = "keywork-app";
  if (platform !== "win32") {
    clean.TERM = "xterm-256color";
    clean.COLORTERM = "truecolor";
  }
  return clean;
}

export interface ChunkBatcher {
  push(text: string): void;
  flush(): void;
}

export function chunkBatcher(
  emit: (text: string) => void,
  options: { limit: number; schedule: (flush: () => void) => void },
): ChunkBatcher {
  let pending: string[] = [];
  let size = 0;
  let scheduled = false;
  const flush = (): void => {
    scheduled = false;
    if (pending.length === 0) return;
    const text = pending.join("");
    pending = [];
    size = 0;
    emit(text);
  };
  return {
    push: (text) => {
      pending.push(text);
      size += text.length;
      if (size >= options.limit) {
        flush();
        return;
      }
      if (scheduled) return;
      scheduled = true;
      options.schedule(flush);
    },
    flush,
  };
}

export function idMinter(): { next(): number } {
  let last = 0;
  return { next: () => ++last };
}

export function windowsTreeKill(pid: number, run: (command: string, args: string[]) => void): void {
  const kill = treeKillCommand(pid, "win32");
  if (kill !== undefined) run(kill.command, kill.args);
}

const encoder = new TextEncoder();

function namesASecret(name: string): boolean {
  return /^KEYWORK_.*(TOKEN|SECRET)/i.test(name);
}

function titleOf(launch: PtyLaunch, request: PtyOpenRequest): string {
  if (request.program === "keywork") return ["keywork", ...request.args].join(" ");
  const file = launch.file.replace(/\\/g, "/").split("/").at(-1) ?? launch.file;
  return file.replace(/\.exe$/i, "");
}

function end(process: PtyProcess, seams: PtySeams): void {
  process.kill();
  if (seams.platform === "win32") seams.treeKill(process.pid);
}

function nextTick(flush: () => void): void {
  setTimeout(flush, batchFrameMs);
}

const batchFrameMs = 8;
