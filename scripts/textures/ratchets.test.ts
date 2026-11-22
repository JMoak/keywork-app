import { describe, expect, it } from "vitest";
import { coverageGaps, loosenings, parseRatchets, type Ratchets, regressions } from "./ratchets.ts";

const held: Ratchets = {
  "T2.floodDraftChars": { value: 33, better: "lower", why: "the placeholder, never the payload" },
  "T6.minMarginLc.keywork-day": { value: 13.1, better: "higher", why: "headroom" },
};

describe("the texture ratchets", () => {
  it("refuses a ratchet without a written why or a direction", () => {
    expect(() => parseRatchets({ "T1.samples": { value: 3, better: "higher", why: " " } })).toThrow(
      'ratchet "T1.samples" needs a written why',
    );
    expect(() => parseRatchets({ "T1.samples": { value: 3, better: "up", why: "x" } })).toThrow(
      'needs better: "higher" or "lower"',
    );
    expect(() => parseRatchets({ samples: { value: 3, better: "higher", why: "x" } })).toThrow(
      "must be named T<n>.<measure>",
    );
  });

  it("names a texture that has no ratchet", () => {
    expect(coverageGaps(held)).toEqual([
      "T1 has no ratchet; a texture without one is an aspiration",
      "T7 has no ratchet; a texture without one is an aspiration",
      "T8 has no ratchet; a texture without one is an aspiration",
    ]);
  });

  it("fails a measurement on the worse side of its ratchet in either direction", () => {
    expect(
      regressions(held, { "T2.floodDraftChars": 33, "T6.minMarginLc.keywork-day": 13.1 }),
    ).toEqual([]);
    expect(
      regressions(held, { "T2.floodDraftChars": 34, "T6.minMarginLc.keywork-day": 12 }),
    ).toEqual([
      "T2.floodDraftChars regressed to 34; the ratchet holds 33 (lower is better)",
      "T6.minMarginLc.keywork-day regressed to 12; the ratchet holds 13.1 (higher is better)",
    ]);
    expect(regressions(held, { "T9.unknown": 1 })).toEqual([
      "T9.unknown measures 1 but records no ratchet",
    ]);
  });

  it("refuses a loosening against the committed file unless the why is rewritten", () => {
    const loosened = {
      ...held,
      "T2.floodDraftChars": {
        value: 40,
        better: "lower",
        why: "the placeholder, never the payload",
      },
    } as const;
    expect(loosenings(loosened, held)).toEqual([
      "T2.floodDraftChars loosened from 33 to 40 without a new why",
    ]);
    const justified = {
      ...loosened,
      "T2.floodDraftChars": { value: 40, better: "lower", why: "placeholders now carry the type" },
    } as const;
    expect(loosenings(justified, held)).toEqual([]);
    expect(loosenings({ "T2.floodDraftChars": justified["T2.floodDraftChars"] }, held)).toEqual([
      "T6.minMarginLc.keywork-day was dropped; a ratchet only ever tightens",
    ]);
  });
});
