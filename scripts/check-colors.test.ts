import { describe, expect, it } from "vitest";
import { findColorLiterals, styledPath } from "./check-colors.ts";

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

  it("scans the renderer but not the flavor mapping or tests", () => {
    expect(styledPath("packages/ui/src/panes/conversation.tsx")).toBe(true);
    expect(styledPath("packages/ui/src/app.css")).toBe(true);
    expect(styledPath("packages/ui/src/flavor/tokens.ts")).toBe(false);
    expect(styledPath("packages/ui/src/app.test.tsx")).toBe(false);
    expect(styledPath("packages/desktop/src/main/index.ts")).toBe(false);
  });
});
