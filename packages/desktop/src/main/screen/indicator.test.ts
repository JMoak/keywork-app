import { describe, expect, it } from "vitest";
import {
  bannerSize,
  edgeThickness,
  indicatorLayout,
  placedStrip,
  type Rect,
  wholePixelArea,
} from "./indicator.ts";

const windowsMinimum = { width: 29, height: 33 };

const scales = [
  {
    percent: 100,
    scaleFactor: 1,
    workArea: { x: 0, y: 0, width: 1920, height: 1032 },
    pixels: { width: 1920, height: 1032 },
  },
  {
    percent: 133,
    scaleFactor: 1.3333333730697632,
    workArea: { x: 0, y: 0, width: 1920, height: 1044 },
    pixels: { width: 2560, height: 1392 },
  },
  {
    percent: 150,
    scaleFactor: 1.5,
    workArea: { x: 0, y: 0, width: 1707, height: 928 },
    pixels: { width: 2560, height: 1392 },
  },
] as const;

describe("indicatorLayout", () => {
  it("frames the area it is given with four edges and a banner under the top edge", () => {
    const layout = indicatorLayout({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(layout.edges).toEqual([
      { x: 0, y: 0, width: 1920, height: 4 },
      { x: 0, y: 1076, width: 1920, height: 4 },
      { x: 0, y: 4, width: 4, height: 1072 },
      { x: 1916, y: 4, width: 4, height: 1072 },
    ]);
    expect(layout.banner).toEqual({ x: 680, y: 4, width: 560, height: bannerSize.height });
  });

  for (const scale of scales) {
    it(`keeps every edge ${edgeThickness} DIP thick and inside the work area at ${scale.percent} percent`, () => {
      const { edges, banner } = indicatorLayout(scale.workArea, scale.scaleFactor);
      const [top, bottom, left, right] = edges;
      for (const strip of [top, bottom]) expect(strip?.height).toBe(edgeThickness);
      for (const strip of [left, right]) expect(strip?.width).toBe(edgeThickness);
      for (const strip of [...edges, banner]) {
        expect(inside(strip, scale.workArea)).toBe(true);
        expect((strip.x + strip.width) * scale.scaleFactor).toBeLessThanOrEqual(
          scale.pixels.width + 1e-3,
        );
        expect((strip.y + strip.height) * scale.scaleFactor).toBeLessThanOrEqual(
          scale.pixels.height + 1e-3,
        );
      }
    });

    it(`paints exactly each edge inside the work area when Windows grows its window at ${scale.percent} percent`, () => {
      for (const strip of indicatorLayout(scale.workArea, scale.scaleFactor).edges) {
        const granted = {
          width: Math.max(strip.width, windowsMinimum.width),
          height: Math.max(strip.height, windowsMinimum.height),
        };
        const placed = placedStrip(strip, granted, scale.workArea);
        expect(placed.bounds).toMatchObject(granted);
        expect(inside(placed.bounds, scale.workArea)).toBe(true);
        expect(placed.shape.width).toBe(strip.width);
        expect(placed.shape.height).toBe(strip.height);
        expect(inside(placed.shape, { ...placed.bounds, x: 0, y: 0 })).toBe(true);
        expect(placed.bounds.x + placed.shape.x).toBe(strip.x);
        expect(placed.bounds.y + placed.shape.y).toBe(strip.y);
      }
    });
  }
});

describe("wholePixelArea", () => {
  it("rounds the far edges in to whole physical pixels and keeps whole DIP", () => {
    expect(wholePixelArea({ x: 0, y: 0, width: 1707, height: 960 }, 1.5)).toEqual({
      x: 0,
      y: 0,
      width: 1706,
      height: 960,
    });
    expect(
      wholePixelArea({ x: 1920, y: 0, width: 1920, height: 1044 }, 1.3333333730697632),
    ).toEqual({ x: 1920, y: 0, width: 1920, height: 1044 });
  });
});

describe("placedStrip", () => {
  it("leaves a strip Windows did not grow exactly where it was asked", () => {
    const strip = { x: 0, y: 1028, width: 1920, height: 4 };
    expect(placedStrip(strip, strip, { x: 0, y: 0, width: 1920, height: 1032 })).toEqual({
      bounds: strip,
      shape: { x: 0, y: 0, width: 1920, height: 4 },
    });
  });

  it("grows a bottom or right strip inward, never past the work area", () => {
    const area = { x: 0, y: 0, width: 1920, height: 1032 };
    const bottom = placedStrip(
      { x: 0, y: 1028, width: 1920, height: 4 },
      { width: 1920, height: 33 },
      area,
    );
    expect(bottom).toEqual({
      bounds: { x: 0, y: 999, width: 1920, height: 33 },
      shape: { x: 0, y: 29, width: 1920, height: 4 },
    });
    const right = placedStrip(
      { x: 1916, y: 4, width: 4, height: 1024 },
      { width: 29, height: 1024 },
      area,
    );
    expect(right).toEqual({
      bounds: { x: 1891, y: 4, width: 29, height: 1024 },
      shape: { x: 25, y: 0, width: 4, height: 1024 },
    });
  });
});

function inside(rect: Rect, area: Rect): boolean {
  return (
    rect.x >= area.x &&
    rect.y >= area.y &&
    rect.x + rect.width <= area.x + area.width &&
    rect.y + rect.height <= area.y + area.height
  );
}
