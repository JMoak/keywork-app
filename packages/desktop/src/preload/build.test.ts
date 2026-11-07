import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { compileFunction } from "node:vm";
import { resolveConfig } from "electron-vite";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companionGlobal } from "../main/companion/channels.ts";

const desktop = resolve(import.meta.dirname, "../..");
const preloads = ["companion.js", "index.js"];
const nodeEnvironment = process.env.NODE_ENV;
let outDir: string;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), "keywork-preload-"));
  await buildPreloads(outDir);
}, 120_000);

afterAll(async () => {
  process.env.NODE_ENV = nodeEnvironment;
  await rm(outDir, { recursive: true, force: true });
});

describe("the built preloads", () => {
  it("are exactly one file per entry, with no shared chunk beside them", async () => {
    const files = await readdir(join(outDir, "preload"), { recursive: true });
    expect(files.map((file) => file.replaceAll("\\", "/")).sort()).toEqual(preloads);
  });

  it.each(preloads)("%s requires no sibling file", async (name) => {
    expect(await builtPreload(name)).not.toMatch(/require\(\s*["']\.{1,2}[/]/);
  });

  it("expose the host port when loaded the way a sandboxed renderer loads them", async () => {
    expect([...loadSandboxed(await builtPreload("index.js")).keys()]).toEqual(["keyworkHost"]);
  });

  it("expose the companion port the same way", async () => {
    expect([...loadSandboxed(await builtPreload("companion.js")).keys()]).toEqual([
      companionGlobal,
    ]);
  });
});

async function buildPreloads(into: string): Promise<void> {
  const { config } = await resolveConfig(
    { root: desktop, logLevel: "warn", build: { outDir: into } },
    "build",
    "production",
  );
  if (config?.preload === undefined) throw new Error("electron.vite.config.ts has no preload");
  await build(config.preload);
}

function builtPreload(name: string): Promise<string> {
  return readFile(join(outDir, "preload", name), "utf8");
}

const sandboxModules = new Set(["events", "timers", "url"]);
const nodeRequire = createRequire(import.meta.url);

function loadSandboxed(code: string): Map<string, unknown> {
  const exposed = new Map<string, unknown>();
  const electron = {
    contextBridge: { exposeInMainWorld: (name: string, api: unknown) => exposed.set(name, api) },
    ipcRenderer: { on: () => {}, removeListener: () => {}, send: () => {}, invoke: async () => {} },
  };
  const sandboxRequire = (specifier: string): unknown => {
    if (specifier === "electron") return electron;
    if (sandboxModules.has(specifier)) return nodeRequire(specifier);
    throw new Error(`module not found: ${specifier}`);
  };
  const preload = compileFunction(code, ["require", "module", "exports", "process"]);
  const module = { exports: {} };
  preload(sandboxRequire, module, module.exports, { argv: [], env: {} });
  return exposed;
}
