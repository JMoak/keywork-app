import { afterEach, describe, expect, it } from "vitest";
import { companionGlobal, companionPageRequested, companionPortFromWindow } from "./port.ts";

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[companionGlobal];
});

describe("companionPortFromWindow", () => {
  it("finds the preload port only when it has the companion shape", () => {
    expect(companionPortFromWindow()).toBeUndefined();
    (globalThis as Record<string, unknown>)[companionGlobal] = { onSnapshot: () => {} };
    expect(companionPortFromWindow()).toBeUndefined();
    (globalThis as Record<string, unknown>)[companionGlobal] = {
      onSnapshot: () => {},
      setInteractive: () => {},
      drag: () => {},
    };
    expect(companionPortFromWindow()).toBeDefined();
  });
});

describe("companionPageRequested", () => {
  it("is the ?companion query the main process loads the window with", () => {
    expect(companionPageRequested({ search: "?companion" })).toBe(true);
    expect(companionPageRequested({ search: "?companion=1&x=2" })).toBe(true);
    expect(companionPageRequested({ search: "?dev" })).toBe(false);
  });
});
