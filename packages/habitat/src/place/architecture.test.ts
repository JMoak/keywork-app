import { describe, expect, it } from "vitest";
import { isWorkshopFamily, workshopFamilies, workshopFamilyOf } from "./architecture.ts";

describe("automatic workshop architecture", () => {
  it("keeps the original address-to-family assignments stable", () => {
    expect(Array.from({ length: 8 }, (_, index) => workshopFamilyOf(index))).toEqual([
      "gable",
      "ceramic",
      "cairn",
      "folded",
      "root",
      "tidal",
      "lantern",
      "canopy",
    ]);
    expect(workshopFamilyOf(8)).toBe("gable");
    expect(workshopFamilyOf(31)).toBe("canopy");
    expect(workshopFamilyOf(999)).toBe("canopy");
    expect(workshopFamilyOf(4095)).toBe("canopy");
  });

  it("gives every block of eight neighbors a different silhouette without mutable state", () => {
    for (let first = 0; first < 4096; first += 8) {
      const families = Array.from({ length: 8 }, (_, offset) => workshopFamilyOf(first + offset));
      expect(new Set(families).size).toBe(8);
    }
    expect(Object.isFrozen(workshopFamilies)).toBe(true);
  });

  it("applies an explicit choice without changing the automatic assignment", () => {
    for (const family of workshopFamilies) expect(workshopFamilyOf(18, family)).toBe(family);
    expect(workshopFamilyOf(18)).toBe("cairn");
    expect(workshopFamilyOf(18, undefined)).toBe("cairn");
  });

  it("ignores malformed or inherited overrides at the saved-preference boundary", () => {
    const styles: Record<string, unknown> = { neighbor: "gable" };
    expect(workshopFamilyOf(2, styles.constructor)).toBe("cairn");
    expect(workshopFamilyOf(3, {})).toBe("folded");
    expect(workshopFamilyOf(4, "unavailable")).toBe("root");
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid permanent address %s even with an override",
    (index) => {
      expect(() => workshopFamilyOf(index)).toThrow(RangeError);
      expect(() => workshopFamilyOf(index, "gable")).toThrow(RangeError);
    },
  );
});

describe("saved workshop family validation", () => {
  it("accepts every authored family and rejects unrelated or inherited values", () => {
    for (const family of workshopFamilies) expect(isWorkshopFamily(family)).toBe(true);
    for (const value of [undefined, null, 0, {}, [], "", "Gable", "shell", "__proto__", "toString"])
      expect(isWorkshopFamily(value)).toBe(false);
  });
});
