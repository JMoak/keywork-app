import { describe, expect, it } from "vitest";
import {
  budgetCells,
  budgetReadout,
  curingCell,
  curingRampCells,
  curingReadout,
  curingWord,
  provenanceCell,
} from "./density.ts";

const glyphs = (cells: readonly { glyph: string }[]): string =>
  cells.map((cell) => cell.glyph).join("");

describe("curing as density", () => {
  it("maps the four stages onto the ramp, fresh lightest and settled fullest", () => {
    expect([0, 1, 2, 3].map((stage) => curingCell(stage as 0 | 1 | 2 | 3))).toEqual([
      { glyph: "░", level: "light" },
      { glyph: "▒", level: "medium" },
      { glyph: "▓", level: "heavy" },
      { glyph: "█", level: "full" },
    ]);
    expect([0, 1, 2, 3].map((stage) => curingWord(stage as 0 | 1 | 2 | 3))).toEqual([
      "fresh",
      "curing",
      "cured",
      "settled",
    ]);
  });

  it("renders a layer's tally as each stage's share of the ramp", () => {
    expect(glyphs(curingRampCells({ 0: 2, 1: 2, 2: 2, 3: 2 }))).toBe("░░▒▒▓▓██");
    expect(glyphs(curingRampCells({ 0: 8, 1: 0, 2: 0, 3: 0 }))).toBe("░░░░░░░░");
    expect(glyphs(curingRampCells({ 0: 1, 1: 0, 2: 0, 3: 7 }))).toBe("░███████");
  });

  it("keeps every present stage visible even when its share rounds to nothing", () => {
    expect(glyphs(curingRampCells({ 0: 1, 1: 1, 2: 1, 3: 97 }))).toBe("░▒▓█████");
    expect(curingRampCells({ 0: 1, 1: 1, 2: 1, 3: 97 })).toHaveLength(8);
  });

  it("shows an empty ramp for a layer with no notes and reads the tally aloud", () => {
    expect(glyphs(curingRampCells({ 0: 0, 1: 0, 2: 0, 3: 0 }))).toBe("········");
    expect(curingReadout({ 0: 2, 1: 0, 2: 1, 3: 0 })).toBe("2 fresh · 1 cured");
  });
});

describe("provenance as density", () => {
  it("sets the user full, the agent heavy and untrusted light", () => {
    expect(provenanceCell("user")).toEqual({ glyph: "█", level: "full" });
    expect(provenanceCell("agent")).toEqual({ glyph: "▓", level: "heavy" });
    expect(provenanceCell("untrusted")).toEqual({ glyph: "░", level: "light" });
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
