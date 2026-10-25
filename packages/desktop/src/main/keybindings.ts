import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { KeybindingsReading } from "../shared/channels.ts";

export interface KeybindingFiles {
  readonly userDir: string;
  readonly projectDir: string | undefined;
}

export interface KeybindingSeams {
  readText(path: string): Promise<string | undefined>;
  watchDirectory(dir: string, onChange: (fileName: string | undefined) => void): () => void;
  schedule(run: () => void, delayMs: number): () => void;
}

export const configFileName = "keywork.json";
export const keybindingQuietMs = 150;

export function keybindingFilesFor(workspace: string | undefined): KeybindingFiles {
  return {
    userDir: join(homedir(), ".keywork"),
    projectDir: workspace === undefined ? undefined : join(workspace, ".keywork"),
  };
}

export function followKeybindingFiles(
  files: KeybindingFiles,
  seams: KeybindingSeams,
  deliver: (reading: KeybindingsReading) => void,
): () => void {
  let following = true;
  let cancelPending = (): void => {};
  const read = (): void => {
    void readKeybindings(files, seams).then((reading) => {
      if (following) deliver(reading);
    });
  };
  const settle = (): void => {
    cancelPending();
    cancelPending = seams.schedule(read, keybindingQuietMs);
  };
  const stops = layersOf(files).map((layer) =>
    seams.watchDirectory(layer.dir, (fileName) => {
      if (fileName === undefined || fileName === configFileName) settle();
    }),
  );
  read();
  return () => {
    following = false;
    cancelPending();
    for (const stop of stops) stop();
  };
}

export async function readKeybindings(
  files: KeybindingFiles,
  seams: Pick<KeybindingSeams, "readText">,
): Promise<KeybindingsReading> {
  const layers: { file: string; keybindings: unknown }[] = [];
  for (const layer of layersOf(files)) {
    let raw: string | undefined;
    try {
      raw = await seams.readText(join(layer.dir, configFileName));
    } catch (cause) {
      return {
        kind: "unreadable",
        problem: `${layer.label} could not be read · ${messageOf(cause)}`,
      };
    }
    if (raw === undefined) continue;
    const parsed = keybindingsIn(raw, layer.label);
    if ("problem" in parsed) return { kind: "unreadable", problem: parsed.problem };
    layers.push({ file: layer.label, keybindings: parsed.keybindings });
  }
  return { kind: "read", layers };
}

export function jsonProblem(raw: string, cause: unknown, label: string): string {
  const position = /position (\d+)/.exec(messageOf(cause))?.[1];
  if (position === undefined) return `${label} is not valid JSON`;
  const before = raw.slice(0, Number(position));
  const line = before.split("\n").length;
  const column = before.length - before.lastIndexOf("\n");
  return `${label}:${line}:${column} is not valid JSON`;
}

export const keybindingFileSeams: KeybindingSeams = {
  readText: async (path) => {
    try {
      return await readFile(path, "utf8");
    } catch (cause) {
      if (isMissing(cause)) return undefined;
      throw cause;
    }
  },
  watchDirectory: (dir, onChange) => {
    try {
      const watcher = watch(dir, (_event, fileName) => onChange(fileName ?? undefined));
      watcher.on("error", () => watcher.close());
      return () => watcher.close();
    } catch {
      return () => {};
    }
  },
  schedule: (run, delayMs) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
};

interface Layer {
  readonly dir: string;
  readonly label: string;
}

function layersOf(files: KeybindingFiles): Layer[] {
  const user = { dir: files.userDir, label: `~/.keywork/${configFileName}` };
  return files.projectDir === undefined
    ? [user]
    : [user, { dir: files.projectDir, label: `.keywork/${configFileName}` }];
}

function keybindingsIn(raw: string, label: string): { keybindings: unknown } | { problem: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (cause) {
    return { problem: jsonProblem(raw, cause, label) };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { problem: `${label} is not a JSON object` };
  }
  return { keybindings: (data as Record<string, unknown>).keybindings };
}

function isMissing(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT";
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
