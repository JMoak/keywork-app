import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundledMover, moverPathFor } from "./sidecar.ts";

const resourcesPath = join("C:", "app", "resources");
const bundled = bundledMover(resourcesPath);

function chosen(said: string | undefined, present = true, platform: NodeJS.Platform = "win32") {
  return moverPathFor({
    platform,
    resourcesPath,
    said,
    exists: (path) => present && path === bundled,
  });
}

describe("the pane mover the app starts", () => {
  it("is the one that ships beside the engine, when it is there", () => {
    expect(bundled).toBe(join(resourcesPath, "sidecar", "kw-panes-mover.exe"));
    expect(chosen(undefined)).toBe(bundled);
    expect(chosen("  ")).toBe(bundled);
    expect(chosen(undefined, false)).toBeUndefined();
  });

  it("is another one when KEYWORK_PANES_MOVER names it, and none when that says off", () => {
    expect(chosen("D:\\tools\\kw-panes-mover.exe")).toBe("D:\\tools\\kw-panes-mover.exe");
    for (const off of ["off", "OFF", "0", "false", "none"]) expect(chosen(off)).toBeUndefined();
  });

  it("is never started anywhere but Windows", () => {
    expect(chosen(undefined, true, "linux")).toBeUndefined();
    expect(chosen("/usr/bin/kw-panes-mover", true, "darwin")).toBeUndefined();
  });
});
