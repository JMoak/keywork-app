import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as copy from "./copy.ts";

const here = import.meta.dirname;

describe("the onboarding copy speaks in the creature's voice", () => {
  it.each(["copy.ts", "introduction.ts"])("%s has no exclamation mark and no emoji", (file) => {
    const source = readFileSync(join(here, file), "utf8");
    expect(source).not.toMatch(/!/);
    expect(source).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("teaches esc as not now on every step and never as a way to make the creature", () => {
    const stepKeys = [
      copy.nameKeys("Wren"),
      copy.skinKeys,
      copy.workshopKeys(true),
      copy.modelsKeys,
      copy.notMadeLine("no room"),
    ];
    expect(copy.notNowKey).toBe("esc not now");
    expect(copy.nameKeys("Wren")).toContain(copy.notNowKey);
    for (const line of stepKeys) expect(line).not.toMatch(/esc skips/);
  });
});
