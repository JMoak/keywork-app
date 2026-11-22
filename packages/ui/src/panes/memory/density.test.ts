import { describe, expect, it } from "vitest";
import { budgetCells, budgetReadout, curingRampCells, oddsCell, ruleCell } from "./density.ts";

const glyphs = (cells: readonly { glyph: string }[]): string =>
  cells.map((cell) => cell.glyph).join("");

describe("curing as density", () => {
  it("renders a layer's tally as each stage's share of the ramp", () => {
    expect(glyphs(curingRampCells({ 0: 2, 1: 2, 2: 2, 3: 2 }))).toBe("░░▒▒▓▓██");
    expect(glyphs(curingRampCells({ 0: 8, 1: 0, 2: 0, 3: 0 }))).toBe("░░░░░░░░");
    expect(glyphs(curingRampCells({ 0: 1, 1: 0, 2: 0, 3: 7 }))).toBe("░███████");
  });

  it("keeps every present stage visible even when its share rounds to nothing", () => {
    expect(glyphs(curingRampCells({ 0: 1, 1: 1, 2: 1, 3: 97 }))).toBe("░▒▓█████");
    expect(curingRampCells({ 0: 1, 1: 1, 2: 1, 3: 97 })).toHaveLength(8);
  });
});

describe("a decision's odds as density", () => {
  it("steps the ramp by quarters of odds, a sure answer full and a coin toss light", () => {
    expect(glyphs([0, 0.3, 0.6, 0.8, 0.94, 1].map(oddsCell))).toBe("░▒▓███");
    expect(oddsCell(-1)).toEqual(oddsCell(0));
    expect(ruleCell()).toEqual({ glyph: "▓", level: "heavy" });
  });
});

describe("the prompt budget", () => {
  it("fills the level by the share of the budget the bootstrap used", () => {
    expect(glyphs(budgetCells(2048, 4096))).toBe("████····");
    expect(glyphs(budgetCells(0, 4096))).toBe("········");
    expect(glyphs(budgetCells(9000, 4096))).toBe("████████");
    expect(glyphs(budgetCells(10, 0))).toBe("········");
    expect(budgetReadout(2048, 4096)).toBe("prompt 2048 of 4096 tokens");
  });
});
