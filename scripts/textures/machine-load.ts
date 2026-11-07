import { execFile } from "node:child_process";
import { cpus } from "node:os";
import { promisify } from "node:util";

export const idleLimits = {
  beforeBusyPercent: 15,
  duringBusyPercent: 25,
} as const;

export interface CpuTimes {
  readonly idle: number;
  readonly total: number;
}

export interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly command: string;
}

export interface MachineLoad {
  readonly beforeBusyPercent: number;
  readonly duringBusyPercent: number;
  readonly others: readonly string[];
}

export interface RecordingDecision {
  readonly idle: boolean;
  readonly write: boolean;
  readonly reason: string;
}

export function loadReasons(load: MachineLoad): string[] {
  return [
    load.beforeBusyPercent > idleLimits.beforeBusyPercent
      ? `the CPU was ${load.beforeBusyPercent}% busy before the probes (idle is at most ${idleLimits.beforeBusyPercent}%)`
      : undefined,
    load.duringBusyPercent > idleLimits.duringBusyPercent
      ? `the CPU was ${load.duringBusyPercent}% busy during the probes, the loopback included (idle is at most ${idleLimits.duringBusyPercent}%)`
      : undefined,
    load.others.length > 0 ? `other load ran beside it: ${load.others.join(", ")}` : undefined,
  ].filter((reason): reason is string => reason !== undefined);
}

export function recordingDecision(load: MachineLoad, forced: boolean): RecordingDecision {
  const reasons = loadReasons(load);
  if (reasons.length === 0) return { idle: true, write: true, reason: "the machine was idle" };
  const busy = reasons.join("; ");
  if (forced) return { idle: false, write: true, reason: `--record, although ${busy}` };
  return { idle: false, write: false, reason: busy };
}

export function cpuTimes(): CpuTimes {
  return cpus().reduce(
    (sum, cpu) => {
      const { idle, user, nice, sys, irq } = cpu.times;
      return { idle: sum.idle + idle, total: sum.total + idle + user + nice + sys + irq };
    },
    { idle: 0, total: 0 },
  );
}

export function busyPercentBetween(from: CpuTimes, to: CpuTimes): number {
  const total = to.total - from.total;
  if (total <= 0) return 0;
  return Math.round((1000 * (total - (to.idle - from.idle))) / total) / 10;
}

export async function busyPercentOver(ms: number): Promise<number> {
  const from = cpuTimes();
  await new Promise((resolve) => setTimeout(resolve, ms));
  return busyPercentBetween(from, cpuTimes());
}

export function otherLoad(rows: readonly ProcessRow[], ours: number): string[] {
  const parents = new Map(rows.map((row) => [row.pid, row.ppid]));
  return rows
    .filter((row) => isLoad(row.command) && !descendsFrom(row.pid, ours, parents))
    .filter((row) => !isLoad(commandOf(rows, parents.get(row.pid))))
    .map((row) => `${loadName(row.command)} (pid ${row.pid})`);
}

export async function processRows(platform = process.platform): Promise<ProcessRow[]> {
  const run = promisify(execFile);
  if (platform === "win32") {
    const { stdout } = await run("powershell.exe", ["-NoProfile", "-Command", windowsListing], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return windowsRows(stdout);
  }
  const { stdout } = await run("ps", ["-A", "-o", "pid=,ppid=,args="], {
    maxBuffer: 16 * 1024 * 1024,
  });
  return posixRows(stdout);
}

export function windowsRows(json: string): ProcessRow[] {
  const parsed: unknown = JSON.parse(json === "" ? "[]" : json);
  const listed = Array.isArray(parsed) ? parsed : [parsed];
  return listed.flatMap((entry): ProcessRow[] => {
    const row = entry as { ProcessId?: unknown; ParentProcessId?: unknown; CommandLine?: unknown };
    if (typeof row.ProcessId !== "number" || typeof row.ParentProcessId !== "number") return [];
    const command = typeof row.CommandLine === "string" ? row.CommandLine : "";
    return [{ pid: row.ProcessId, ppid: row.ParentProcessId, command }];
  });
}

export function posixRows(listing: string): ProcessRow[] {
  return listing.split("\n").flatMap((line): ProcessRow[] => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (match === null) return [];
    return [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] ?? "" }];
  });
}

const windowsListing =
  "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress";

function isLoad(command: string | undefined): boolean {
  return command !== undefined && loadName(command) !== undefined;
}

function loadName(command: string): string | undefined {
  if (/(^|[\\/"\s])electron(\.exe)?["\s]/i.test(`${command} `)) return "electron";
  if (/\bvitest\b/.test(command)) return "vitest";
  if (/\bbun(\.exe)?"?\s+(run\s+)?test\b/.test(command)) return "bun test";
  if (/\bplaywright\b/.test(command)) return "playwright";
  return undefined;
}

function descendsFrom(
  pid: number,
  ancestor: number,
  parents: ReadonlyMap<number, number>,
): boolean {
  const seen = new Set<number>();
  for (let current: number | undefined = pid; current !== undefined; ) {
    if (current === ancestor) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = parents.get(current);
  }
  return false;
}

function commandOf(rows: readonly ProcessRow[], pid: number | undefined): string | undefined {
  return pid === undefined ? undefined : rows.find((row) => row.pid === pid)?.command;
}
