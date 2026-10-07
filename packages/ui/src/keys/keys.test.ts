import { describe, expect, it } from "vitest";
import {
  actionScopes,
  appActions,
  appBindings,
  composerHotPath,
  hotPathActions,
} from "./actions.ts";
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
    expect(chordOfKey(key({ key: "T", shiftKey: true }))).toEqual({
      name: "t",
      ctrl: false,
      shift: true,
      alt: false,
    });
    expect(chordOfKey(key({ key: ">", shiftKey: true }))?.shift).toBe(false);
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

describe("scoped bindings", () => {
  const scoped = () =>
    new Keymap({
      bindings: { "pane.zoom": "leader z", "diff.next": "leader n", "tree.next": "leader n" },
      scopes: { "diff.next": "diff", "tree.next": "session-tree" },
    });

  it("let two panes share a local chord and fire only for the focused kind", () => {
    const map = scoped();
    map.press(parseChord("ctrl+k"), 0);
    expect(map.press(parseChord("n"), 1, "diff")).toEqual({ type: "action", action: "diff.next" });
    map.press(parseChord("ctrl+k"), 10);
    expect(map.press(parseChord("n"), 11, "session-tree")).toEqual({
      type: "action",
      action: "tree.next",
    });
    map.press(parseChord("ctrl+k"), 20);
    expect(map.press(parseChord("n"), 21, "conversation")).toEqual({ type: "cancelled" });
    map.press(parseChord("ctrl+k"), 30);
    expect(map.press(parseChord("z"), 31, "diff")).toEqual({ type: "action", action: "pane.zoom" });
    expect(map.scopeOf("diff.next")).toBe("diff");
    expect(map.scopeOf("pane.zoom")).toBeUndefined();
  });

  it("still refuse a local chord that collides with a global one", () => {
    expect(
      () =>
        new Keymap({
          bindings: { "pane.zoom": "leader z", "diff.zoom": "leader z" },
          scopes: { "diff.zoom": "diff" },
        }),
    ).toThrow('bound to both "pane.zoom" and "diff.zoom"');
  });
});

describe("the app's bindings", () => {
  it("compile without a single collision, pane-local chords included", () => {
    expect(() => new Keymap({ bindings: appBindings, scopes: actionScopes })).not.toThrow();
  });

  it("keep the hot path leaderless: zoom, mode, approve, deny, help, palette, pane jump, and the composer trio", () => {
    const map = new Keymap({ bindings: appBindings, scopes: actionScopes });
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
    const map = new Keymap({ bindings: appBindings, scopes: actionScopes });
    expect(map.describe("pane.split")).toBe("ctrl+k s");
    expect(map.describe("pane.close")).toBe("ctrl+k x");
    expect(map.describe("pane.zoom")).toBe("ctrl+k z");
    expect(map.describe("focus.left")).toBe("ctrl+k h");
    expect(map.describe("dock.cycle")).toBe("ctrl+k c");
    expect(map.describe("palette.commands")).toBe("ctrl+k i");
    expect(map.describe("palette.go")).toBe("ctrl+p");
    expect(map.describe("tree.summon")).toBe("ctrl+k t");
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

describe("a pane that owns the keyboard", () => {
  const press = (keymap: Keymap, spec: string, scope?: string, at = 0) =>
    keymap.press(parseChord(spec), at, scope);

  it("lets every chord through to the pane except the leader and the pane's own", () => {
    const keymap = new Keymap({
      bindings: {
        "palette.go": "ctrl+p",
        "pane.zoom": "leader z",
        "terminal.copy": "ctrl+shift+c",
        "terminal.clear": "leader e",
      },
      scopes: { "terminal.copy": "terminal", "terminal.clear": "terminal" },
      exclusiveScopes: ["terminal"],
    });
    expect(press(keymap, "ctrl+p", "terminal")).toEqual({ type: "pass" });
    expect(press(keymap, "ctrl+p", "conversation")).toEqual({
      type: "action",
      action: "palette.go",
    });
    expect(press(keymap, "ctrl+shift+c", "terminal")).toEqual({
      type: "action",
      action: "terminal.copy",
    });
    expect(press(keymap, "ctrl+k", "terminal")).toEqual({ type: "leader-pending" });
    expect(press(keymap, "z", "terminal", 10)).toEqual({ type: "action", action: "pane.zoom" });
    expect(press(keymap, "ctrl+k", "terminal", 20)).toEqual({ type: "leader-pending" });
    expect(press(keymap, "e", "terminal", 30)).toEqual({
      type: "action",
      action: "terminal.clear",
    });
    expect(keymap.ownsKeyboard("terminal")).toBe(true);
    expect(keymap.ownsKeyboard("conversation")).toBe(false);
    expect(keymap.ownsKeyboard(undefined)).toBe(false);
  });

  it("is declared by the terminal pane in the app keymap", () => {
    const keymap = keymapFromConfig();
    expect(keymap.ownsKeyboard("terminal")).toBe(true);
    expect(keymap.press(parseChord("ctrl+y"), 0, "terminal")).toEqual({ type: "pass" });
    expect(keymap.press(parseChord("ctrl+y"), 0, "conversation")).toEqual({
      type: "action",
      action: "ask.approve",
    });
    expect(keymap.describe("terminal.summon")).toBe("ctrl+k shift+t");
    expect(keymap.describe("terminal.summon.mirror")).toBeUndefined();
  });
});
