import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function prebuildDir(
  desktop: string,
  platform: string = process.platform,
  arch: string = process.arch,
): string {
  return join(desktop, "node_modules", "node-pty", "prebuilds", `${platform}-${arch}`);
}

export function packArgs(args: readonly string[], prebuilt: boolean): string[] {
  const configured = args.some((arg) => arg === "-c" || arg.startsWith("--config"));
  const rebuild = prebuilt && !configured ? ["--config.npmRebuild=false"] : [];
  return ["--publish", "never", ...rebuild, ...args];
}

export function packLine(prebuilt: boolean, platform: string, arch: string): string {
  return prebuilt
    ? `pack: node-pty ships a prebuild for ${platform}-${arch}, so electron-builder leaves it as installed`
    : `pack: node-pty ships no prebuild for ${platform}-${arch}, so electron-builder rebuilds it`;
}

if (import.meta.main) {
  const desktop = join(import.meta.dirname, "..", "packages", "desktop");
  const prebuilt = existsSync(prebuildDir(desktop));
  console.log(packLine(prebuilt, process.platform, process.arch));
  const ran = spawnSync(
    "bun",
    ["x", "electron-builder", ...packArgs(process.argv.slice(2), prebuilt)],
    { cwd: desktop, stdio: "inherit", shell: process.platform === "win32" },
  );
  process.exit(ran.status ?? 1);
}
