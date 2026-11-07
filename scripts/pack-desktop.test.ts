import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { packArgs, packLine, prebuildDir } from "./pack-desktop.ts";

const desktop = join(import.meta.dirname, "..", "packages", "desktop");

describe("packing the console locally", () => {
  it("skips the node-pty rebuild where the package ships a prebuild, and only there", () => {
    expect(packArgs([], true)).toEqual(["--publish", "never", "--config.npmRebuild=false"]);
    expect(packArgs([], false)).toEqual(["--publish", "never"]);
    expect(packArgs(["--win", "nsis"], true)).toEqual([
      "--publish",
      "never",
      "--config.npmRebuild=false",
      "--win",
      "nsis",
    ]);
  });

  it("defers to a staged config when the release composer passes one", () => {
    expect(packArgs(["--config", "release/windows/electron-builder.json"], true)).toEqual([
      "--publish",
      "never",
      "--config",
      "release/windows/electron-builder.json",
    ]);
  });

  it("looks for the prebuild of this platform and architecture", () => {
    expect(prebuildDir("/repo", "win32", "x64")).toBe(
      join("/repo", "node_modules", "node-pty", "prebuilds", "win32-x64"),
    );
    expect(packLine(true, "win32", "x64")).toContain("ships a prebuild");
    expect(packLine(false, "linux", "x64")).toContain("rebuilds it");
  });

  it.skipIf(!existsSync(join(desktop, "node_modules", "node-pty")))(
    "finds the installed node-pty prebuilds for Windows and macOS, and none for Linux",
    () => {
      expect(existsSync(prebuildDir(desktop, "win32", "x64"))).toBe(true);
      expect(existsSync(prebuildDir(desktop, "darwin", "arm64"))).toBe(true);
      expect(existsSync(prebuildDir(desktop, "linux", "x64"))).toBe(false);
    },
  );
});
