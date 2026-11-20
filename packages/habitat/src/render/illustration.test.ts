import { describe, expect, it } from "vitest";
import {
  type Illustration,
  illustrationFrame,
  illustrationPixel,
  placeIllustration,
  validateIllustration,
} from "./illustration.ts";

const portrait: Illustration = {
  id: "ink",
  src: "ink.png",
  source: { width: 400, height: 400 },
  footprint: { width: 48, height: 52, groundLine: 51 },
  anchor: { x: 0.5, y: 1 },
  facing: "left",
};
const first = { x: 30, y: 15, width: 4, height: 2 };
const second = { ...first, x: 150 };
const final = { ...first, y: 175 };
const animation = { frames: [first, second, final], ms: [120, 80, 300], still: 1, loop: true };

describe("illustration geometry and authored time", () => {
  it("fits the logical footprint and foot contact independently of source resolution", () => {
    const destination = { x: 0, y: 6, width: 96, height: 96 };
    for (const edge of [40, 400, 1600]) {
      const art = { ...portrait, source: { width: edge, height: edge } };
      const crop = illustrationFrame(art);
      if (!crop) throw new Error("Missing neutral illustration");
      expect(placeIllustration(art, crop, { width: 96, height: 104 })).toEqual({
        destination,
        crop,
        mirrored: false,
      });
    }
    const centered = placeIllustration(
      portrait,
      { x: 0, y: 0, ...portrait.source },
      { width: 200, height: 104 },
    );
    expect(centered.destination).toEqual({ ...destination, x: 52 });
  });

  it("keeps the same off-center foot planted when turned, including the transparent margin below it", () => {
    const art = {
      ...portrait,
      anchor: { x: 0.25, y: 0.75 },
      footprint: { width: 100, height: 100, groundLine: 80 },
    };
    const original = placeIllustration(art, first, art.footprint);
    const flipped = placeIllustration(art, first, art.footprint, "right");
    expect(original.mirrored).toBe(false);
    expect(flipped.mirrored).toBe(true);
    expect(original.destination.x + original.destination.width * 0.25).toBeCloseTo(50);
    expect(flipped.destination.x + flipped.destination.width * 0.75).toBeCloseTo(50);
    expect(original.destination.y + original.destination.height * 0.75).toBeCloseTo(80);
    expect(flipped.destination.y).toBe(original.destination.y);
    expect(flipped.destination.width).toBe(original.destination.width);
    expect(flipped.destination.x).toBeCloseTo(0);
  });

  it("maps exact pixels of a cropped and reflected frame with half-open bounds", () => {
    const placement = {
      crop: first,
      destination: { x: 10, y: 20, width: 40, height: 20 },
      mirrored: false,
    };
    expect(illustrationPixel(placement, { x: 10, y: 20 })).toEqual({ x: 30, y: 15 });
    expect(illustrationPixel(placement, { x: 49.9, y: 39.9 })).toEqual({ x: 33, y: 16 });
    expect(illustrationPixel({ ...placement, mirrored: true }, { x: 10, y: 20 })).toEqual({
      x: 33,
      y: 15,
    });
    expect(illustrationPixel({ ...placement, mirrored: true }, { x: 49.9, y: 39.9 })).toEqual({
      x: 30,
      y: 16,
    });
    for (const point of [
      { x: 9.99, y: 20 },
      { x: 50, y: 20 },
      { x: 10, y: 40 },
      { x: NaN, y: 20 },
    ])
      expect(illustrationPixel(placement, point)).toBeUndefined();
  });

  it("exposes only authored motion, observes each hold, and selects a deliberate still", () => {
    const art: Illustration = {
      ...portrait,
      still: second,
      clips: { idle: animation, nap: { ...animation, loop: false } },
    };
    expect(illustrationFrame(art)).toEqual(second);
    expect(illustrationFrame(portrait)).toEqual({ x: 0, y: 0, ...portrait.source });
    expect(illustrationFrame(art, "work", 130)).toBeUndefined();
    expect(illustrationFrame(portrait, "idle", 130)).toBeUndefined();
    for (const [time, expected] of [
      [0, first],
      [119, first],
      [120, second],
      [200, final],
      [499, final],
      [500, first],
      [620, second],
    ] as const)
      expect(illustrationFrame(art, "idle", time)).toEqual(expected);
    expect(illustrationFrame(art, "nap", 9000)).toEqual(final);
    expect(illustrationFrame(art, "idle", 9000, true)).toEqual(second);
  });

  it("rejects malformed image bounds, anchors, invalid crops and malformed timing before decode", () => {
    validateIllustration({ ...portrait, still: first, clips: { idle: animation } });
    for (const art of [
      { ...portrait, src: "" },
      { ...portrait, source: { width: 4096, height: 10 } },
      { ...portrait, source: { width: 1, height: 1.1 } },
      { ...portrait, anchor: { x: 1.01, y: 0 } },
      { ...portrait, footprint: { width: 48, height: 52, groundLine: 53 } },
      {
        ...portrait,
        anchor: { x: 0.5, y: 0.9 },
        footprint: { width: 48, height: 52, groundLine: 52 },
      },
      { ...portrait, still: { ...first, x: 397 } },
      { ...portrait, still: { ...first, y: 1.5 } },
      { ...portrait, clips: { idle: { ...animation, ms: [100] } } },
      { ...portrait, clips: { idle: { ...animation, ms: [10, 0, 10] } } },
      { ...portrait, clips: { idle: { ...animation, still: 3 } } },
      {
        ...portrait,
        clips: { idle: { ...animation, frames: [first, second, { ...first, x: -1 }] } },
      },
    ])
      expect(() => validateIllustration(art)).toThrow();
    expect(() => placeIllustration(portrait, first, { width: NaN, height: 52 })).toThrow();
  });
});
