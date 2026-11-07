import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appRepoRoot,
  bundledBinary,
  keyworkTickets,
  launchableOf,
  siblingCheckout,
  siblingKeyworkRepo,
  spawnsThroughShell,
} from "./system.ts";

describe("system paths", () => {
  it("finds keywork's tickets for a workspace under the home directory, its own first", async () => {
    const located = await keyworkTickets(process.cwd());
    expect(located.identity).toMatch(/^[0-9a-f]{12}$/);
    expect(located.files).toEqual([
      join(homedir(), ".keywork", "workspaces", located.identity, "server.json"),
      join(homedir(), ".keywork", "server.json"),
    ]);
  });

  it("names the bundled sidecar per platform", () => {
    expect(bundledBinary("/app/resources", "win32").split(/[\\/]/).slice(-2)).toEqual([
      "sidecar",
      "keywork.exe",
    ]);
    expect(bundledBinary("/app/resources", "linux").split(/[\\/]/).slice(-2)).toEqual([
      "sidecar",
      "keywork",
    ]);
  });
});

describe("the sibling checkout", () => {
  const desktop = resolve("/src/stead/repos/keywork-app/packages/desktop");
  const repoRoot = resolve("/src/stead/repos/keywork-app");

  it("sits beside the app repo as ../keywork unless KEYWORK_REPO says otherwise, as check:contract finds it", () => {
    expect(appRepoRoot(desktop)).toBe(repoRoot);
    expect(siblingKeyworkRepo(repoRoot, {})).toBe(resolve("/src/stead/repos/keywork"));
    expect(siblingKeyworkRepo(repoRoot, { KEYWORK_REPO: "/elsewhere/keywork" })).toBe(
      resolve("/elsewhere/keywork"),
    );
  });

  it("counts only when its CLI entry is on disk", async () => {
    const root = resolve("/src/stead/repos/keywork");
    const cli = join(root, "packages/cli/src/main.ts");
    expect(await siblingCheckout(root, async (path) => path === cli)).toEqual({ root, cli });
    expect(await siblingCheckout(root, async () => false)).toBeUndefined();
  });
});

describe("launchableOf", () => {
  const script = String.raw`C:\bin\keywork`;
  const shim = String.raw`C:\bin\keywork.cmd`;
  const exe = String.raw`C:\bin\keywork.exe`;

  it("prefers an exe, then a cmd shim, and skips a bare shell script on Windows", () => {
    expect(launchableOf(`${script}\r\n${shim}\r\n${exe}\r\n`, "win32")).toBe(exe);
    expect(launchableOf(`${script}\r\n${shim}\r\n`, "win32")).toBe(shim);
    expect(launchableOf(`${script}\r\n`, "win32")).toBeUndefined();
  });

  it("takes the first hit elsewhere", () => {
    expect(launchableOf("/usr/local/bin/keywork\n", "linux")).toBe("/usr/local/bin/keywork");
    expect(launchableOf("", "linux")).toBeUndefined();
  });

  it("routes cmd and bat launchers through the shell on Windows only", () => {
    expect(spawnsThroughShell(shim, "win32")).toBe(true);
    expect(spawnsThroughShell(exe, "win32")).toBe(false);
    expect(spawnsThroughShell("/usr/bin/keywork.cmd", "linux")).toBe(false);
  });
});
