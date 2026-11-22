import { afterEach, describe, expect, it } from "vitest";
import type { Realm } from "../surfaces/runtime/realm.ts";
import { openChild } from "../surfaces/runtime/testing.ts";
import { admitWindow } from "../surfaces/runtime/windows.ts";
import { chordsOfKey } from "./chord.ts";
import { Keymap } from "./keymap.ts";
import { listenForKeys } from "./listen.ts";
import { keyFocusOf, keyTargetOf } from "./typing.ts";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});

describe("keys pressed in a pane outside the window", () => {
  it("resolves a leader armed in one window with the key pressed in another", () => {
    const child = outsideWindow();
    const actions = routed("file");
    press(placed(document, "div"), "k", { ctrlKey: true });
    press(placed(child.document, "div"), "s");
    press(placed(child.document, "div"), "k", { ctrlKey: true });
    press(placed(document, "div"), "s");
    expect(actions).toEqual(["pane.split", "pane.split"]);
  });

  it("leaves typing alone in a text field outside, exactly as it does inside", () => {
    const child = outsideWindow();
    const actions = routed("file");
    for (const page of [document, child.document]) {
      press(placed(page, "textarea"), "j");
      press(placed(page, "div"), "j");
      press(placed(page, "textarea"), "k", { ctrlKey: true });
      press(placed(page, "textarea"), "s");
    }
    expect(actions).toEqual(["file.down", "pane.split", "file.down", "pane.split"]);
  });

  it("reads a key that lands on a page body as meant for what holds focus in that page", () => {
    const child = outsideWindow();
    const field = placed(child.document, "textarea");
    field.focus();
    expect(keyTargetOf({ target: child.document.body })).toBe(field);
    expect(keyTargetOf({ target: field })).toBe(field);
    expect(keyTargetOf({ target: document.body })).toBe(document.body);
    expect(keyTargetOf({ target: null })).toBeNull();
  });

  it("stops hearing every window once the listener is withdrawn", () => {
    const child = outsideWindow();
    const heard: string[] = [];
    const stop = listenForKeys((event) => void heard.push(event.key));
    press(placed(child.document, "div"), "a");
    stop();
    press(placed(child.document, "div"), "b");
    press(placed(document, "div"), "c");
    expect(heard).toEqual(["a"]);
  });
});

function outsideWindow(): Realm {
  const child = openChild();
  cleanups.push(admitWindow(child), () => child.close());
  return child;
}

function routed(scope: string): string[] {
  const keymap = new Keymap({
    bindings: { "pane.split": "leader s", "file.down": "j" },
    scopes: { "file.down": "file" },
  });
  const actions: string[] = [];
  cleanups.push(
    listenForKeys((event) => {
      const chords = chordsOfKey(event);
      if (chords.length === 0) return;
      const focus = keyFocusOf(scope, keyTargetOf(event), keymap);
      const result = keymap.press(chords, performance.now(), focus.scope, focus.typing);
      if (result.type === "action") actions.push(result.action);
    }),
  );
  return actions;
}

function placed(page: Document, tag: "div" | "textarea"): HTMLElement {
  const element = document.createElement(tag);
  page.body.append(element);
  return element;
}

function press(target: Element, key: string, modifiers: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...modifiers }));
}
