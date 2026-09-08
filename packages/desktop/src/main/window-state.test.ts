import { describe, expect, it } from "vitest";
import type { FileSeams } from "./recents.ts";
import { defaultWindowState, fitsAnyDisplay, windowStateStore } from "./window-state.ts";

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

describe("windowStateStore", () => {
  it("round-trips through an atomic write and falls back on a corrupt or missing file", async () => {
    const seams = memoryFiles();
    const store = windowStateStore("state.json", seams);
    expect(await store.read()).toEqual(defaultWindowState);
    await store.write({ x: 10, y: 20, width: 900, height: 700, maximized: true });
    expect(seams.files.has("state.json.tmp")).toBe(false);
    expect(await store.read()).toEqual({ x: 10, y: 20, width: 900, height: 700, maximized: true });
    seams.files.set("state.json", "{ nope");
    expect(await store.read()).toEqual(defaultWindowState);
    seams.files.set("state.json", JSON.stringify({ width: 50, height: 50 }));
    expect(await store.read()).toEqual(defaultWindowState);
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
