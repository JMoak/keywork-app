import { afterEach, describe, expect, it } from "vitest";
import { chromeWeight, gapCells, rootAttribute, themeName } from "./root-attributes.ts";

const root = document.documentElement;

afterEach(async () => {
  for (const name of ["data-chrome", "data-gap", "data-theme"]) root.removeAttribute(name);
  await settled();
});

describe("root attributes", () => {
  it("default to the seams weight, no gap, and no theme name", () => {
    expect(chromeWeight()).toBe("seams");
    expect(gapCells()).toBe(0);
    expect(themeName()).toBeUndefined();
  });

  it("follow the root as the theme rewrites it", async () => {
    const theme = rootAttribute("data-theme");
    root.setAttribute("data-chrome", "borderless");
    root.setAttribute("data-gap", "2");
    root.setAttribute("data-theme", "keywork-day");
    await settled();
    expect(chromeWeight()).toBe("borderless");
    expect(gapCells()).toBe(2);
    expect(theme()).toBe("keywork-day");
  });

  it("refuse weights and gaps the schema does not know", async () => {
    root.setAttribute("data-chrome", "chunky");
    root.setAttribute("data-gap", "-1");
    await settled();
    expect(chromeWeight()).toBe("seams");
    expect(gapCells()).toBe(0);
  });
});

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
