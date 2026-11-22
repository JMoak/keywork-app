import { describe, expect, it } from "vitest";
import { day, hour, localTime, minute, parseTs } from "./clock.ts";
import { between, hashSeed, jittered, mulberry32, pick, unit, weightedPick } from "./random.ts";

describe("the fake clock", () => {
  it("names a day and an hour in the house's own zone", () => {
    const noonUtc = Date.parse("2026-11-05T12:30:00.000Z");
    expect(localTime(noonUtc, 0)).toEqual({ dayKey: "2026-11-05", hour: 12.5, month: 11 });
    expect(localTime(noonUtc, 5 * 60)).toMatchObject({ dayKey: "2026-11-05", hour: 7.5 });
    expect(localTime(noonUtc, -13 * 60)).toMatchObject({ dayKey: "2026-11-06", hour: 1.5 });
    expect(day).toBe(24 * hour);
    expect(hour).toBe(60 * minute);
  });

  it("reads a timestamp and treats garbage as the dawn of time", () => {
    expect(parseTs("2026-11-05T12:30:00.000Z")).toBe(Date.parse("2026-11-05T12:30:00.000Z"));
    expect(parseTs("not a time")).toBe(0);
  });
});

describe("seeded randomness", () => {
  it("replays the same stream for the same seed", () => {
    const first = mulberry32(17);
    const second = mulberry32(17);
    const draws = Array.from({ length: 8 }, () => first());
    expect(Array.from({ length: 8 }, () => second())).toEqual(draws);
    expect(draws.every((n) => n >= 0 && n < 1)).toBe(true);
  });

  it("hashes names and days into stable, distinct seeds", () => {
    expect(hashSeed("tinker", "2026-11-05")).toBe(hashSeed("tinker", "2026-11-05"));
    expect(hashSeed("tinker", "2026-11-05")).not.toBe(hashSeed("tinker", "2026-11-06"));
    expect(hashSeed("tinker", "2026-11-05")).not.toBe(hashSeed("tinke", "r2026-11-05"));
    expect(unit(hashSeed("x"))).toBeGreaterThanOrEqual(0);
    expect(unit(hashSeed("x"))).toBeLessThan(1);
  });

  it("jitters a hold by at most fifteen percent either way", () => {
    const random = mulberry32(5);
    for (let i = 0; i < 500; i++) {
      const held = jittered(random, 1_000);
      expect(held).toBeGreaterThanOrEqual(850);
      expect(held).toBeLessThanOrEqual(1_150);
    }
    expect(between(() => 0.5, 20, 90)).toBe(55);
  });

  it("picks within bounds and honours weights", () => {
    expect(pick(() => 0.999, ["a", "b", "c"])).toBe("c");
    expect(pick(() => 0, [])).toBeUndefined();
    expect(
      weightedPick(
        () => 0.9,
        ["light", "heavy"],
        (item) => (item === "heavy" ? 9 : 1),
      ),
    ).toBe("heavy");
    expect(
      weightedPick(
        () => 0.05,
        ["light", "heavy"],
        (item) => (item === "heavy" ? 9 : 1),
      ),
    ).toBe("light");
    expect(
      weightedPick(
        () => 0.5,
        ["a", "b"],
        () => 0,
      ),
    ).toBe("a");
  });
});
