import { describe, expect, it } from "vitest";
import { openUrlFor, requestFromArgv, requestFromUrl } from "./deep-link.ts";

describe("requestFromUrl", () => {
  it("opens an absolute encoded path on either platform", () => {
    expect(requestFromUrl("keywork://open?path=C%3A%5Cwork%5Capp")).toEqual({
      ok: true,
      action: "open",
      path: "C:\\work\\app",
    });
    expect(requestFromUrl("keywork://open?path=%2Fhome%2Fme%2Fapp")).toEqual({
      ok: true,
      action: "open",
      path: "/home/me/app",
    });
    expect(requestFromUrl(openUrlFor("C:/work/app"))).toEqual({
      ok: true,
      action: "open",
      path: "C:/work/app",
    });
  });

  it("accepts the slash-rooted spelling some launchers produce", () => {
    expect(requestFromUrl("keywork:///open/?path=%2Fsrc")).toMatchObject({
      ok: true,
      path: "/src",
    });
  });

  it("refuses everything else with a typed reason and never throws", () => {
    expect(requestFromUrl("not a url")).toEqual({
      ok: false,
      reason: "malformed-url",
      input: "not a url",
    });
    expect(requestFromUrl("https://example.com/open?path=%2Fsrc")).toMatchObject({
      reason: "malformed-url",
    });
    expect(requestFromUrl("keywork://delete?path=%2Fsrc")).toMatchObject({
      reason: "unknown-action",
    });
    expect(requestFromUrl("keywork://open")).toMatchObject({ reason: "missing-path" });
    expect(requestFromUrl("keywork://open?path=")).toMatchObject({ reason: "missing-path" });
    expect(requestFromUrl("keywork://open?path=src%2Fapp")).toMatchObject({
      reason: "relative-path",
    });
    expect(requestFromUrl("keywork://open?path=%2Fsrc%2F..%2Fetc")).toMatchObject({
      reason: "unsafe-path",
    });
    expect(requestFromUrl("keywork://open?path=C%3A%5Cwork%00")).toMatchObject({
      reason: "unsafe-path",
    });
    expect(requestFromUrl("")).toMatchObject({ reason: "malformed-url" });
  });
});

describe("requestFromArgv", () => {
  it("skips the executable and flags, taking the first link or folder", () => {
    expect(
      requestFromArgv(["C:\\app\\keywork.exe", "--allow-x", "keywork://open?path=C%3A%5Cw"]),
    ).toMatchObject({ ok: true, path: "C:\\w" });
    expect(requestFromArgv(["/usr/bin/keywork-app", "/home/me/app"])).toMatchObject({
      ok: true,
      path: "/home/me/app",
    });
    expect(requestFromArgv(["electron", ".", "--inspect"])).toBeUndefined();
    expect(requestFromArgv([])).toBeUndefined();
  });

  it("skips the script path too when a dev launcher carries one", () => {
    const script = "C:\\app\\out\\main\\index.js";
    const argv = ["electron.exe", script, "keywork://open?path=%2Fsrc"];
    expect(requestFromArgv(argv, 2)).toMatchObject({ ok: true, path: "/src" });
    expect(requestFromArgv(["electron.exe", script], 2)).toBeUndefined();
    expect(requestFromArgv(["electron.exe", script])).toMatchObject({ ok: true, path: script });
  });

  it("reports a bad link rather than falling through to a later argument", () => {
    expect(requestFromArgv(["app", "keywork://nope", "/home/me/app"])).toMatchObject({
      ok: false,
      reason: "unknown-action",
    });
  });
});
