import { describe, expect, it } from "vitest";
import type { Direction } from "../../layout/index.ts";
import type { ScreenRect } from "../port.ts";
import { nearestAcross, pageOnDesk } from "./across.ts";

const at = (x: number, y: number, width = 400, height = 300): ScreenRect => ({
  x,
  y,
  width,
  height,
});

function toward(
  direction: Direction,
  from: ScreenRect,
  others: Record<string, ScreenRect>,
): string | undefined {
  return nearestAcross(from, Object.entries(others), direction);
}

describe("the nearest pane across the desktop", () => {
  const grid = {
    left: at(0, 400),
    right: at(824, 400),
    above: at(412, 88),
    below: at(412, 712),
  };
  const middle = at(412, 400);

  it("is the neighbour on each side of a pane standing in a grid", () => {
    expect(toward("left", middle, grid)).toBe("left");
    expect(toward("right", middle, grid)).toBe("right");
    expect(toward("up", middle, grid)).toBe("above");
    expect(toward("down", middle, grid)).toBe("below");
  });

  it("is nobody when no pane's middle lies that way", () => {
    expect(toward("left", grid.left, grid)).toBeUndefined();
    expect(toward("up", grid.above, { beside: at(900, 88) })).toBeUndefined();
  });

  it("prefers a pane straight ahead to a nearer one off to the side", () => {
    const ahead = at(1200, 400);
    const aside = at(830, 900);
    expect(toward("right", middle, { ahead, aside })).toBe("ahead");
  });

  it("takes a close pane on the diagonal before a far one straight ahead", () => {
    const far = at(3000, 400);
    const diagonal = at(824, 712);
    expect(toward("right", middle, { far, diagonal })).toBe("diagonal");
  });

  it("steps through panes that overlap in a cascade, one at a time", () => {
    const cascade = { first: at(1000, 100), second: at(968, 132), third: at(936, 164) };
    expect(toward("down", cascade.first, cascade)).toBe("second");
    expect(toward("left", cascade.second, cascade)).toBe("third");
    expect(toward("up", cascade.third, cascade)).toBe("second");
    expect(toward("right", cascade.second, cascade)).toBe("first");
  });

  it("cannot tell apart two panes standing in exactly the same place", () => {
    expect(toward("right", middle, { twin: middle })).toBeUndefined();
  });
});

describe("a place on the console's page, found on the desktop", () => {
  const console: ScreenRect = { x: 200, y: 100, width: 900, height: 700 };

  it("hangs the page from the console's bottom edge, under its title bar", () => {
    const viewport = { width: 900, height: 660 };
    expect(pageOnDesk(console, viewport, { x: 0, y: 0, width: 900, height: 660 })).toEqual({
      x: 200,
      y: 140,
      width: 900,
      height: 660,
    });
    expect(pageOnDesk(console, viewport, { x: 450, y: 30, width: 450, height: 600 })).toEqual({
      x: 650,
      y: 170,
      width: 450,
      height: 600,
    });
  });

  it("scales by the page's zoom, read from how wide the console shows the page", () => {
    const zoomedOut = { width: 1800, height: 1320 };
    expect(pageOnDesk(console, zoomedOut, { x: 900, y: 660, width: 900, height: 660 })).toEqual({
      x: 650,
      y: 470,
      width: 450,
      height: 330,
    });
  });

  it("takes the page at its own size when the page has no width to compare", () => {
    expect(
      pageOnDesk(console, { width: 0, height: 0 }, { x: 10, y: 20, width: 30, height: 40 }),
    ).toEqual({ x: 210, y: 820, width: 30, height: 40 });
  });
});
