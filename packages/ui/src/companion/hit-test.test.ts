import { describe, expect, it } from "vitest";
import { emptyMask, insideWithHysteresis, maskHit, nearMask, unionMask } from "./hit-test.ts";

const square = unionMask(emptyMask(40, 40), [{ x: 10, y: 10, width: 10, height: 10 }]);

describe("hit testing", () => {
  it("hits only opaque pixels", () => {
    expect(maskHit(square, { x: 15, y: 15 })).toBe(true);
    expect(maskHit(square, { x: 9, y: 15 })).toBe(false);
    expect(maskHit(square, { x: -1, y: 15 })).toBe(false);
    expect(maskHit(square, { x: 100, y: 100 })).toBe(false);
  });

  it("enters at two DIP and leaves at six, so hover never flickers at the edge", () => {
    expect(nearMask(square, { x: 8, y: 15 }, 2)).toBe(true);
    expect(nearMask(square, { x: 7, y: 15 }, 2)).toBe(false);
    expect(insideWithHysteresis(square, { x: 7, y: 15 }, false)).toBe(false);
    expect(insideWithHysteresis(square, { x: 7, y: 15 }, true)).toBe(true);
    expect(insideWithHysteresis(square, { x: 3, y: 15 }, true)).toBe(false);
    expect(insideWithHysteresis(square, { x: 15, y: 15 }, false)).toBe(true);
  });

  it("unions the chrome rectangles into the creature mask", () => {
    const withBadge = unionMask(square, [{ x: 30, y: 2, width: 6, height: 6 }]);
    expect(maskHit(withBadge, { x: 32, y: 4 })).toBe(true);
    expect(maskHit(square, { x: 32, y: 4 })).toBe(false);
  });
});
