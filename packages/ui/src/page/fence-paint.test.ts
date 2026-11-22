import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syntaxClassPrefix } from "../theme/code.ts";
import { syntaxKeys } from "../theme/sections.ts";
import {
  fenceIsPaintable,
  fenceLanguage,
  fenceLanguageName,
  largestPaintedFence,
  paintFence,
} from "./fence-paint.ts";

describe("fence languages", () => {
  it("reads the language from the first word of the info string", () => {
    expect(fenceLanguageName("ts title=example.ts")).toBe("ts");
    expect(fenceLanguageName("  python ")).toBe("python");
    expect(fenceLanguageName(undefined)).toBe("");
  });

  it.each([
    ["ts", "TypeScript"],
    ["TypeScript", "TypeScript"],
    ["tsx", "TSX"],
    ["c", "C++"],
  ])("finds %s as %s", (name, language) => {
    expect(fenceLanguage(name)?.name).toBe(language);
  });

  it("leaves languages the app has no grammar for plain", () => {
    expect(fenceLanguage("")).toBeUndefined();
    expect(fenceLanguage("zork")).toBeUndefined();
  });
});

describe("paintFence", () => {
  it("splits code into runs that keep every character and carry the syntax classes", async () => {
    const code = 'export function greet(name: string): string {\n  return "hello, " + name;\n}';
    const runs = (await paintFence("ts", code)) ?? [];
    expect(runs.map((run) => run.text).join("")).toBe(code);
    expect(runs.find((run) => run.text === "export")?.classes).toBe(`${syntaxClassPrefix}keyword`);
    expect(runs.find((run) => run.text === '"hello, "')?.classes).toBe(
      `${syntaxClassPrefix}string`,
    );
  });

  it("leaves a block too long to paint within a frame plain", async () => {
    const huge = "const a = 1;\n".repeat(largestPaintedFence / 10);
    expect(fenceIsPaintable("ts", huge)).toBe(false);
    expect(await paintFence("ts", huge)).toBeUndefined();
    expect(fenceIsPaintable("ts", "const a = 1;")).toBe(true);
  });

  it("has a page.css ink for every syntax class it can paint", () => {
    const css = readFileSync(join(import.meta.dirname, "page.css"), "utf8");
    for (const key of syntaxKeys) {
      expect(css).toContain(`.${syntaxClassPrefix}${key} {\n  color: var(--kw-syntax-${key});`);
    }
  });
});
