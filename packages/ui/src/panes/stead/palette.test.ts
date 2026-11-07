import { describe, expect, it } from "vitest";
import { gallery } from "../../theme/index.ts";
import {
  resolveGlyphPalette,
  resolvePalette,
  resolveSky,
  unresolvedRoles,
} from "./habitat-render.ts";
import { fitCanvas, paletteSourceOf, palettesOf } from "./painter.ts";
import { sourceOfTheme } from "./theme-source.ts";

const hex = /^#[0-9a-f]{6}$/;
const phases = ["night", "dawn", "day", "dusk"] as const;
const visibleStep = 0.02;

describe("the palette across the gallery", () => {
  it("resolves every role of every theme to a hex color, with tone 4 a visible step above tone 2", () => {
    expect(gallery.length).toBeGreaterThan(10);
    for (const theme of gallery) {
      const source = sourceOfTheme(theme);
      for (const hueStop of [undefined, 1, 2, 3]) {
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

  it("falls back to the house theme when no theme variables are applied, and caches by token values", () => {
    const source = paletteSourceOf(document.body);
    expect(source.read("--kw-background")).toMatch(hex);
    expect(source.appearance).toBe("dark");
    const first = palettesOf(source, "day", "autumn", false, undefined);
    const again = palettesOf(source, "day", "autumn", false, first);
    expect(again).toBe(first);
    expect(palettesOf(source, "night", "autumn", false, first)).not.toBe(first);
    expect(first.coat(1)).toBe(first.coat(1));
    expect(first.coat(1)).not.toEqual(first.coat(2));
    const forced = palettesOf(source, "day", "autumn", true, undefined);
    expect(forced.world[9]).toBe("CanvasText");
    expect(forced.sky).toEqual({ zenith: "Canvas", horizon: "Canvas" });
  });

  it("keeps the integer scale of the device pixel ratio and lets a wide stead scroll", () => {
    const fit = fitCanvas(0, { width: 200, height: 72, groundY: 64 } as never, 1);
    expect(fit.scale).toBe(2);
    expect(fit.artWidth).toBe(320);
    expect(fit.cssWidth).toBe(640);
    expect(fit.cssHeight).toBe(136);
    expect(fit.cssPerArt).toBe(2);
    const wide = fitCanvas(300, { width: 400, height: 72, groundY: 64 } as never, 1);
    expect(wide.scale).toBe(2);
    expect(wide.artWidth).toBe(400);
    expect(wide.cssWidth).toBe(800);
    const retina = fitCanvas(300, { width: 100, height: 72, groundY: 64 } as never, 2);
    expect(retina.scale).toBe(4);
    expect(retina.cssPerArt).toBe(2);
    expect(retina.artWidth).toBe(150);
  });
});

function luminance(color: string): number {
  const value = Number.parseInt(color.slice(1), 16);
  const channel = (shift: number): number => ((value >> shift) & 0xff) / 255;
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}
