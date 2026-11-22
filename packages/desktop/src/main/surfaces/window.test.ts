import type { BaseWindow } from "electron";
import { describe, expect, it } from "vitest";
import { releaseEvents, surfaceMinimumSize, surfaceWindowOptions } from "./window.ts";

const consoleWindow = { id: 7 } as BaseWindow;
const options = surfaceWindowOptions({
  parent: consoleWindow,
  backdrop: "backdrop-token",
  title: "keywork",
});

describe("surfaceWindowOptions", () => {
  it("is a frameless, opaque, hidden window owned by the console that opened it", () => {
    expect(options).toMatchObject({
      parent: consoleWindow,
      frame: false,
      transparent: false,
      show: false,
      modal: false,
      backgroundColor: "backdrop-token",
      title: "keywork",
    });
  });

  it("stays out of the taskbar and can be neither minimised nor made fullscreen", () => {
    expect(options).toMatchObject({
      skipTaskbar: true,
      minimizable: false,
      fullscreenable: false,
      fullscreen: false,
      kiosk: false,
      alwaysOnTop: false,
    });
  });

  it("can be maximised, which Windows also asks of a window before it will snap it to an edge", () => {
    expect(options).toMatchObject({ maximizable: true, resizable: true });
  });

  it("resizes natively down to a floor a pane can still be read at", () => {
    expect(options).toMatchObject({ resizable: true, minWidth: 200, minHeight: 120 });
    expect(surfaceMinimumSize).toEqual({ width: 200, height: 120 });
  });

  it("keeps the OS shadow, rounded corners and resize frame by leaving their defaults alone", () => {
    expect(options.hasShadow).toBeUndefined();
    expect(options.roundedCorners).toBeUndefined();
    expect(options.thickFrame).toBeUndefined();
    expect(options.focusable).toBeUndefined();
  });

  it("names no web preference, so the opener's sandbox and isolation are inherited whole", () => {
    expect(options.webPreferences).toBeUndefined();
  });
});

describe("releaseEvents", () => {
  it("ends a drag on Windows, a resize on macOS, and nothing on Linux", () => {
    expect(releaseEvents("win32")).toEqual(["moved", "resized"]);
    expect(releaseEvents("darwin")).toEqual(["resized"]);
    expect(releaseEvents("linux")).toEqual([]);
  });
});
