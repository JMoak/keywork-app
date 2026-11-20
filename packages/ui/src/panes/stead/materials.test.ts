import { materialProfiles, type Skin, validateSkin } from "@keywork-app/habitat";
import { forcedPalette, resolvePalette, tokensRead } from "@keywork-app/habitat/render";
import { loadSkin } from "@keywork-app/habitat/skins";
import { describe, expect, it } from "vitest";
import { gallery, keyworkDay, keyworkNight, themeVariables } from "../../theme/index.ts";
import { palettesOf } from "./painter.ts";
import { sourceOfTheme } from "./theme-source.ts";

describe("native creature materials", () => {
  it("keeps authored material pigments distinct from coat color in every theme", () => {
    for (const theme of gallery) {
      const source = sourceOfTheme(theme);
      for (const material of materialProfiles) {
        const first = resolvePalette(source, { material, hueStop: 1 });
        const second = resolvePalette(source, { material, hueStop: 2 });
        const legacy = resolvePalette(source, { hueStop: 1 });
        expect(first).toHaveLength(16);
        expect(
          first.slice(1).every((color) => /^#[0-9a-f]{6}$/i.test(color)),
          theme.name,
        ).toBe(true);
        expect(first.slice(1, 5)).toEqual(second.slice(1, 5));
        expect(first.slice(10, 13)).toEqual(legacy.slice(10, 13));
        expect(first).not.toEqual(legacy);
        expect(resolvePalette(source, { material, forcedColors: true })).toBe(forcedPalette);
        expect(resolvePalette(source, { material, world: true })).toEqual(
          resolvePalette(source, { world: true }),
        );
      }
    }
  });

  it("keeps porcelain warm in both house themes and identity variation in botanical markings", () => {
    for (const theme of [keyworkDay, keyworkNight]) {
      const source = sourceOfTheme(theme);
      const first = resolvePalette(source, { material: "porcelain", hueStop: 1 });
      const second = resolvePalette(source, { material: "porcelain", hueStop: 2 });
      const color = first[3] ?? "";
      const red = Number.parseInt(color.slice(1, 3), 16);
      const green = Number.parseInt(color.slice(3, 5), 16);
      const blue = Number.parseInt(color.slice(5, 7), 16);
      expect(red).toBeGreaterThan(green);
      expect(green).toBeGreaterThan(blue);
      expect(first.slice(1, 10)).toEqual(second.slice(1, 10));
      expect(first[13]).not.toBe(second[13]);
    }
  });

  it("invalidates material palette caches when art pigments change and separates material families", () => {
    const source = sourceOfTheme(keyworkNight);
    const first = palettesOf(source, "day", undefined, false, undefined);
    expect(first.coat(1, "leaf")).toBe(first.coat(1, "leaf"));
    expect(first.coat(1, "leaf")).not.toEqual(first.coat(1, "porcelain"));
    const changed = {
      ...source,
      read: (name: string) => (name === "--kw-art-cream" ? "#f8e6b1" : source.read(name)),
    };
    const next = palettesOf(changed, "day", undefined, false, first);
    expect(next).not.toBe(first);
    expect(next.coat(1, "porcelain")).not.toEqual(first.coat(1, "porcelain"));
    for (const name of Object.keys(themeVariables(keyworkNight)).filter((key) =>
      key.startsWith("--kw-art-"),
    ))
      expect(tokensRead).toContain(name);
  });

  it("validates material metadata without requiring it on legacy skins", () => {
    const loaded = loadSkin("kid");
    if (!loaded.ok) throw new Error("Missing native skin");
    expect(validateSkin(loaded.skin)).toEqual([]);
    expect(validateSkin({ ...loaded.skin, material: "glitter" } as unknown as Skin)).toContain(
      "unknown material profile glitter",
    );
  });
});
