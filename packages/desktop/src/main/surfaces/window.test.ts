import type { BaseWindow } from "electron";
import { describe, expect, it } from "vitest";
import { releaseEvents, surfaceWindowOptions } from "./window.ts";

const consoleWindow = { id: 7 } as BaseWindow;
const options = surfaceWindowOptions({
  parent: consoleWindow,
  backdrop: "backdrop-token",
  title: "keywork",
});

describe("surfaceWindowOptions", () => {
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
