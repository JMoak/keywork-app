import { describe, expect, it } from "vitest";
import type { FileSeams } from "./recents.ts";
import {
  defaultWindowState,
  fitsAnyDisplay,
  frontDoorKey,
  windowStateBook,
  windowStateKey,
} from "./window-state.ts";

function memoryFiles(): FileSeams & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    readText: async (path) => files.get(path),
    writeText: async (path, text) => {
      files.set(path, text);
    },
    rename: async (from, to) => {
      const text = files.get(from);
      if (text === undefined) throw new Error(`no ${from}`);
      files.delete(from);
      files.set(to, text);
    },
  };
}

describe("windowStateBook", () => {
  it("remembers one placement per key through an atomic write", async () => {
    const seams = memoryFiles();
    const book = windowStateBook("windows.json", seams);
    expect(await book.read("c:/work")).toEqual(defaultWindowState);
    await book.write("c:/work", { x: 10, y: 20, width: 900, height: 700, maximized: true });
    await book.write(frontDoorKey, { width: 800, height: 600, maximized: false });
    expect(seams.files.has("windows.json.tmp")).toBe(false);
    expect(await book.read("c:/work")).toEqual({
      x: 10,
      y: 20,
      width: 900,
      height: 700,
      maximized: true,
    });
    expect(await book.read(frontDoorKey)).toEqual({ width: 800, height: 600, maximized: false });
    expect(await book.read("c:/other")).toEqual(defaultWindowState);
  });

  it("falls back on a corrupt, invalid, or legacy single-window file", async () => {
    const seams = memoryFiles();
    const book = windowStateBook("windows.json", seams);
    seams.files.set("windows.json", "{ nope");
    expect(await book.read("c:/work")).toEqual(defaultWindowState);
    seams.files.set("windows.json", JSON.stringify({ width: 1200, height: 800 }));
    expect(await book.read("c:/work")).toEqual(defaultWindowState);
    seams.files.set(
      "windows.json",
      JSON.stringify({ version: 1, windows: { "c:/work": { width: 50, height: 50 } } }),
    );
    expect(await book.read("c:/work")).toEqual(defaultWindowState);
  });
});

describe("windowStateKey", () => {
  it("names the front door for a window with no workspace", () => {
    expect(windowStateKey(undefined, "win32")).toBe(frontDoorKey);
  });

  it("folds slashes and case on Windows, and only slashes elsewhere", () => {
    expect(windowStateKey("C:\\Work\\App\\", "win32")).toBe("c:/work/app");
    expect(windowStateKey("/home/Me/app/", "linux")).toBe("/home/Me/app");
  });
});

describe("fitsAnyDisplay", () => {
  const displays = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 2560, height: 1440 },
  ];

  it("accepts a window whose center lies on a connected display", () => {
    expect(
      fitsAnyDisplay({ x: 2000, y: 100, width: 1200, height: 800, maximized: false }, displays),
    ).toBe(true);
  });

  it("rejects a window left on a display that is gone, and one with no position", () => {
    expect(
      fitsAnyDisplay({ x: -3000, y: 0, width: 1200, height: 800, maximized: false }, displays),
    ).toBe(false);
    expect(fitsAnyDisplay(defaultWindowState, displays)).toBe(false);
  });
});
