import { describe, expect, it } from "vitest";
import { derivedTextFaint } from "./complete.ts";
import { wcagContrast } from "./contrast.ts";
import {
  groundsOf,
  legibleInks,
  textTiers,
  tierFloors,
  tierStep,
  wcagMark,
  wcagText,
  weakestContrast,
} from "./legible.ts";
import { oklabOf } from "./oklab.ts";
import type { Theme } from "./schema.ts";
import { gallery, keyworkNight, themeNamed } from "./themes.ts";
import { themeVariables } from "./variables.ts";

const surfaces = ["--kw-background", "--kw-panel", "--kw-panel-lift"] as const;

const wordRoles = [
  "--kw-text",
  "--kw-text-mid",
  "--kw-text-dim",
  "--kw-text-faint",
  "--kw-accent",
  "--kw-accent-soft",
  "--kw-success",
  "--kw-error",
  "--kw-ramp-1",
  "--kw-ramp-2",
  "--kw-ramp-3",
] as const;

const markRoles = ["--kw-border-focus", "--kw-scrollbar"] as const;

const shipped = gallery.map((theme) => [theme.name, theme] as const);

describe("every shipped theme is legible at WCAG AA", () => {
  it.each(shipped)("%s holds every word role at 4.5:1 on every surface", (_, theme) => {
    expect(shortfalls(theme, wordRoles, wcagText)).toEqual([]);
  });

  it.each(shipped)("%s holds the focus ring and the scrollbar at 3:1", (_, theme) => {
    expect(shortfalls(theme, markRoles, wcagMark)).toEqual([]);
  });

  it.each(shipped)("%s keeps the text tiers in their declared order", (_, theme) => {
    const variables = themeVariables(theme);
    const grounds = groundsOf(theme.tokens);
    const ladder = ["--kw-text-faint", "--kw-text-dim", "--kw-text-mid", "--kw-text"].map((role) =>
      weakestContrast(variables[role] ?? "", grounds),
    );
    for (const [quieter, louder] of pairs(ladder)) {
      expect(louder + roundingSlack).toBeGreaterThanOrEqual(quieter);
    }
  });

  it.each(shipped)("%s keeps each lifted ink's hue", (_, theme) => {
    const inks = legibleInks(theme);
    const declared = theme.tokens;
    for (const role of ["accent", "accentSoft", "success", "error", "borderFocus"] as const) {
      expect(hueDrift(declared[role], inks[role]), role).toBeLessThan(hueSlackDegrees);
    }
    for (const tier of ["textDim", "textMid"] as const) {
      expect(hueDrift(declared[tier], inks[tier]), tier).toBeLessThan(hueSlackDegrees);
    }
    declared.ramp.forEach((stop, index) => {
      expect(hueDrift(stop, inks.ramp[index] ?? ""), `ramp ${index}`).toBeLessThan(hueSlackDegrees);
    });
  });
});

describe("legibleInks", () => {
  it("leaves an ink that already reads alone", () => {
    const inks = legibleInks(keyworkNight);
    expect(inks.text).toBe(keyworkNight.tokens.text);
    expect(inks.accent).toBe(keyworkNight.tokens.accent);
    expect(inks.success).toBe(keyworkNight.tokens.success);
  });

  it("lifts the quiet tiers to a ladder that starts at AA and steps toward the text", () => {
    const inks = legibleInks(keyworkNight);
    const grounds = groundsOf(keyworkNight.tokens);
    const floors = tierFloors(weakestContrast(inks.text, grounds));
    expect(floors.textFaint).toBe(wcagText);
    expect(floors.textDim).toBeCloseTo(wcagText * tierStep);
    expect(floors.textMid).toBeCloseTo(wcagText * tierStep ** 2);
    for (const tier of textTiers) {
      const reached = weakestContrast(inks[tier], grounds);
      expect(reached).toBeGreaterThanOrEqual(floors[tier]);
      expect(reached).toBeLessThan(floors[tier] + liftSlack);
    }
  });

  it("squeezes the ladder under a text that leaves little room, never above it", () => {
    const room = wcagText * 1.1;
    const floors = tierFloors(room);
    expect(floors.textFaint).toBe(wcagText);
    expect(floors.textDim).toBeLessThan(floors.textMid);
    expect(floors.textMid).toBeLessThan(room);
  });

  it("darkens a light theme's washed ink toward black and brightens a dark one's toward white", () => {
    const pale = shippedTheme("nord-light");
    const lifted = legibleInks(pale).success;
    expect(oklabOf(lifted)[0]).toBeLessThan(oklabOf(pale.tokens.success)[0]);
    expect(weakestContrast(lifted, groundsOf(pale.tokens))).toBeGreaterThanOrEqual(wcagText);
    const night = legibleInks(keyworkNight).textDim;
    expect(oklabOf(night)[0]).toBeGreaterThan(oklabOf(keyworkNight.tokens.textDim)[0]);
  });

  it("derives the faint tier from the dim rung before lifting it", () => {
    const faint = legibleInks(keyworkNight).textFaint;
    expect(hueDrift(derivedTextFaint(keyworkNight.tokens), faint)).toBeLessThan(hueSlackDegrees);
  });

  it("answers the same object for the same theme", () => {
    expect(legibleInks(keyworkNight)).toBe(legibleInks(keyworkNight));
  });
});

const roundingSlack = 0.05;
const liftSlack = 0.1;
const hueSlackDegrees = 4;
const chromaWorthAHue = 0.03;

function shippedTheme(name: string): Theme {
  const theme = themeNamed(name);
  if (theme === undefined) throw new Error(`the gallery lost ${name}`);
  return theme;
}

function shortfalls(theme: Theme, roles: readonly string[], floor: number): string[] {
  const variables = themeVariables(theme);
  return roles.flatMap((role) =>
    surfaces.flatMap((surface) => {
      const ratio = wcagContrast(variables[role] ?? "", variables[surface] ?? "");
      return ratio >= floor ? [] : [`${role} on ${surface} measures ${ratio.toFixed(2)}:1`];
    }),
  );
}

function pairs(values: readonly number[]): [number, number][] {
  return values.slice(1).map((louder, index) => [values[index] ?? 0, louder]);
}

function hueDrift(before: string, after: string): number {
  const [, a1, b1] = oklabOf(before);
  const [, a2, b2] = oklabOf(after);
  if (Math.hypot(a1, b1) < chromaWorthAHue || Math.hypot(a2, b2) < chromaWorthAHue) return 0;
  const turn = Math.abs(Math.atan2(b1, a1) - Math.atan2(b2, a2)) * (180 / Math.PI);
  return Math.min(turn, 360 - turn);
}
