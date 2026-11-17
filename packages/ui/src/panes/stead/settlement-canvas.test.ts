import { emptyHabitat, withCreatures } from "@keywork-app/habitat";
import { composeStead } from "@keywork-app/habitat/render";
import { describe, expect, it } from "vitest";
import { fitCanvas } from "./painter.ts";

describe("neighborhood canvas resolution", () => {
  it("keeps high-density backing storage bounded without shrinking the world or its hit coordinates", () => {
    const slugs = Array.from({ length: 16 }, (_, index) => `resident-${index}`);
    const world = withCreatures(
      emptyHabitat(),
      slugs.map((slug) => ({ slug, name: slug })),
      "2026-11-17T12:00:00Z",
    );
    const scene = composeStead(world, Date.parse("2026-11-17T12:00:00Z"), {
      courtSlugs: slugs,
      workshops: Object.fromEntries(slugs.map((slug) => [slug, "gable" as const])),
    });
    const ordinary = fitCanvas(800, scene, 1);
    for (const dpr of [1, 2, 3, 4, 8]) {
      const fit = fitCanvas(800, scene, dpr);
      expect(fit.artWidth * fit.scale).toBeLessThanOrEqual(8192);
      expect(Number.isInteger(fit.scale)).toBe(true);
      expect(fit.cssWidth).toBe(ordinary.cssWidth);
      expect(fit.cssHeight).toBe(ordinary.cssHeight);
      expect(fit.cssPerArt).toBe(ordinary.cssPerArt);
    }
  });
});
