import { describe, expect, it } from "vitest";
import { isTextField, scopeWhileTyping } from "./typing.ts";

const owning = { ownsKeyboard: (scope: string | undefined) => scope === "terminal" };

describe("pane-local chords while typing", () => {
  it("drops the pane scope when a text field has the key, so plain letters never fire local verbs", () => {
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    expect(scopeWhileTyping("tree", input, owning)).toBeUndefined();
    expect(scopeWhileTyping("diff", area, owning)).toBeUndefined();
    expect(scopeWhileTyping("tree", document.body, owning)).toBe("tree");
    expect(scopeWhileTyping("tree", null, owning)).toBe("tree");
  });

  it("keeps a keyboard-owning pane's scope even inside its text field", () => {
    const area = document.createElement("textarea");
    expect(scopeWhileTyping("terminal", area, owning)).toBe("terminal");
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
