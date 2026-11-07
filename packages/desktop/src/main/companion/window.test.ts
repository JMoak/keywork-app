import { keyworkProfile, steadProfile } from "@keywork-app/product";
import { describe, expect, it } from "vitest";
import { fakeWindow } from "./testing.ts";
import {
  chromeMargin,
  companionWindowOptions,
  creatureBox,
  keyboardReachable,
  prepareFloating,
  windowSizeFor,
} from "./window.ts";

describe("windowSizeFor", () => {
  it("is the creature plus at most 24 DIP of margin, the controls strip, and the bubble when needed", () => {
    expect(creatureBox(100)).toEqual({ width: 96, height: 104 });
    expect(chromeMargin).toBe(24);
    expect(windowSizeFor(100, { bubble: false })).toEqual({ width: 144, height: 180 });
    expect(windowSizeFor(100, { bubble: true })).toEqual({ width: 288, height: 236 });
    expect(windowSizeFor(50, { bubble: false })).toEqual({ width: 96, height: 114 });
    expect(windowSizeFor(200, { bubble: false })).toEqual({ width: 240, height: 312 });
  });
});

describe("companionWindowOptions", () => {
  const spec = {
    bounds: { x: 10, y: 20, width: 144, height: 180 },
    preload: "C:/app/preload/companion.js",
  };

  it.each([keyworkProfile, steadProfile])(
    "uses the $name profile and keeps the construction rules",
    (profile) => {
      const options = companionWindowOptions({ ...spec, platform: "linux", profile });
      expect(options).toMatchObject({
        x: 10,
        y: 20,
        width: 144,
        height: 180,
        frame: false,
        transparent: true,
        resizable: false,
        hasShadow: false,
        roundedCorners: false,
        thickFrame: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        show: false,
        acceptFirstMouse: true,
        title: `${profile.name} companion`,
      });
      expect(options.webPreferences).toEqual({
        preload: spec.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        backgroundThrottling: true,
      });
      expect(options.focusable).toBeUndefined();
      expect(options.type).toBeUndefined();
    },
  );

  it("is unfocusable on Windows and a Mission-Control-hidden panel on macOS", () => {
    expect(companionWindowOptions({ ...spec, platform: "win32" })).toMatchObject({
      focusable: false,
    });
    expect(companionWindowOptions({ ...spec, platform: "darwin" })).toMatchObject({
      type: "panel",
      hiddenInMissionControl: true,
    });
    expect(keyboardReachable("win32")).toBe(false);
    expect(keyboardReachable("darwin")).toBe(true);
  });
});

describe("prepareFloating", () => {
  it("floats at the floating level, forwards mouse moves where supported, and joins all Spaces on macOS", () => {
    const windows = fakeWindow({}, 1);
    prepareFloating(windows, "win32");
    expect(windows.calls).toEqual([
      "setAlwaysOnTop:true:floating",
      "setIgnoreMouseEvents:true:forward",
    ]);
    const mac = fakeWindow({}, 2);
    prepareFloating(mac, "darwin");
    expect(mac.calls).toEqual([
      "setAlwaysOnTop:true:floating",
      "setIgnoreMouseEvents:true:forward",
      "setVisibleOnAllWorkspaces:true:true",
    ]);
    const linux = fakeWindow({}, 3);
    prepareFloating(linux, "linux");
    expect(linux.calls).toEqual(["setAlwaysOnTop:true:floating", "setIgnoreMouseEvents:true"]);
  });
});
