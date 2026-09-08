import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { apcaLc } from "./contrast.ts";
import { keyworkDay, keyworkNight } from "./flavors.ts";
import { contrastFailures, parseFlavor } from "./schema.ts";
import { flavorStylesheet, flavorVariables, variablesOfStylesheet } from "./variables.ts";

describe("parseFlavor", () => {
  it("accepts both shipped flavors with no contrast failures", () => {
    expect(contrastFailures(keyworkNight)).toEqual([]);
    expect(contrastFailures(keyworkDay)).toEqual([]);
    expect(keyworkDay.appearance).toBe("light");
  });

  it("refuses a flavor below the floor with keywork's exact message shape", () => {
    const washedOut = {
      ...keyworkNight,
      name: "washed-out",
      tokens: { ...keyworkNight.tokens, text: "#3a3f5c" },
    };
    expect(() => parseFlavor(washedOut)).toThrow(
      /^flavor "washed-out" fails the contrast floor:\n {2}text on background measures Lc \d+\.\d, needs at least 60\n/,
    );
    expect(() => parseFlavor(washedOut)).toThrow(
      /raise the ink or deepen the ground, then reload it\.$/,
    );
  });

  it("refuses a malformed shape naming the path", () => {
    expect(() =>
      parseFlavor({ ...keyworkNight, tokens: { ...keyworkNight.tokens, accent: "purple" } }),
    ).toThrow("flavor file does not fit the schema at tokens.accent: colors must be #rrggbb");
  });

  it("measures light ink on dark ground and dark ink on light ground symmetrically enough", () => {
    expect(apcaLc("#c0caf5", "#1a1b26")).toBeGreaterThan(60);
    expect(apcaLc("#2b3150", "#e9ebf2")).toBeGreaterThan(60);
    expect(apcaLc("#1a1b26", "#1a1b26")).toBe(0);
  });
});

describe("flavorVariables", () => {
  it("maps every token, three ramp stops, the density mapping, the appearance and the fonts", () => {
    const variables = flavorVariables(keyworkNight);
    expect(variables["--kw-background"]).toBe("#1a1b26");
    expect(variables["--kw-panel-lift"]).toBe("#24283b");
    expect(variables["--kw-ramp-3"]).toBe("#7dcfff");
    expect(variables["--kw-density-full"]).toBe("var(--kw-accent)");
    expect(variables["--kw-density-light"]).toBe("var(--kw-text-dim)");
    expect(variables["--kw-appearance"]).toBe("dark");
    expect(variables["--kw-font-prose"]).toContain("serif");
  });

  it("repeats the last ramp stop when a flavor declares fewer than three", () => {
    const flat = { ...keyworkNight, tokens: { ...keyworkNight.tokens, ramp: ["#bb9af7"] } };
    expect(flavorVariables(flat)["--kw-ramp-3"]).toBe("#bb9af7");
  });

  it("is the single source the default stylesheet is derived from", async () => {
    const css = readFileSync(
      join(process.cwd(), "packages/ui/src/flavor/keywork-night.css"),
      "utf8",
    );
    expect(variablesOfStylesheet(css)).toEqual(flavorVariables(keyworkNight));
    expect(css).toBe(flavorStylesheet(keyworkNight));
  });
});
