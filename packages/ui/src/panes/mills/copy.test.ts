import { describe, expect, it } from "vitest";
import { missingLine, probedLine, tallyLine } from "./copy.ts";

describe("the mills words", () => {
  it("names the exact capability a class misses and counts only what happened", () => {
    expect(missingLine("loop", ["tools", "decodeTokensPerSecond"])).toBe(
      "not loop: needs tool calls and decode measured on this node",
    );
    expect(missingLine("decide", ["somethingNew"])).toBe("not decide: needs somethingNew");
    expect(tallyLine({ parcels: 1, mills: 1, down: 0, loaded: 0, market: 0 })).toBe(
      "1 parcel · 1 mill · 0 loaded",
    );
    expect(probedLine("spark-ad4d", [])).toBe("spark-ad4d looked at again · no mill to probe");
  });
});
