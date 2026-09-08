import { describe, expect, it } from "vitest";
import { bundledBinary, keyworkTicketFile } from "./system.ts";

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
