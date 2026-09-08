import { describe, expect, it } from "vitest";
import { appActions, appBindings, composerHotPath, hotPathActions } from "./actions.ts";
import { chordOfKey, formatChord, parseChord } from "./chord.ts";
import { keybindingsSchema, keymapFromConfig } from "./config.ts";
import { Keymap, KeymapError } from "./keymap.ts";

const key = (
  overrides: Partial<Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">>,
) => ({
  key: "a",
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  isComposing: false,
  ...overrides,
});

describe("chords", () => {
  it("parses and formats in keywork's canonical order", () => {
    expect(formatChord(parseChord("alt+shift+CTRL+k"))).toBe("ctrl+shift+alt+k");
    expect(parseChord("meta+enter").alt).toBe(true);
    expect(() => parseChord("hyper+x")).toThrow('unknown modifier "hyper"');
    expect(() => parseChord("ctrl+")).toThrow("invalid chord");
  });

  it("reads DOM key events, treats meta as ctrl, and drops modifier-only keys", () => {
    expect(chordOfKey(key({ key: "k", ctrlKey: true }))).toEqual({
      name: "k",
      ctrl: true,
      shift: false,
      alt: false,
    });
    expect(chordOfKey(key({ key: "P", metaKey: true, shiftKey: true }))).toEqual({
      name: "p",
      ctrl: true,
      shift: true,
      alt: false,
    });
    expect(chordOfKey(key({ key: "ArrowLeft" }))?.name).toBe("left");
    expect(chordOfKey(key({ key: " " }))?.name).toBe("space");
    expect(chordOfKey(key({ key: "Shift", shiftKey: true }))).toBeUndefined();
    expect(chordOfKey({ ...key({ key: "a" }), isComposing: true })).toBeUndefined();
  });
});

describe("Keymap", () => {
  const keymap = () =>
    new Keymap({
      leader: "ctrl+k",
      timeoutMs: 100,
      bindings: { "pane.zoom": ["leader z", "alt+z"], "help.toggle": "f1" },
    });

  it("arms on the leader, fires a leader key, and falls through text after a cancel", () => {
    const map = keymap();
    expect(map.press(parseChord("ctrl+k"), 0)).toEqual({ type: "leader-pending" });
    expect(map.armed(50)).toBe(true);
    expect(map.press(parseChord("z"), 50)).toEqual({ type: "action", action: "pane.zoom" });
    map.press(parseChord("ctrl+k"), 100);
    expect(map.press(parseChord("q"), 120)).toEqual({ type: "cancelled" });
    expect(map.press(parseChord("u"), 130)).toEqual({ type: "pass" });
  });

  it("times out an armed leader and fires leaderless chords directly", () => {
    const map = keymap();
    map.press(parseChord("ctrl+k"), 0);
    expect(map.armed(101)).toBe(false);
    expect(map.press(parseChord("z"), 150)).toEqual({ type: "pass" });
    expect(map.press(parseChord("alt+z"), 150)).toEqual({ type: "action", action: "pane.zoom" });
    expect(map.press(parseChord("f1"), 150)).toEqual({ type: "action", action: "help.toggle" });
  });

  it("describes bindings and refuses collisions, duplicates, and the leader itself", () => {
    const map = keymap();
    expect(map.describe("pane.zoom")).toBe("ctrl+k z");
    expect(map.describeAll("pane.zoom")).toEqual(["ctrl+k z", "alt+z"]);
    expect(map.isLeaderless("pane.zoom")).toBe(true);
    expect(map.isLeaderless("help.toggle")).toBe(true);
    expect(() => new Keymap({ bindings: { a: "leader z", b: "leader z" } })).toThrow(KeymapError);
    expect(() => new Keymap({ bindings: { a: ["f1", "f1"] } })).toThrow("listed twice");
    expect(() => new Keymap({ bindings: { a: "ctrl+k" } })).toThrow("is the leader");
    expect(() => new Keymap({ bindings: { a: "leader ctrl+z" } })).toThrow("can never fire");
  });
});

describe("the app's bindings", () => {
  it("compile without a single collision", () => {
    expect(() => new Keymap({ bindings: appBindings })).not.toThrow();
  });

  it("keep the hot path leaderless: zoom, mode, approve, deny, help, palette, pane jump, and the composer trio", () => {
    const map = new Keymap({ bindings: appBindings });
    for (const action of hotPathActions) expect(map.isLeaderless(action), action).toBe(true);
    expect(hotPathActions).toEqual(
      expect.arrayContaining([
        "pane.zoom",
        "mode.cycle",
        "ask.approve",
        "ask.deny",
        "help.toggle",
        "palette.go",
        "palette.commands",
        "focus.pane1",
      ]),
    );
    expect(composerHotPath).toEqual(["enter", "alt+enter", "escape"]);
  });

  it("mirror keywork's leader chords for the verbs both surfaces share", () => {
    const map = new Keymap({ bindings: appBindings });
    expect(map.describe("pane.split")).toBe("ctrl+k s");
    expect(map.describe("pane.close")).toBe("ctrl+k x");
    expect(map.describe("pane.zoom")).toBe("ctrl+k z");
    expect(map.describe("focus.left")).toBe("ctrl+k h");
    expect(map.describe("dock.cycle")).toBe("ctrl+k c");
    expect(map.describe("palette.commands")).toBe("ctrl+k i");
    expect(map.describe("palette.go")).toBe("ctrl+p");
    expect(map.describeAll("help.toggle")).toEqual(["ctrl+k /", "f1"]);
  });

  it("give every action help text and a command where it is palette-reachable", () => {
    for (const [name, action] of Object.entries(appActions)) {
      expect(action.help, name).not.toBe("");
      if (!name.startsWith("focus.pane")) expect(action.command, name).toBeDefined();
    }
  });
});

describe("keybindings config", () => {
  it("defaults to keywork's leader and timeout with every option described", () => {
    const parsed = keybindingsSchema.parse({});
    expect(parsed).toEqual({ leader: "ctrl+k", timeoutMs: 2000, bindings: {} });
    for (const field of Object.values(keybindingsSchema.shape)) {
      expect(field.description).toBeTruthy();
    }
  });

  it("applies overrides, unbinds with none, and names an unknown action", () => {
    const map = keymapFromConfig({
      leader: "ctrl+b",
      bindings: { "pane.zoom": "none", "pane.split": "leader n" },
    });
    expect(map.describe("pane.zoom")).toBeUndefined();
    expect(map.describe("pane.split")).toBe("ctrl+b n");
    expect(() => keymapFromConfig({ bindings: { "pane.nope": "f2" } })).toThrow(
      'no action named "pane.nope"',
    );
  });
});
