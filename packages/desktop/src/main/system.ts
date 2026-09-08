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
    const output = await commandOutput(command, args);
    const first = output.split(/\r?\n/).find((line) => line.trim() !== "");
    return first?.trim();
  } catch {
    return undefined;
  }
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
