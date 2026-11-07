import { describe, expect, it } from "vitest";
import { cadenceOf, calmContext, ceilingFor, effectiveTier, tierBudgets } from "./tiers.ts";

describe("ceilingFor", () => {
  it("is ambient at rest, rest when idle or throttled, hidden when tucked or locked", () => {
    expect(ceilingFor(calmContext)).toBe("ambient");
    expect(ceilingFor({ ...calmContext, systemIdle: true })).toBe("rest");
    expect(ceilingFor({ ...calmContext, thermal: "serious" })).toBe("rest");
    expect(ceilingFor({ ...calmContext, speedLimit: 50 })).toBe("rest");
    expect(ceilingFor({ ...calmContext, locked: true })).toBe("hidden");
    expect(ceilingFor({ ...calmContext, windowShown: false })).toBe("hidden");
    expect(ceilingFor({ ...calmContext, foregroundBusy: true, systemIdle: true })).toBe("hidden");
  });
});

describe("effectiveTier", () => {
  it("lets the renderer rise to interact under an ambient ceiling and never above the ceiling", () => {
    expect(effectiveTier("ambient", "interact")).toBe("interact");
    expect(effectiveTier("ambient", "rest")).toBe("rest");
    expect(effectiveTier("rest", "active")).toBe("rest");
    expect(effectiveTier("rest", "interact")).toBe("interact");
    expect(effectiveTier("ambient", "active")).toBe("active");
    expect(effectiveTier("hidden", "interact")).toBe("hidden");
  });
});

describe("cadenceOf", () => {
  it("follows the budget table, slower on battery", () => {
    expect(cadenceOf("interact", false)).toEqual({ kind: "frame", fps: Number.POSITIVE_INFINITY });
    expect(cadenceOf("active", false)).toEqual({ kind: "frame", fps: 30 });
    expect(cadenceOf("active", true)).toEqual({ kind: "frame", fps: 24 });
    expect(cadenceOf("ambient", false)).toEqual({ kind: "event", maxFps: 15 });
    expect(cadenceOf("ambient", true)).toEqual({ kind: "event", maxFps: 8 });
    expect(cadenceOf("rest", false)).toEqual({ kind: "timer", minMs: 1000, tolerance: 0.1 });
    expect(cadenceOf("hidden", true)).toEqual({ kind: "none" });
    expect(tierBudgets.ambient).toEqual({ cpuPercent: 1, wakeupsPerSecond: 16 });
    expect(tierBudgets.rest).toEqual({ cpuPercent: 0.2, wakeupsPerSecond: 1 });
  });
});
