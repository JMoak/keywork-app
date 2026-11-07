import { describe, expect, it } from "vitest";
import {
  boundsFrom,
  clampToWorkArea,
  edgeOf,
  homeBounds,
  layoutKeyOf,
  moved,
  resizedAtAnchor,
  restoreBounds,
  settled,
  storedFrom,
} from "./placement.ts";
import { primaryDisplay, secondDisplay } from "./testing.ts";

const size = { width: 144, height: 180 };
const both = [primaryDisplay, secondDisplay];

describe("layoutKeyOf", () => {
  it("names a layout by its displays regardless of order", () => {
    expect(layoutKeyOf(both)).toBe("1@0,0,1920x1080|2@1920,0,2560x1440");
    expect(layoutKeyOf([secondDisplay, primaryDisplay])).toBe(layoutKeyOf(both));
    expect(layoutKeyOf([primaryDisplay])).not.toBe(layoutKeyOf(both));
  });
});

describe("homeBounds", () => {
  it("is the bottom-right of the work area, fully on screen", () => {
    expect(homeBounds(primaryDisplay, size)).toEqual({ x: 1760, y: 844, ...size });
    expect(homeBounds(secondDisplay, size)).toEqual({ x: 4320, y: 1204, ...size });
  });
});

describe("storedFrom and boundsFrom", () => {
  it("round-trip through the anchor fractions and keep the snapped edge", () => {
    const bounds = { x: 1776, y: 500, ...size };
    const stored = storedFrom(bounds, both);
    expect(stored).toMatchObject({ layoutKey: layoutKeyOf(both), displayId: 1, edge: "right" });
    expect(boundsFrom(stored, primaryDisplay, size)).toEqual(bounds);
    const bigger = { width: 288, height: 236 };
    expect(boundsFrom(stored, primaryDisplay, bigger)).toEqual({ x: 1632, y: 444, ...bigger });
  });

  it("never lands partly off-screen when the display shrank", () => {
    const stored = storedFrom({ x: 4320, y: 1204, ...size }, both);
    const shrunk = { ...secondDisplay, workArea: { x: 1920, y: 0, width: 1280, height: 720 } };
    const restored = boundsFrom(stored, shrunk, size);
    expect(restored.x + restored.width).toBeLessThanOrEqual(3200);
    expect(restored.y + restored.height).toBeLessThanOrEqual(720);
  });
});

describe("restoreBounds", () => {
  it("prefers the layout, then the same display, then home under the cursor", () => {
    const stored = storedFrom({ x: 100, y: 100, ...size }, both);
    const positions = { [stored.layoutKey]: stored };
    expect(restoreBounds(positions, both, size, undefined)).toEqual({ x: 100, y: 100, ...size });
    const alone = [primaryDisplay];
    expect(restoreBounds(positions, alone, size, undefined)).toEqual({ x: 100, y: 100, ...size });
    expect(restoreBounds(positions, [secondDisplay], size, { x: 2000, y: 10 })).toEqual(
      homeBounds(secondDisplay, size),
    );
    expect(restoreBounds({}, both, size, { x: 2000, y: 10 })).toEqual(
      homeBounds(secondDisplay, size),
    );
    expect(restoreBounds({}, both, size, undefined)).toEqual(homeBounds(primaryDisplay, size));
  });
});

describe("edges and clamping", () => {
  it("snaps within 24 DIP of an edge and settles there", () => {
    const area = primaryDisplay.workArea;
    expect(edgeOf({ x: 10, y: 400, ...size }, area)).toBe("left");
    expect(edgeOf({ x: 400, y: 850, ...size }, area)).toBe("bottom");
    expect(edgeOf({ x: 400, y: 400, ...size }, area)).toBe("none");
    expect(settled({ x: 10, y: 400, ...size }, area)).toEqual({ x: 0, y: 400, ...size });
  });

  it("moves and clamps inside the work area, and resizes around the bottom-right anchor", () => {
    const area = primaryDisplay.workArea;
    expect(moved({ x: 0, y: 0, ...size }, -50, -50, area)).toEqual({ x: 0, y: 0, ...size });
    expect(moved({ x: 1700, y: 900, ...size }, 500, 500, area)).toEqual({
      x: 1776,
      y: 860,
      ...size,
    });
    expect(clampToWorkArea({ x: 0, y: 0, width: 5000, height: 5000 }, area)).toEqual(area);
    expect(
      resizedAtAnchor({ x: 1760, y: 844, ...size }, { width: 288, height: 236 }, area),
    ).toEqual({ x: 1616, y: 788, width: 288, height: 236 });
  });
});
