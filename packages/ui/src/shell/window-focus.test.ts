import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { type FocusableWindow, windowFocus } from "./window-focus.ts";

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

  it("reads as focused where there is no window to ask", () => {
    createRoot(() => {
      expect(windowFocus(undefined)()).toBe(true);
    });
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
