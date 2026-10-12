import { describe, expect, it } from "vitest";
import { seamReach } from "../layout/index.ts";
import { gapCellRem, gapSeamReach } from "./gap.ts";

describe("gapSeamReach", () => {
  it("keeps the ordinary reach when the gap is narrower than it", () => {
    expect(gapSeamReach(0, 14)).toBe(seamReach);
    expect(gapSeamReach(1, 14)).toBe(seamReach);
  });

  it("widens to cover half the gap on each side so the whole gap grabs the seam", () => {
    const fourCells = 4 * gapCellRem * 14;
    expect(gapSeamReach(4, 14)).toBe(Math.ceil(fourCells / 2));
    expect(gapSeamReach(4, 14) * 2).toBeGreaterThanOrEqual(fourCells);
  });
});
