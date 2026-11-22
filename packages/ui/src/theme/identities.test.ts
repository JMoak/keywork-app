import { describe, expect, it } from "vitest";
import { identitiesFromTheRamp, identityCount } from "./identities.ts";
import { groundsOf, wcagText, weakestContrast } from "./legible.ts";
import { oklabDistance, oklabOf } from "./oklab.ts";
import type { Theme } from "./schema.ts";
import { terminalChromatics } from "./sections.ts";
import { gallery, keyworkDay, keyworkNight } from "./themes.ts";
import { themeVariables } from "./variables.ts";

const shipped = gallery.map((theme) => [theme.name, theme] as const);
const houseThemes = [keyworkNight, keyworkDay].map((theme) => [theme.name, theme] as const);
const clearlyApart = 0.07;

describe("eight identity inks", () => {
  it.each(shipped)(
    "%s sets every identity beyond the ramp clearly apart from the other seven",
    (_, theme) => {
      expect(crowdedPairs(identitiesOf(theme))).toEqual([]);
    },
  );

  it.each(houseThemes)(
    "%s continues violet, blue and cyan in the block world's teal, green, orange, pink, yellow",
    (_, theme) => {
      const beyond = identitiesOf(theme).slice(identitiesFromTheRamp);
      expect(beyond.map(blockWorldFamilyOf)).toEqual(["teal", "green", "orange", "pink", "yellow"]);
    },
  );

  it("lets a theme outside the gallery borrow its other five from its own terminal, farthest first", () => {
    const visitor: Theme = { ...keyworkNight, name: "visiting-night" };
    const identities = identitiesOf(visitor);
    const fromRamp = identities.slice(0, identitiesFromTheRamp);
    const terminal = terminalChromatics.map((key) => visitor.terminal[key]);
    expect(fromRamp).toEqual(identitiesOf(keyworkNight).slice(0, identitiesFromTheRamp));
    expect(new Set(identities).size).toBe(identityCount);
    for (const ink of identities.slice(identitiesFromTheRamp)) expect(terminal).toContain(ink);
    expect(identities[identitiesFromTheRamp]).toBe(farthestFrom(fromRamp, terminal));
  });

  it("lifts what a visiting light theme borrows until it reads at AA on every surface", () => {
    const visitor: Theme = { ...keyworkDay, name: "visiting-day" };
    const grounds = groundsOf(visitor.tokens);
    const borrowed = identitiesOf(visitor).slice(identitiesFromTheRamp);
    expect(borrowed).toHaveLength(identityCount - identitiesFromTheRamp);
    for (const ink of borrowed)
      expect(weakestContrast(ink, grounds), ink).toBeGreaterThanOrEqual(wcagText);
  });
});

const blockWorldFamilies = [
  { family: "orange", from: 40, to: 75 },
  { family: "yellow", from: 75, to: 115 },
  { family: "green", from: 115, to: 160 },
  { family: "teal", from: 160, to: 200 },
  { family: "pink", from: 325, to: 368 },
] as const;

function identitiesOf(theme: Theme): string[] {
  const variables = themeVariables(theme);
  return Array.from(
    { length: identityCount },
    (_, index) => variables[`--kw-ramp-${index + 1}`] ?? "",
  );
}

function crowdedPairs(identities: readonly string[]): string[] {
  return pairsReachingBeyondTheRamp(identities.length).flatMap(([near, far]) => {
    const apart = oklabDistance(identities[near] ?? "", identities[far] ?? "");
    return apart >= clearlyApart
      ? []
      : [`ramp-${near + 1} and ramp-${far + 1} stand ${apart.toFixed(3)} apart`];
  });
}

function pairsReachingBeyondTheRamp(count: number): [number, number][] {
  return Array.from({ length: count - identitiesFromTheRamp }, (_, index) => {
    const far = identitiesFromTheRamp + index;
    return Array.from({ length: far }, (_, near): [number, number] => [near, far]);
  }).flat();
}

function farthestFrom(worn: readonly string[], pool: readonly string[]): string | undefined {
  const gap = (ink: string): number => Math.min(...worn.map((stop) => oklabDistance(stop, ink)));
  return [...pool].sort((left, right) => gap(right) - gap(left))[0];
}

function blockWorldFamilyOf(ink: string): string {
  const [, a, b] = oklabOf(ink);
  const degrees = (Math.atan2(b, a) * 180) / Math.PI;
  const hue = degrees < 0 ? degrees + 360 : degrees;
  const within = ({ from, to }: { from: number; to: number }): boolean =>
    (hue >= from && hue < to) || (hue + 360 >= from && hue + 360 < to);
  return blockWorldFamilies.find(within)?.family ?? `hue ${hue.toFixed(0)}`;
}
