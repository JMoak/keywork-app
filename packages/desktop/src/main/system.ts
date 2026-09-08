import { readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { commandOutput } from "./child.ts";
import type { FileSeams } from "./recents.ts";
import { versionOfLine } from "./workspace.ts";

export function keyworkTicketFile(home: string = homedir()): string {
  return join(home, ".keywork", "server.json");
}

export const fileSeams: FileSeams = {
  readText: async (path) => {
    try {
      return await readFile(path, "utf8");
    } catch {
      return undefined;
    }
  },
  writeText: (path, text) => writeFile(path, text, "utf8"),
  rename,
};

export async function keyworkOnPath(
  platform: NodeJS.Platform = process.platform,
): Promise<string | undefined> {
  const [command, args] = platform === "win32" ? ["where", ["keywork"]] : ["which", ["keywork"]];
  try {
    return launchableOf(await commandOutput(command, args), platform);
  } catch {
    return undefined;
  }
}

export function launchableOf(lookup: string, platform: NodeJS.Platform): string | undefined {
  const candidates = lookup
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (platform !== "win32") return candidates[0];
  const rank = (path: string): number => {
    const lower = path.toLowerCase();
    if (lower.endsWith(".exe")) return 0;
    if (lower.endsWith(".cmd") || lower.endsWith(".bat")) return 1;
    return 2;
  };
  const launchable = candidates.filter((path) => rank(path) < 2);
  return launchable.sort((a, b) => rank(a) - rank(b))[0];
}

export function spawnsThroughShell(command: string, platform: NodeJS.Platform): boolean {
  const lower = command.toLowerCase();
  return platform === "win32" && (lower.endsWith(".cmd") || lower.endsWith(".bat"));
}

export async function keyworkVersion(binary: string): Promise<string | undefined> {
  try {
    return versionOfLine(await commandOutput(binary, ["--version"]));
  } catch {
    return undefined;
  }
}

export function bundledBinary(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return join(resourcesPath, "sidecar", platform === "win32" ? "keywork.exe" : "keywork");
}
