import { describe, expect, it } from "vitest";
import { nameLimit, nameOf, plainNames, proposeNames, slugOf } from "./names.ts";

describe("the three plain names", () => {
  it("proposes three distinct names from the plain pool, the same ones for the same workspace", () => {
    const names = proposeNames("C:/src/stead");
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    for (const name of names) expect(plainNames).toContain(name);
    expect(proposeNames("C:/src/stead")).toEqual(names);
  });

  it("proposes differently for another workspace", () => {
    const seeds = ["C:/src/stead", "C:/src/orchard", "/home/j/ratchet", "D:/work"];
    const distinct = new Set(seeds.map((seed) => proposeNames(seed).join(" ")));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("keeps every pool name short, pronounceable and never a pun or a brand", () => {
    for (const name of plainNames) {
      expect(name).toMatch(/^[A-Z][a-z]{1,4}$/);
      expect(name.toLowerCase()).not.toMatch(/bot|gpt|claude|ai$/);
    }
  });

  it("accepts a typed name of one to sixty-four characters, trimmed", () => {
    expect(nameOf("  Wren ")).toBe("Wren");
    expect(nameOf("")).toBeUndefined();
    expect(nameOf("   ")).toBeUndefined();
    expect(nameOf("w".repeat(nameLimit))).toBe("w".repeat(nameLimit));
    expect(nameOf("w".repeat(nameLimit + 1))).toBeUndefined();
  });

  it("slugs a name the way the node does: lowercase, marks stripped, runs of anything else one dash", () => {
    expect(slugOf("Bea")).toBe("bea");
    expect(slugOf("Old Tom")).toBe("old-tom");
    expect(slugOf("  Zoë! ")).toBe("zoe");
  });
});
