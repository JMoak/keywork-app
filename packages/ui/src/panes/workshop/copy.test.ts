import { describe, expect, it } from "vitest";
import { costWord, limitationLines, raisedWord, sealStep } from "./copy.ts";

describe("the workshop's words", () => {
  it("adds the sealing step to a bare host only, after what the node said", () => {
    expect(limitationLines("host", ["a", "b"])).toEqual(["a", "b", sealStep]);
    expect(limitationLines("sbx", ["a"])).toEqual(["a"]);
    expect(sealStep).toContain("install the sbx CLI");
    expect(sealStep).toContain("Windows Hypervisor Platform");
  });

  it("prices in USD with two decimals and never rounds a cost to nothing", () => {
    expect(costWord(undefined)).toBe("unknown");
    expect(costWord(0)).toBe("0.00 USD");
    expect(costWord(4_000_000)).toBe("under 0.01 USD");
    expect(costWord(420_000_000)).toBe("0.42 USD");
  });

  it("dates the raising in the house's own clock", () => {
    expect(raisedWord("2026-11-05T09:00:00.000Z", 0)).toBe("2026-11-05 09:00");
    expect(raisedWord("2026-11-05T23:30:00.000Z", 60)).toBe("2026-11-06 00:30");
    expect(raisedWord("not a date", 0)).toBe("an unknown time");
  });
});
