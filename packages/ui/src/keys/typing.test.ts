import { describe, expect, it } from "vitest";
import { parseChord } from "./chord.ts";
import { Keymap } from "./keymap.ts";
import { isTextField, keyFocusOf } from "./typing.ts";

const owning = { ownsKeyboard: (scope: string | undefined) => scope === "terminal" };

describe("pane-local chords while typing", () => {
  it("marks a text field as typing but keeps the focused pane's scope for the leader", () => {
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    expect(keyFocusOf("tree", input, owning)).toEqual({ scope: "tree", typing: true });
    expect(keyFocusOf("conversation", area, owning)).toEqual({
      scope: "conversation",
      typing: true,
    });
    expect(keyFocusOf("tree", document.body, owning)).toEqual({ scope: "tree", typing: false });
    expect(keyFocusOf("tree", null, owning)).toEqual({ scope: "tree", typing: false });
  });

  it("never calls a keyboard-owning pane's own text field typing", () => {
    const area = document.createElement("textarea");
    expect(keyFocusOf("terminal", area, owning)).toEqual({ scope: "terminal", typing: false });
  });

  it("recognizes inputs, textareas and editable elements as text fields", () => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    expect(isTextField(document.createElement("input"))).toBe(true);
    expect(isTextField(document.createElement("textarea"))).toBe(true);
    expect(isTextField(editable)).toBe(true);
    expect(isTextField(document.createElement("button"))).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe("the keymap while a composer has the keys", () => {
  const keymap = () =>
    new Keymap({
      bindings: {
        "conversation.thinking": "leader v",
        "diff.undo": "u",
        "pane.zoom": "leader z",
      },
      scopes: { "conversation.thinking": "conversation", "diff.undo": "diff" },
    });

  it("still resolves the focused pane's leader chords", () => {
    const map = keymap();
    expect(map.press(parseChord("ctrl+k"), 0, "conversation", true)).toEqual({
      type: "leader-pending",
    });
    expect(map.press(parseChord("v"), 1, "conversation", true)).toEqual({
      type: "action",
      action: "conversation.thinking",
    });
  });

  it("lets single-key pane verbs through as text", () => {
    const map = keymap();
    expect(map.press(parseChord("u"), 0, "diff", true)).toEqual({ type: "pass" });
    expect(map.press(parseChord("u"), 1, "diff", false)).toEqual({
      type: "action",
      action: "diff.undo",
    });
  });
});
