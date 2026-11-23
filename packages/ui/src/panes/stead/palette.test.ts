import { describe, expect, it } from "vitest";
import { gallery } from "../../theme/index.ts";
import {
  resolveGlyphPalette,
  resolvePalette,
  resolveSky,
  unresolvedRoles,
} from "./habitat-render.ts";
import { sourceOfTheme } from "./theme-source.ts";

const hex = /^#[0-9a-f]{6}$/;
const phases = ["night", "dawn", "day", "dusk"] as const;
const visibleStep = 0.02;

describe("the palette across the gallery", () => {
  it("resolves every role of every theme to a hex color, with tone 4 a visible step above tone 2", () => {
    expect(gallery.length).toBeGreaterThan(10);
    for (const theme of gallery) {
      const source = sourceOfTheme(theme);
      for (const hueStop of [undefined, 1, 2, 3, 4, 5, 6, 7, 8]) {
        const palette = resolvePalette(source, { hueStop });
        expect(unresolvedRoles(palette), `${theme.name} hue ${hueStop}`).toEqual([]);
        for (const color of palette.slice(1)) expect(color, theme.name).toMatch(hex);
        expect(new Set(palette.slice(1, 5)).size, `${theme.name} identity ramp`).toBe(4);
        const step = luminance(palette[4] as string) - luminance(palette[2] as string);
        expect(
          Math.abs(step),
          `${theme.name} hue ${hueStop}: tone 4 a step from tone 2`,
        ).toBeGreaterThan(visibleStep);
      }
      const world = resolvePalette(source, { world: true, season: "autumn" });
      expect(unresolvedRoles(world), theme.name).toEqual([]);
      for (const color of resolveGlyphPalette(source).slice(1)) expect(color).toMatch(hex);
      for (const phase of phases) {
        const sky = resolveSky(source, phase);
        expect(sky.zenith, `${theme.name} ${phase}`).toMatch(hex);
        expect(sky.horizon, `${theme.name} ${phase}`).toMatch(hex);
      }
    }
  });
});

function luminance(color: string): number {
  const value = Number.parseInt(color.slice(1), 16);
  const channel = (shift: number): number => ((value >> shift) & 0xff) / 255;
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}
