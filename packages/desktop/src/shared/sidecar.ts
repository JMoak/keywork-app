import { join } from "node:path";

export const sidecarDirectory = "sidecar";

export function sidecarBinaryName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "keywork.exe" : "keywork";
}

export function bundledSidecar(resourcesPath: string, platform: NodeJS.Platform): string {
  return join(resourcesPath, sidecarDirectory, sidecarBinaryName(platform));
}
