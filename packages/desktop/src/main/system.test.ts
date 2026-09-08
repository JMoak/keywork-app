import { describe, expect, it } from "vitest";
import { bundledBinary, keyworkTicketFile, launchableOf, spawnsThroughShell } from "./system.ts";

describe("system paths", () => {
  it("names keywork's ticket file under the home directory", () => {
    expect(keyworkTicketFile("/home/me").split(/[\\/]/).slice(-3)).toEqual([
      "me",
      ".keywork",
      "server.json",
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
