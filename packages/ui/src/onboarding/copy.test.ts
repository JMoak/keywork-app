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

  it("teaches esc as not now wherever the stage waits and never as a way to make the creature", () => {
    const waiting = [copy.eggKeys, copy.retryKeys, copy.meetKeys, copy.connectKeys];
    expect(copy.notNowKey).toBe("esc not now");
    expect(copy.eggKeys).toContain(copy.notNowKey);
    expect(copy.retryKeys).toContain(copy.notNowKey);
    for (const line of waiting) expect(line).not.toMatch(/esc (skips|keeps|hatches)/);
  });
});
