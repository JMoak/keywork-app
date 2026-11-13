import { describe, expect, it } from "vitest";
import { holdsModifiersOf } from "./held.ts";

const held = (
  modifiers: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>>,
) => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe("holding the modifiers of a chord", () => {
  it("matches exactly the modifiers a bound chord needs", () => {
    expect(holdsModifiersOf(held({ altKey: true }), ["alt+1"])).toBe(true);
    expect(holdsModifiersOf(held({ altKey: true, shiftKey: true }), ["alt+1"])).toBe(false);
    expect(holdsModifiersOf(held({}), ["alt+1"])).toBe(false);
    expect(holdsModifiersOf(held({ ctrlKey: true }), ["ctrl+1"])).toBe(true);
  });

  it("ignores leader sequences and bare keys, which have no modifier to hold", () => {
    expect(holdsModifiersOf(held({ ctrlKey: true }), ["ctrl+k 1"])).toBe(false);
    expect(holdsModifiersOf(held({}), ["1"])).toBe(false);
  });
});
