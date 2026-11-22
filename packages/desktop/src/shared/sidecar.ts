import { join } from "node:path";

export const sidecarDirectory = "sidecar";

export function sidecarBinaryName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "keywork.exe" : "keywork";
}

export function bundledSidecar(resourcesPath: string, platform: NodeJS.Platform): string {
  return join(resourcesPath, sidecarDirectory, sidecarBinaryName(platform));
}

export const moverBinaryName = "kw-panes-mover.exe";

export function bundledMover(resourcesPath: string): string {
  return join(resourcesPath, sidecarDirectory, moverBinaryName);
}

export interface MoverChoice {
  platform: NodeJS.Platform;
  resourcesPath: string;
  // KEYWORK_PANES_MOVER: another mover by its absolute path, or "off" to move panes from JavaScript.
  said: string | undefined;
  exists(path: string): boolean;
}

const moverOffWords: ReadonlySet<string> = new Set(["off", "0", "false", "no", "none"]);

// The mover that ships beside the engine is used when it is there. Without one, panes are moved
// from JavaScript, which is also what every system but Windows does.
export function moverPathFor({
  platform,
  resourcesPath,
  said,
  exists,
}: MoverChoice): string | undefined {
  if (platform !== "win32") return undefined;
  const named = said?.trim() ?? "";
  if (named !== "") return moverOffWords.has(named.toLowerCase()) ? undefined : named;
  const bundled = bundledMover(resourcesPath);
  return exists(bundled) ? bundled : undefined;
}
