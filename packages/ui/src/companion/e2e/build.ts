import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface HarnessBundle {
  main: string;
  preload: string;
  pageUrl: string;
  steadUrl: string;
  electron: string;
}

const uiRoot = resolve(import.meta.dirname, "../../..");
const repoRoot = resolve(uiRoot, "../..");
const desktopRoot = resolve(repoRoot, "packages/desktop");
const outDir = resolve(repoRoot, "artifacts/companion-e2e");

export function buildHarness(): HarnessBundle {
  mkdirSync(outDir, { recursive: true });
  const main = join(outDir, "harness.cjs");
  const preload = join(outDir, "companion-preload.cjs");
  bundleForNode(resolve(desktopRoot, "src/main/companion/e2e/harness.ts"), main);
  bundleForNode(resolve(desktopRoot, "src/preload/companion.ts"), preload);
  bundleForBrowser(resolve(uiRoot, "src/companion/e2e/harness-page.ts"));
  bundleForBrowser(resolve(uiRoot, "src/companion/e2e/stead-page.ts"));
  return {
    main,
    preload,
    pageUrl: page("harness.html", "harness-page.js", "transparent"),
    steadUrl: page("stead.html", "stead-page.js", "Canvas"),
    electron: electronBinary(),
  };
}

export function electronBinary(): string {
  const home = resolve(desktopRoot, "node_modules/electron");
  const pathFile = join(home, "path.txt");
  if (!existsSync(pathFile)) throw new Error(`electron is not installed under ${home}`);
  return join(home, "dist", readFileSync(pathFile, "utf8").trim());
}

function page(name: string, script: string, background: "transparent" | "Canvas"): string {
  const html = join(outDir, name);
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:${background};overflow:hidden}</style></head><body><script src="./${script}"></script></body></html>\n`,
  );
  return pathToFileURL(html).href;
}

function bundleForNode(entry: string, outfile: string): void {
  bun([
    "build",
    entry,
    "--target=node",
    "--format=cjs",
    "--external",
    "electron",
    "--outfile",
    outfile,
  ]);
}

function bundleForBrowser(entry: string): void {
  bun([
    "build",
    entry,
    "--target=browser",
    "--format=iife",
    "--outdir",
    outDir,
    "--entry-naming",
    "[name].[ext]",
    "--asset-naming",
    "[name].[ext]",
  ]);
}

function bun(args: readonly string[]): void {
  const result = spawnSync(process.platform === "win32" ? "bun.exe" : "bun", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`bun ${args.join(" ")} failed:\n${result.stderr}`);
}
