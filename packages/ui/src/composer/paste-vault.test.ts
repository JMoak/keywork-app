import { describe, expect, it } from "vitest";
import { createPasteVault } from "./paste-vault.ts";

const flood = Array.from({ length: 9 }, (_, line) => `line ${line}`).join("\n");
const placeholder = (ordinal: number) => `[pasted #${ordinal}, 9 lines, 62 B]`;

describe("the paste vault", () => {
  it("names only the pastes a draft still holds", () => {
    const vault = createPasteVault();
    vault.hold(flood);
    vault.hold(`${flood}!`);
    expect(vault.heldIn(`kept ${placeholder(1)}`)).toEqual([[1, flood]]);
    expect(vault.heldIn("nothing held here")).toEqual([]);
  });

  it("holds exactly what it is given back, and numbers the next paste past it", () => {
    const vault = createPasteVault();
    vault.hold(flood);
    vault.restore([[4, flood]]);
    expect(vault.expandAll(placeholder(1))).toBe(placeholder(1));
    expect(vault.expandAll(placeholder(4))).toBe(flood);
    expect(vault.hold(flood)).toBe(placeholder(5));
  });

  it("finds a held placeholder at the caret near the end of a huge draft", () => {
    const vault = createPasteVault();
    const held = vault.hold(flood);
    const draft = `${"word ".repeat(20_000)}${held} tail`;
    const end = draft.length - " tail".length;
    const start = end - held.length;
    expect(vault.spanEndingAt(draft, end)).toEqual({ start, end });
    expect(vault.spanStartingAt(draft, start)).toEqual({ start, end });
    expect(vault.spanEndingAt(draft, end - 1)).toBeUndefined();
  });
});
