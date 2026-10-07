import type { SessionProjection, ToolRun } from "@keywork-app/client";
import { voiceGlyph } from "../../page/pane.tsx";

export interface MirrorDelta {
  reset: boolean;
  write: string;
}

export const mirroredTool = "bash";

export function mirrorText(projection: SessionProjection): string {
  const runs = projection.entries.flatMap((entry) =>
    entry.kind === "tool" && entry.run.name === mirroredTool ? [entry.run] : [],
  );
  if (runs.length === 0) return `${dim(`${stamp} no bash calls in this session yet`)}${newline}`;
  return runs.map(mirrorRun).join("");
}

export function mirrorDelta(previous: string, next: string): MirrorDelta {
  if (next.startsWith(previous)) return { reset: false, write: next.slice(previous.length) };
  return { reset: true, write: next };
}

export function mirrorRun(run: ToolRun): string {
  const lines = [
    `${stamp} ${bold(`$ ${bashCommand(run)}`)}`,
    ...(run.detail ?? []),
    ...(run.live === undefined ? [] : [run.live]),
    ...outcomeLine(run),
  ];
  return lines.map((line) => `${line}${newline}`).join("");
}

export function bashCommand(run: ToolRun): string {
  try {
    const parsed: unknown = JSON.parse(run.args);
    if (typeof parsed === "object" && parsed !== null && "command" in parsed) {
      const command = (parsed as { command: unknown }).command;
      if (typeof command === "string") return command;
    }
  } catch {}
  return run.subject;
}

const stamp = voiceGlyph.machine;
const newline = "\r\n";

function outcomeLine(run: ToolRun): string[] {
  switch (run.phase) {
    case "done":
      return [dim(`${stamp} done${duration(run)}${size(run)}`)];
    case "failed":
      return [red(`${stamp} failed${run.reason === undefined ? "" : `: ${run.reason}`}`)];
    case "refused":
      return [dim(`${stamp} refused${run.reason === undefined ? "" : `: ${run.reason}`}`)];
    case "running":
      return [];
    case "asking":
      return [dim(`${stamp} waiting for an answer`)];
    case "proposed":
      return [dim(`${stamp} proposed`)];
  }
}

function duration(run: ToolRun): string {
  return run.durationMs === undefined ? "" : ` · ${run.durationMs} ms`;
}

function size(run: ToolRun): string {
  return run.outputChars === undefined ? "" : ` · ${run.outputChars} chars`;
}

function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

function dim(text: string): string {
  return `\x1b[2m${text}\x1b[22m`;
}

function red(text: string): string {
  return `\x1b[31m${text}\x1b[39m`;
}
