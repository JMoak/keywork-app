import { courtyardCapacity } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import { savedChoice, settlementDistricts } from "./settlement-preferences.ts";

describe("saved settlement choices", () => {
  it("never reads inherited choices for valid creature names", () => {
    const choices = { neighbor: "gable" };
    expect(savedChoice(choices, "constructor")).toBeUndefined();
    expect(savedChoice(choices, "__proto__")).toBeUndefined();
    expect(savedChoice({ ...choices, ["__proto__"]: "folded" }, "__proto__")).toBe("folded");
    expect(savedChoice({ ...choices, constructor: "lantern" }, "constructor")).toBe("lantern");
  });

  it("keeps every unassigned resident reachable after all saved addresses are occupied", () => {
    const order = Array.from({ length: courtyardCapacity }, (_, index) => `saved-${index}`);
    const arrivals = Array.from({ length: 33 }, (_, index) => `new-${index}`);
    const districts = settlementDistricts(order, [order[0] as string, ...arrivals]);
    expect(districts).toHaveLength(259);
    expect(districts.slice(0, 256).flatMap((district) => district.slugs)).toEqual(order);
    expect(districts.slice(256).flatMap((district) => district.slugs)).toEqual(
      [...arrivals].sort(),
    );
    expect(districts.every((district) => district.slugs.length <= 16)).toBe(true);
    expect(districts[256]?.address).toBe("Additional neighborhood 1");
    expect(order).toHaveLength(courtyardCapacity);
  });
});
