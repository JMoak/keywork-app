import { describe, expect, it } from "vitest";
import { decoKit } from "./kits/index.ts";
import { backdropOf } from "./sky.ts";

const view = { scale: 2, width: 1008, height: 580, depth: 112, slab: 24 };

describe("the sky", () => {
  it("draws the rays before the sun itself, so the disc sits on top", () => {
    const rects = backdropOf(decoKit.colours.night, view);
    const lastRay = rects.findLastIndex((rect) => rect.alpha !== undefined);
    const firstDisc = rects.findIndex((rect) => rect.role === "orb" && rect.alpha === undefined);
    expect(lastRay).toBeLessThan(firstDisc);
  });
});
