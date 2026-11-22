import { describe, expect, it } from "vitest";
import { findColorLiterals } from "./check-colors.ts";

describe("check:colors", () => {
  it("finds hex and functional color literals with their line", () => {
    expect(
      findColorLiterals(['const a = "#1a1b26";', "b: var(--kw-text)", "c: rgb(0 0 0)"].join("\n")),
    ).toEqual(["line 1: #1a1b26", "line 3: rgb("]);
  });

  it("passes token references", () => {
    expect(findColorLiterals("background: var(--kw-background); color: var(--kw-text);")).toEqual(
      [],
    );
  });
});
