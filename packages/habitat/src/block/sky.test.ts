import { describe, expect, it } from "vitest";
import { decoKit, kits } from "./kits/index.ts";
import { backdropOf, rayAlpha } from "./sky.ts";

const view = { scale: 2, width: 1008, height: 580, depth: 112, slab: 24 };

describe("the sky", () => {
  it("draws the sun's rays, faint, for a kit whose colours ask for them, and for no other", () => {
    for (const kit of kits) {
      for (const appearance of ["night", "day"] as const) {
        const rays = backdropOf(kit.colours[appearance], view).filter(
          (rect) => rect.alpha !== undefined,
        );
        if (!kit.colours[appearance].orbRays) {
          expect(rays, `${kit.id} ${appearance}`).toEqual([]);
          continue;
        }
        expect(rays.length, `${kit.id} ${appearance}`).toBeGreaterThan(0);
        expect(new Set(rays.map((ray) => ray.alpha))).toEqual(new Set([rayAlpha[appearance]]));
        expect(rays.every((ray) => ray.role === "orb" && ray.height === view.scale)).toBe(true);
      }
    }
    expect(decoKit.colours.night.orbRays && decoKit.colours.day.orbRays).toBe(true);
  });

  it("draws the rays before the sun itself, so the disc sits on top", () => {
    const rects = backdropOf(decoKit.colours.night, view);
    const lastRay = rects.findLastIndex((rect) => rect.alpha !== undefined);
    const firstDisc = rects.findIndex((rect) => rect.role === "orb" && rect.alpha === undefined);
    expect(lastRay).toBeLessThan(firstDisc);
  });
});
