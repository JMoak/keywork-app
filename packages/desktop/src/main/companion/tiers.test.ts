import { describe, expect, it } from "vitest";
import { calmContext, ceilingFor, effectiveTier } from "./tiers.ts";

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
