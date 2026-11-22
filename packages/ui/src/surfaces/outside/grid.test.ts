import { codeWidth } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import { tierMinPx } from "../../page/tiers.ts";
import { outsideMetrics, spread } from "../feel/arrange.ts";
import type { Desk, ScreenRect } from "../port.ts";
import {
  areaHolding,
  gridCell,
  gridTracks,
  presetSize,
  sameRect,
  sizedOn,
  sizeLadder,
  standsFull,
  steppedAlongLadder,
  steppedOnGrid,
} from "./grid.ts";

const laptop: ScreenRect = { x: 0, y: 0, width: 1920, height: 1040 };
const beside: ScreenRect = { x: 1920, y: 0, width: 2560, height: 1400 };
const { gap } = outsideMetrics;

const desk: Desk = {
  console: { x: 648, y: 200, width: 624, height: 600 },
  consoleMaximized: false,
  workArea: laptop,
  displays: [
    { bounds: { ...laptop, height: 1080 }, workArea: laptop, scaleFactor: 1 },
    { bounds: { ...beside, height: 1440 }, workArea: beside, scaleFactor: 1 },
  ],
  cursor: { x: 0, y: 0 },
};

const emptyDesk: Desk = { ...desk, console: { x: 5000, y: 5000, width: 10, height: 10 } };

const pane = (x: number, y: number, width = 465, height = 160): ScreenRect => ({
  x,
  y,
  width,
  height,
});

describe("the grid a display's work area is cut into", () => {
  it("cuts halves, thirds and quarters with one gap around and between", () => {
    expect(gridTracks(0, 1920, 2)).toEqual([
      { start: 12, end: 954 },
      { start: 966, end: 1908 },
    ]);
    expect(gridTracks(0, 1920, 3).map((track) => track.start)).toEqual([12, 648, 1284]);
    expect(gridTracks(0, 1920, 4).map((track) => track.start)).toEqual([12, 489, 966, 1443]);
    expect(gridTracks(0, 1920, 4).at(-1)?.end).toBeLessThanOrEqual(1920 - gap);
  });

  it("names a cell by its column and row, and is the grid the spread already seats panes in", () => {
    const cell = gridCell(laptop, { columns: 4, rows: 4 }, { column: 1, row: 2 });
    expect(cell).toEqual({ x: 489, y: 526, width: 465, height: 245 });
    const sixteen = Array.from({ length: 16 }, (_, at) => ({
      id: `pane-${at}`,
      bounds: { x: 100 + at, y: 100 + at, width: 465, height: 245 },
    }));
    const spreadOut = spread(desk, sixteen)
      .map((seat) => seat.bounds)
      .toSorted((a, b) => a.y - b.y || a.x - b.x);
    const cells = Array.from({ length: 16 }, (_, at) =>
      gridCell(laptop, { columns: 4, rows: 4 }, { column: at % 4, row: Math.floor(at / 4) }),
    );
    expect(spreadOut).toEqual(cells);
  });

  it("answers with the whole area for a cell the grid does not have", () => {
    expect(gridCell(laptop, { columns: 2, rows: 2 }, { column: 2, row: 0 })).toEqual(laptop);
  });
});

describe("the named sizes a pane outside steps through", () => {
  it("climbs from a card to the whole work area, every step larger than the last", () => {
    const ladder = sizeLadder(laptop, "conversation");
    expect(ladder.map((preset) => preset.name)).toEqual([
      "card",
      "reading",
      "working",
      "half",
      "full",
    ]);
    expect(ladder.map((preset) => preset.size)).toEqual([
      { width: 624, height: 160 },
      { width: 624, height: 320 },
      { width: 624, height: 624 },
      { width: 942, height: 1016 },
      { width: 1920, height: 1040 },
    ]);
  });

  it("keeps a card wide enough for the title row's instruments, on the narrowest column that is", () => {
    for (const area of [laptop, beside, { ...laptop, width: 1366, height: 728 }]) {
      const card = presetSize("card", area, "conversation");
      expect(card.width, `${area.width} wide`).toBeGreaterThanOrEqual(tierMinPx.column);
      expect(card.height).toBe(outsideMetrics.floor.height);
    }
    expect(presetSize("card", beside, "conversation").width).toBe(625);
    expect(presetSize("card", laptop, "conversation").width).toBe(624);
  });

  it("gives code its eighty columns at every size below the half", () => {
    for (const name of ["card", "reading", "working"] as const) {
      expect(presetSize(name, laptop, "file").width).toBeGreaterThanOrEqual(codeWidth);
      expect(presetSize(name, laptop, "diff").width).toBe(942);
    }
  });

  it("drops a step that would not be larger on a display too small to tell them apart", () => {
    const squat: ScreenRect = { x: 0, y: 0, width: 1280, height: 360 };
    const names = sizeLadder(squat, "conversation").map((preset) => preset.name);
    expect(names).toEqual(["card", "reading", "half", "full"]);
    const rooms = sizeLadder(squat, "conversation").map(({ size }) => size.width * size.height);
    expect(rooms).toEqual(rooms.toSorted((a, b) => a - b));
    expect(new Set(rooms).size).toBe(rooms.length);
  });
});

describe("a pane outside stepped along the sizes by key", () => {
  it("grows to the next size larger than it is, from its corner", () => {
    const arrived = pane(1200, 300, 520, 400);
    expect(steppedAlongLadder(desk, arrived, "conversation", 1)).toEqual({
      x: 1200,
      y: 300,
      width: 624,
      height: 624,
    });
  });

  it("is pulled back onto its display, a gap inside, when growing would leave it", () => {
    const low = pane(1400, 700, 624, 320);
    const grown = steppedAlongLadder(desk, low, "conversation", 1);
    expect(grown).toEqual({ x: 1284, y: 404, width: 624, height: 624 });
  });

  it("fills the work area exactly at the last step, and steps back down from there", () => {
    const half = pane(966, 12, 942, 1016);
    const full = steppedAlongLadder(desk, half, "conversation", 1);
    expect(full).toEqual(laptop);
    expect(standsFull(desk, full)).toBe(true);
    expect(steppedAlongLadder(desk, full, "conversation", -1)).toEqual({
      x: 12,
      y: 12,
      width: 942,
      height: 1016,
    });
  });

  it("stays as it is past either end", () => {
    const card = pane(100, 100, 624, 160);
    expect(sameRect(steppedAlongLadder(desk, card, "conversation", -1), card)).toBe(true);
    expect(sameRect(steppedAlongLadder(desk, laptop, "conversation", 1), laptop)).toBe(true);
  });

  it("sizes by the display the pane stands on", () => {
    const onTheOther = pane(2400, 300, 520, 400);
    expect(areaHolding(desk, onTheOther)).toEqual(beside);
    expect(steppedAlongLadder(desk, onTheOther, "conversation", 1)).toMatchObject({
      width: 625,
      height: 840,
    });
  });

  it("places a named size at a corner for whoever seats panes by size", () => {
    const card = { name: "card", size: presetSize("card", laptop, "note") } as const;
    expect(sizedOn(laptop, { x: 648, y: 12 }, card)).toEqual({
      x: 648,
      y: 12,
      width: 624,
      height: 160,
    });
    expect(sizedOn(laptop, { x: 1900, y: 1000 }, card)).toEqual({
      x: 1284,
      y: 868,
      width: 624,
      height: 160,
    });
  });
});

describe("a pane outside stepped across the grid by key", () => {
  function stepsFrom(
    start: ScreenRect,
    direction: "right" | "down",
    others: readonly ScreenRect[] = [],
  ): number[] {
    const visited: number[] = [];
    let at = start;
    for (let steps = 0; steps < 12; steps += 1) {
      const next = steppedOnGrid(emptyDesk, at, direction, others);
      if (sameRect(next, at)) break;
      visited.push(direction === "right" ? next.x : next.y);
      at = next;
    }
    return visited;
  }

  it("steps a pane as wide as a column from column to column of that cut", () => {
    expect(stepsFrom(pane(12, 500, 465, 160), "right")).toEqual([489, 966, 1443]);
    expect(stepsFrom(pane(12, 500, 624, 160), "right")).toEqual([648, 1284]);
    expect(stepsFrom(pane(12, 12, 942, 1016), "right")).toEqual([966]);
  });

  it("steps any other pane through every column start, then rests its far edge a gap from the edge", () => {
    expect(stepsFrom(pane(12, 500, 500, 160), "right")).toEqual([489, 648, 966, 1284, 1408]);
    expect(stepsFrom(pane(12, 12, 624, 160), "down")).toEqual([269, 354, 526, 696, 783, 868]);
  });

  it("brings a pane the pointer dropped anywhere onto the grid at its first step", () => {
    const dropped = pane(733, 41, 500, 300);
    expect(steppedOnGrid(emptyDesk, dropped, "left", []).x).toBe(648);
    expect(steppedOnGrid(emptyDesk, dropped, "down", []).y).toBe(269);
  });

  it("stops a gap from the console before it would run over it", () => {
    const card = pane(12, 300, 465, 160);
    const landed = steppedOnGrid(desk, card, "right", []);
    expect(landed.x + landed.width).toBe(desk.console.x - gap);
  });

  it("takes the seat a gap before a pane in its way, and the seat a gap past it", () => {
    const inTheWay = pane(1000, 480, 300, 200);
    const card = pane(12, 500, 465, 160);
    expect(steppedOnGrid(emptyDesk, card, "right", [inTheWay]).x).toBe(489);
    expect(steppedOnGrid(emptyDesk, pane(489, 500), "right", [inTheWay]).x).toBe(
      inTheWay.x - gap - 465,
    );
    expect(steppedOnGrid(emptyDesk, pane(1284, 500, 300, 160), "right", [inTheWay]).x).toBe(
      inTheWay.x + inTheWay.width + gap,
    );
  });

  it("takes no seat where it would stand over another pane, so a pile of panes is crossed by the grid alone", () => {
    const pile = [0, 1, 2, 3, 4].map((at) => pane(700 + at * 32, 100 + at * 32, 480, 620));
    expect(stepsFrom(pane(12, 300, 500, 300), "right", pile)).toEqual([
      188, 489, 648, 966, 1284, 1320, 1408,
    ]);
  });

  it("ignores the edges of panes out of its way: the grid lines those up", () => {
    const above = pane(700, 12, 300, 200);
    expect(steppedOnGrid(emptyDesk, pane(660, 500), "right", [above]).x).toBe(966);
  });

  it("lines up with the console's own edges from below it and from beside it", () => {
    const apart = { ...desk, console: { x: 700, y: 200, width: 500, height: 600 } };
    expect(steppedOnGrid(apart, pane(760, 820, 300, 160), "left", []).x).toBe(700);
    expect(steppedOnGrid(apart, pane(1300, 260, 300, 160), "up", []).y).toBe(200);
  });

  it("never rests against the display's edge itself: the gap is the last stop", () => {
    const card = pane(40, 40);
    const left = steppedOnGrid(emptyDesk, card, "left", []);
    expect(left.x).toBe(laptop.x + gap);
    expect(sameRect(steppedOnGrid(emptyDesk, left, "left", []), left)).toBe(true);
    const up = steppedOnGrid(emptyDesk, card, "up", []);
    expect(up.y).toBe(laptop.y + gap);
  });

  it("stays on the display it stands on, and uses that display's grid", () => {
    const onTheOther = pane(1940, 100, 625, 160);
    const landed = steppedOnGrid(emptyDesk, onTheOther, "left", []);
    expect(landed.x).toBe(beside.x + gap);
    expect(sameRect(steppedOnGrid(emptyDesk, landed, "left", []), landed)).toBe(true);
    expect(steppedOnGrid(emptyDesk, landed, "right", []).x).toBe(beside.x + 649);
  });
});
