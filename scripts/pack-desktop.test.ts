import { describe, expect, it } from "vitest";
import { packArgs } from "./pack-desktop.ts";

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
});
