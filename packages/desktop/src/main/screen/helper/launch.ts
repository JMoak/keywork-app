import { type HelperSpawn, processSpawn } from "./port.ts";

export interface HelperLaunch {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export type HelperLaunchPlan =
  | { readonly ok: true; readonly launch: HelperLaunch }
  | { readonly ok: false; readonly refusal: string };

export interface LaunchingRuntime {
  readonly execPath: string;
  readonly electron: boolean;
}

export function helperLaunch(
  path: string,
  runtime: LaunchingRuntime = currentRuntime(),
): HelperLaunchPlan {
  const extension = extensionOf(path);
  if (batchExtensions.has(extension)) return { ok: false, refusal: batchRefusal(path, extension) };
  if (scriptExtensions.has(extension)) return { ok: true, launch: scriptLaunch(path, runtime) };
  return { ok: true, launch: { command: path, args: [], env: {} } };
}

export function launchSpawn(launch: HelperLaunch): HelperSpawn {
  return processSpawn(launch.command, launch.args, launch.env);
}

export function currentRuntime(): LaunchingRuntime {
  return { execPath: process.execPath, electron: process.versions.electron !== undefined };
}

const scriptExtensions = new Set([".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"]);

const batchExtensions = new Set([".cmd", ".bat"]);

function scriptLaunch(script: string, runtime: LaunchingRuntime): HelperLaunch {
  return {
    command: runtime.execPath,
    args: [script],
    env: runtime.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {},
  };
}

function batchRefusal(path: string, extension: string): string {
  return (
    `the input helper ${path} is a ${extension} launcher, which cannot start without a shell, ` +
    "and the console never starts its helper through one: name the helper executable, or the " +
    "script itself (a .ts or .js file runs on this console's own runtime)"
  );
}

function extensionOf(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}
