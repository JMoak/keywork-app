import { describe, expect, it } from "vitest";
import type { FileSeams } from "../recents.ts";
import {
  companionPreferencesSchema,
  defaultPreferences,
  parsePreferences,
  patched,
  preferenceBook,
} from "./preferences.ts";

describe("companion preferences", () => {
  it("default to opt-in off, floating, visible, full size, no shortcut", () => {
    expect(defaultPreferences).toEqual({
      version: 1,
      enabled: false,
      optInOffered: false,
      mode: "floating",
      hidden: false,
      still: false,
      quiet: false,
      onlyWhileBusy: false,
      size: 100,
      shortcut: null,
      motion: "system",
      positions: {},
    });
  });

  it("justify every option in its describe()", () => {
    const shape = companionPreferencesSchema.shape;
    for (const [name, field] of Object.entries(shape)) {
      if (name === "version") continue;
      expect(field.description, name).toBeTruthy();
    }
    expect(companionPreferencesSchema.description).toContain("master switch");
  });

  it("fall back whole on a corrupt or out-of-range file", () => {
    expect(parsePreferences(undefined)).toEqual(defaultPreferences);
    expect(parsePreferences("{ nope")).toEqual(defaultPreferences);
    expect(parsePreferences(JSON.stringify({ version: 1, size: 500 }))).toEqual(defaultPreferences);
  });

  it("patch within the schema and reject a bad patch loudly", () => {
    expect(patched(defaultPreferences, { size: 150, hidden: true })).toMatchObject({
      size: 150,
      hidden: true,
      enabled: false,
    });
    expect(() => patched(defaultPreferences, { size: 20 })).toThrow();
  });

  it("write atomically through a temporary file", async () => {
    const files = new Map<string, string>();
    const seams: FileSeams = {
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
    const book = preferenceBook("companion.json", seams);
    expect(await book.read()).toEqual(defaultPreferences);
    await book.write(patched(defaultPreferences, { enabled: true }));
    expect(files.has("companion.json.tmp")).toBe(false);
    expect((await book.read()).enabled).toBe(true);
  });
});
