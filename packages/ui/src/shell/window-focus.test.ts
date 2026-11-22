import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { openChild } from "../surfaces/runtime/testing.ts";
import { admitWindow } from "../surfaces/runtime/windows.ts";
import { anyWindowFocus, type FocusableWindow, windowFocus } from "./window-focus.ts";

describe("window focus as the shell sees it", () => {
  it("starts from the document's own answer and follows the window's blur and focus", () => {
    const fake = fakeWindow(true);
    createRoot(() => {
      const focused = windowFocus(fake);
      expect(focused()).toBe(true);
      fake.fire("blur");
      expect(focused()).toBe(false);
      fake.fire("focus");
      expect(focused()).toBe(true);
    });
  });

  it("starts unfocused when the document says so, and lets go of the window when its owner is disposed", () => {
    const fake = fakeWindow(false);
    const dispose = createRoot((dispose) => {
      expect(windowFocus(fake)()).toBe(false);
      return dispose;
    });
    expect(fake.listeners()).toBe(2);
    dispose();
    expect(fake.listeners()).toBe(0);
  });
});

describe("focus anywhere among the console and its panes outside", () => {
  it("holds while the keeper moves between the app's windows, and lets go when they leave them all", () => {
    const child = openChild();
    const dismiss = admitWindow(child);
    const consoleFocus = document.hasFocus;
    const holding = (page: Document, held: boolean): void => {
      page.hasFocus = () => held;
    };
    try {
      holding(document, true);
      holding(child.document, false);
      createRoot((dispose) => {
        const focused = anyWindowFocus();
        expect(focused()).toBe(true);
        holding(document, false);
        holding(child.document, true);
        window.dispatchEvent(new Event("blur"));
        expect(focused()).toBe(true);
        holding(child.document, false);
        child.dispatchEvent(new Event("blur"));
        expect(focused()).toBe(false);
        child.dispatchEvent(new Event("focus"));
        expect(focused()).toBe(true);
        dispose();
      });
    } finally {
      document.hasFocus = consoleFocus;
      dismiss();
      child.close();
    }
  });
});

function fakeWindow(focusedAtStart: boolean) {
  const held = new Map<"focus" | "blur", Set<() => void>>([
    ["focus", new Set()],
    ["blur", new Set()],
  ]);
  const target: FocusableWindow = {
    hasFocus: () => focusedAtStart,
    addEventListener: (type, listener) => void held.get(type)?.add(listener),
    removeEventListener: (type, listener) => void held.get(type)?.delete(listener),
  };
  return {
    ...target,
    fire: (type: "focus" | "blur") => {
      for (const listener of held.get(type) ?? []) listener();
    },
    listeners: () => [...held.values()].reduce((count, set) => count + set.size, 0),
  };
}
