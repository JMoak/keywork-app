import { afterEach, describe, expect, it } from "vitest";
import { companionGlobal, companionPortFromWindow } from "./port.ts";

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
