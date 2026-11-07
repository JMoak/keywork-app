import { describe, expect, it } from "vitest";
import { lightOf, phaseOf, seasonOf, skyAt } from "./sky.ts";

describe("the sky over the stead", () => {
  it("follows the house clock through night, dawn, day and dusk", () => {
    expect(phaseOf(3)).toBe("night");
    expect(phaseOf(6)).toBe("dawn");
    expect(phaseOf(12)).toBe("day");
    expect(phaseOf(19)).toBe("dusk");
    expect(phaseOf(22)).toBe("night");
    expect(lightOf(3)).toBe(0);
    expect(lightOf(6.5)).toBeCloseTo(0.5);
    expect(lightOf(12)).toBe(1);
    expect(lightOf(19.5)).toBeCloseTo(0.5);
  });

  it("follows the calendar, and flips for a southern house", () => {
    expect(seasonOf(1)).toBe("winter");
    expect(seasonOf(4)).toBe("spring");
    expect(seasonOf(7)).toBe("summer");
    expect(seasonOf(10)).toBe("autumn");
    expect(seasonOf(12)).toBe("winter");
    expect(seasonOf(7, true)).toBe("winter");
  });

  it("reads one moment in the house's own zone", () => {
    const noonUtc = Date.parse("2026-11-05T12:00:00.000Z");
    expect(skyAt(noonUtc, 0)).toEqual({ hour: 12, phase: "day", light: 1, season: "autumn" });
    expect(skyAt(noonUtc, -9 * 60)).toMatchObject({ hour: 21, phase: "night", light: 0 });
  });
});
