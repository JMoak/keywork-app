import { describe, expect, it } from "vitest";
import { shortcutKeeper, shortcutVerdict } from "./shortcut.ts";

describe("shortcutVerdict", () => {
  it("refuses every chord an OS or launcher uses", () => {
    for (const chord of [
      "Ctrl+Space",
      "Option+Space",
      "Alt+Space",
      "Cmd+Space",
      "Ctrl+D",
      "Win+Alt+P",
      "Alt+Tab",
    ]) {
      expect(shortcutVerdict(chord).ok).toBe(false);
    }
    expect(shortcutVerdict("Win+K")).toMatchObject({ ok: false });
    expect(shortcutVerdict("Command+Q")).toMatchObject({ ok: false });
  });

  it("refuses bare keys and bare modifiers", () => {
    expect(shortcutVerdict("K")).toMatchObject({ ok: false });
    expect(shortcutVerdict("Ctrl+Shift")).toMatchObject({ ok: false });
    expect(shortcutVerdict("")).toMatchObject({ ok: false });
  });

  it("canonicalizes a free chord into an Electron accelerator", () => {
    expect(shortcutVerdict("ctrl+alt+k")).toEqual({ ok: true, accelerator: "Control+Alt+K" });
    expect(shortcutVerdict("CmdOrCtrl+Shift+F9")).toEqual({
      ok: true,
      accelerator: "CommandOrControl+Shift+F9",
    });
    expect(shortcutVerdict("Win+Shift+C")).toEqual({ ok: true, accelerator: "Super+Shift+C" });
  });
});

describe("shortcutKeeper", () => {
  it("registers once per accelerator, swaps on change, and lets go on none", () => {
    const registered: string[] = [];
    const unregistered: string[] = [];
    const keeper = shortcutKeeper({
      register: (accelerator) => {
        registered.push(accelerator);
        return accelerator !== "Control+Alt+T";
      },
      unregister: (accelerator) => {
        unregistered.push(accelerator);
      },
    });
    const handler = () => undefined;
    expect(keeper.apply(null, handler).registered).toBe(false);
    expect(keeper.apply("Ctrl+Alt+K", handler)).toEqual({
      accelerator: "Control+Alt+K",
      registered: true,
      reason: undefined,
    });
    keeper.apply("Control+Alt+K", handler);
    expect(registered).toEqual(["Control+Alt+K"]);
    expect(keeper.apply("Ctrl+Alt+T", handler)).toMatchObject({
      registered: false,
      reason: "Control+Alt+T is held by another app",
    });
    expect(unregistered).toEqual(["Control+Alt+K"]);
    expect(keeper.apply("Ctrl+Space", handler)).toMatchObject({
      registered: false,
      reason: "Control+Space belongs to the OS or a launcher",
    });
    keeper.apply("Ctrl+Alt+K", handler);
    keeper.release();
    expect(unregistered).toEqual(["Control+Alt+K", "Control+Alt+K"]);
    expect(keeper.standing().registered).toBe(false);
  });
});
