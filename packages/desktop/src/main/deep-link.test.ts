import { steadProfile } from "@keywork-app/product";
import { describe, expect, it } from "vitest";
import {
  launchFrom,
  openUrlFor,
  protocolHandlerFor,
  registerProtocolSwitch,
  requestFromArgv,
  requestFromUrl,
} from "./deep-link.ts";

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
  const electron = "C:\\electron\\electron.exe";
  const script = "C:\\app\\out\\main\\index.js";

  it("opens the folder a packaged launch names", () => {
    expect(requestFromArgv(["C:\\keywork\\keywork.exe", "C:\\work\\app"])).toMatchObject({
      ok: true,
      path: "C:\\work\\app",
    });
    expect(requestFromArgv(["/usr/bin/keywork-app", "/home/me/app"])).toMatchObject({
      ok: true,
      path: "/home/me/app",
    });
    expect(requestFromArgv([])).toBeUndefined();
  });

  it("takes a deep link wherever the switches Chromium inserts put it", () => {
    const argv = ["C:\\keywork\\keywork.exe", "--allow-x", "keywork://open?path=C%3A%5Cw"];
    expect(requestFromArgv(argv)).toMatchObject({ ok: true, path: "C:\\w" });
    const dev = [electron, "--original-process-start-time=1", script, "keywork://open?path=%2Fsrc"];
    expect(requestFromArgv(dev, true)).toMatchObject({ ok: true, path: "/src" });
  });

  it("never opens the dev app's own path as the workspace", () => {
    expect(requestFromArgv([electron, script], true)).toBeUndefined();
    expect(requestFromArgv([electron, ".", "--inspect=9229"], true)).toBeUndefined();
  });

  it("finds the app path after the switches of an instrumented launch", () => {
    const argv = [electron, "--inspect=0", "--remote-debugging-port=0", script, "C:\\some\\dir"];
    expect(requestFromArgv(argv, true)).toMatchObject({ ok: true, path: "C:\\some\\dir" });
  });

  it("reads everything after -- as an operand", () => {
    expect(requestFromArgv([electron, ".", "--", "C:\\work\\app"], true)).toMatchObject({
      ok: true,
      path: "C:\\work\\app",
    });
  });

  it("reports a bad link rather than falling through to a later argument", () => {
    expect(requestFromArgv(["app", "keywork://nope", "/home/me/app"])).toMatchObject({
      ok: false,
      reason: "unknown-action",
    });
  });
});

describe("protocolHandlerFor", () => {
  const electron = "C:\\electron\\electron.exe";

  it("registers the packaged executable itself", () => {
    expect(protocolHandlerFor(launchFrom(["C:\\keywork\\keywork.exe"], false))).toEqual({
      kind: "this-executable",
    });
  });

  it("never lets an unpackaged launch claim the handler by itself", () => {
    expect(protocolHandlerFor(launchFrom([electron, "."], true))).toEqual({ kind: "untouched" });
    expect(protocolHandlerFor(launchFrom([electron, ".", "--", "C:\\work"], true))).toEqual({
      kind: "untouched",
    });
  });

  it(`registers an unpackaged launch with its app path only when --${registerProtocolSwitch} asks`, () => {
    const asking = `--${registerProtocolSwitch}`;
    expect(protocolHandlerFor(launchFrom([electron, ".", asking], true))).toEqual({
      kind: "dev-app",
      appPath: ".",
    });
    expect(
      protocolHandlerFor(
        launchFrom([electron, asking, "--inspect=9229", "out/main/index.js"], true),
      ),
    ).toEqual({ kind: "dev-app", appPath: "out/main/index.js" });
    expect(protocolHandlerFor(launchFrom([electron, asking], true))).toEqual({ kind: "untouched" });
    expect(protocolHandlerFor(launchFrom(["keywork.exe", "--updated", asking], false))).toEqual({
      kind: "this-executable",
    });
  });

  it("leaves the machine's handler alone under a launch carrying switches", () => {
    const playwright = [electron, "--inspect=0", "--remote-debugging-port=0", "out/main/index.js"];
    expect(protocolHandlerFor(launchFrom(playwright, true))).toEqual({ kind: "untouched" });
    expect(protocolHandlerFor(launchFrom([electron, ".", "--inspect=9229"], true))).toEqual({
      kind: "untouched",
    });
    expect(protocolHandlerFor(launchFrom(["keywork.exe", "--updated"], false))).toEqual({
      kind: "untouched",
    });
  });

  it("leaves it alone when a dev launch names no app", () => {
    expect(protocolHandlerFor(launchFrom([electron], true))).toEqual({ kind: "untouched" });
  });
});

it("uses the selected product URL scheme", () => {
  const path = "C:/work/creature";
  const url = openUrlFor(path, steadProfile);
  expect(url).toBe("stead://open?path=C%3A%2Fwork%2Fcreature");
  expect(requestFromUrl(url, steadProfile)).toEqual({ ok: true, action: "open", path });
  expect(requestFromUrl(url)).toMatchObject({ ok: false, reason: "malformed-url" });
  expect(requestFromArgv(["stead.exe", url], false, steadProfile)).toMatchObject({
    ok: true,
    path,
  });
});
