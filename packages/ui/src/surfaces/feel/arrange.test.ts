import { codeWidth, type Extent, overlaps, yardMetrics } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import { presetSize } from "../outside/grid.ts";
import { sizeFor } from "../outside/resting.ts";
import type { Desk, ScreenPoint, ScreenRect } from "../port.ts";
import {
  ariseStart,
  emergeStart,
  type OutsideKind,
  orbit,
  outsideMetrics,
  recallEnd,
  type Standing,
  seatBesidePane,
  spread,
  type Wanted,
} from "./arrange.ts";

const workAreas: readonly ScreenRect[] = [
  { x: 0, y: 0, width: 1366, height: 768 },
  { x: 0, y: 0, width: 1920, height: 1080 },
  { x: 0, y: 0, width: 3840, height: 2160 },
];
const counts = [1, 8, 16] as const;
const { gap } = outsideMetrics;

function windowed(area: ScreenRect, cursor: ScreenPoint = farCorner(area)): Desk {
  const console = {
    x: area.x + Math.round(area.width * 0.06),
    y: area.y + Math.round(area.height * 0.08),
    width: Math.round(area.width * 0.5),
    height: Math.round(area.height * 0.7),
  };
  return deskOf(area, console, false, cursor);
}

function maximised(area: ScreenRect, cursor: ScreenPoint = farCorner(area)): Desk {
  const console = {
    x: area.x - 8,
    y: area.y - 8,
    width: area.width + 16,
    height: area.height + 16,
  };
  return deskOf(area, console, true, cursor);
}

function deskOf(
  workArea: ScreenRect,
  console: ScreenRect,
  consoleMaximized: boolean,
  cursor: ScreenPoint,
): Desk {
  return {
    console,
    consoleMaximized,
    workArea,
    displays: [{ bounds: workArea, workArea, scaleFactor: 1 }],
    cursor,
  };
}

function farCorner(area: ScreenRect): ScreenPoint {
  return { x: area.x + 1, y: area.y + area.height - 1 };
}

const noteSize: Extent = { width: 480, height: 308 };
const fileSize: Extent = { width: codeWidth, height: 308 };

function panes(count: number, _area: ScreenRect): Wanted[] {
  const kinds: readonly OutsideKind[] = ["note", "file"];
  return Array.from({ length: count }, (_, index) => {
    const kind = kinds[index % kinds.length] ?? "note";
    return { id: `pane-${index}`, size: kind === "file" ? fileSize : noteSize };
  });
}

function inside(area: ScreenRect, rect: ScreenRect): boolean {
  return (
    rect.x >= area.x &&
    rect.y >= area.y &&
    rect.x + rect.width <= area.x + area.width &&
    rect.y + rect.height <= area.y + area.height
  );
}

function covers(rect: ScreenRect, point: ScreenPoint): boolean {
  return (
    point.x > rect.x &&
    point.x < rect.x + rect.width &&
    point.y > rect.y &&
    point.y < rect.y + rect.height
  );
}

function grown(rect: ScreenRect, by: number): ScreenRect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  };
}

function pairs<Item>(items: readonly Item[]): Array<[Item, Item]> {
  return items.flatMap((one, index) =>
    items.slice(index + 1).map((other): [Item, Item] => [one, other]),
  );
}

function centreOf(rect: ScreenRect): ScreenPoint {
  return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
}

function beside(desk: Desk, placed: readonly Standing[]): Standing[] {
  return placed.filter((pane) => !overlaps(pane.bounds, desk.console));
}

function topRight(rect: ScreenRect): string {
  return `${rect.x + rect.width},${rect.y}`;
}

describe("the orbit around a windowed console", () => {
  for (const area of workAreas) {
    for (const count of counts) {
      const named = `${count} on ${area.width}x${area.height}`;
      const desk = windowed(area);
      const placed = orbit(desk, panes(count, area));

      it(`${named}: every pane keeps its size, in the order asked, on the display`, () => {
        expect(placed.map((pane) => pane.id)).toEqual(panes(count, area).map((pane) => pane.id));
        expect(
          placed.map(({ bounds }) => ({ width: bounds.width, height: bounds.height })),
        ).toEqual(panes(count, area).map((pane) => pane.size));
        expect(placed.every((pane) => inside(area, pane.bounds))).toBe(true);
      });

      it(`${named}: panes beside the console keep the gap from it and from one another`, () => {
        const seated = beside(desk, placed);
        expect(seated.length).toBeGreaterThan(0);
        expect(seated.some((pane) => overlaps(grown(pane.bounds, gap), desk.console))).toBe(false);
        expect(pairs(seated).some(([a, b]) => overlaps(grown(a.bounds, gap), b.bounds))).toBe(
          false,
        );
      });

      it(`${named}: panes that find no room cascade with every title strip in sight`, () => {
        const cascaded = placed.filter((pane) => overlaps(pane.bounds, desk.console));
        expect(new Set(cascaded.map((pane) => topRight(pane.bounds))).size).toBe(cascaded.length);
        const seated = beside(desk, placed);
        const spills = cascaded.flatMap((pane) => seated.map((other) => [pane, other] as const));
        expect(spills.some(([a, b]) => overlaps(a.bounds, b.bounds))).toBe(false);
      });

      it(`${named}: the same desk gives the same places`, () => {
        expect(orbit(windowed(area), panes(count, area))).toEqual(placed);
      });
    }
  }

  it("fills the roomier side first, top aligned with the console, then the other side", () => {
    const area = workAreas[2] as ScreenRect;
    const console = { x: 1400, y: 300, width: 1000, height: 900 };
    const desk = deskOf(area, console, false, farCorner(area));
    const size = { width: 480, height: 320 };
    const placed = orbit(
      desk,
      Array.from({ length: 12 }, (_, index) => ({ id: `pane-${index}`, size })),
    );
    const first = placed[0]?.bounds;
    expect(first).toEqual({ x: console.x + console.width + gap, y: console.y, ...size });
    const firstColumn = placed.slice(0, 5).map((pane) => pane.bounds);
    expect(firstColumn.map((bounds) => bounds.x)).toEqual(Array(5).fill(first?.x));
    expect(firstColumn.map((bounds) => bounds.y)).toEqual(
      [0, 1, 2, 3, 4].map((row) => console.y + row * (size.height + gap)),
    );
    expect(placed[5]?.bounds.x).toBe((first?.x ?? 0) + size.width + gap);
    expect(placed[5]?.bounds.y).toBe(console.y);
    expect(placed[10]?.bounds).toEqual({
      x: console.x - gap - size.width,
      y: console.y,
      ...size,
    });
  });

  it("goes left first when the left has more room", () => {
    const area = workAreas[1] as ScreenRect;
    const console = { x: 900, y: 100, width: 900, height: 700 };
    const size = { width: 480, height: 320 };
    const [first] = orbit(deskOf(area, console, false, farCorner(area)), [{ id: "a", size }]);
    expect(first?.bounds).toEqual({ x: console.x - gap - size.width, y: console.y, ...size });
  });

  it("continues below the console, then above it, when neither side has room", () => {
    const area = workAreas[1] as ScreenRect;
    const console = { x: 200, y: 400, width: 1520, height: 300 };
    const size = { width: 480, height: 320 };
    const desk = deskOf(area, console, false, farCorner(area));
    const placed = orbit(
      desk,
      Array.from({ length: 5 }, (_, index) => ({ id: `pane-${index}`, size })),
    );
    const below = console.y + console.height + gap;
    expect(placed.slice(0, 3).map((pane) => pane.bounds)).toEqual(
      [0, 1, 2].map((column) => ({
        x: console.x + column * (size.width + gap),
        y: below,
        ...size,
      })),
    );
    expect(placed[3]?.bounds).toEqual({ x: console.x, y: console.y - gap - size.height, ...size });
    expect(pairs(placed).some(([a, b]) => overlaps(a.bounds, b.bounds))).toBe(false);
  });

  it("treats panes already outside as obstacles", () => {
    const area = workAreas[2] as ScreenRect;
    const desk = windowed(area);
    const standing = orbit(desk, panes(4, area)).map((pane) => pane.bounds);
    const arriving = orbit(desk, panes(4, area), standing);
    const everyPair = arriving.flatMap((pane) => standing.map((other) => [pane.bounds, other]));
    expect(everyPair.some(([a, b]) => a && b && overlaps(grown(a, gap), b))).toBe(false);
  });
});

describe("the orbit over a maximised console", () => {
  for (const area of workAreas) {
    for (const count of counts) {
      const named = `${count} on ${area.width}x${area.height}`;
      const placed = orbit(maximised(area), panes(count, area));

      it(`${named}: cascades over the far third, on the display, each strip in sight`, () => {
        expect(placed.every((pane) => inside(area, pane.bounds))).toBe(true);
        expect(new Set(placed.map((pane) => topRight(pane.bounds))).size).toBe(count);
        expect(placed[0]?.bounds.x).toBeGreaterThanOrEqual(area.x + area.width / 3);
      });

      it(`${named}: the same desk gives the same places`, () => {
        expect(orbit(maximised(area), panes(count, area))).toEqual(placed);
      });
    }
  }

  it("steps each pane down and inward so the one beneath keeps its strip and its edge", () => {
    const area = workAreas[1] as ScreenRect;
    const size = { width: 480, height: 320 };
    const placed = orbit(
      maximised(area),
      [0, 1, 2].map((index) => ({ id: `pane-${index}`, size })),
    );
    const { cascadeStep } = outsideMetrics;
    expect(placed.map((pane) => pane.bounds)).toEqual(
      [0, 1, 2].map((step) => ({
        x: area.width - gap - size.width - step * cascadeStep,
        y: gap + step * cascadeStep,
        ...size,
      })),
    );
  });

  it("cascades when a windowed console leaves no room beside it", () => {
    const area = workAreas[0] as ScreenRect;
    const console = { x: 60, y: 40, width: 1246, height: 688 };
    const size = { width: 480, height: 320 };
    const [first] = orbit(deskOf(area, console, false, farCorner(area)), [{ id: "a", size }]);
    expect(first?.bounds).toEqual({
      x: console.x + console.width - gap - size.width,
      y: console.y + gap,
      ...size,
    });
  });

  it("carries the cascade on past panes already standing in it", () => {
    const area = workAreas[1] as ScreenRect;
    const desk = maximised(area);
    const standing = orbit(desk, panes(3, area)).map((pane) => pane.bounds);
    const [next] = orbit(desk, panes(1, area), standing);
    expect(standing.map(topRight)).not.toContain(topRight(next?.bounds as ScreenRect));
  });
});

describe("the cursor", () => {
  for (const area of workAreas) {
    for (const count of counts) {
      it(`${count} on ${area.width}x${area.height}: no pane lands under it, windowed or maximised`, () => {
        const firstSeat = orbit(windowed(area), panes(1, area))[0]?.bounds as ScreenRect;
        const firstSlot = orbit(maximised(area), panes(1, area))[0]?.bounds as ScreenRect;
        const cursors = [centreOf(firstSeat), centreOf(firstSlot), centreOf(area)];
        for (const cursor of cursors) {
          for (const desk of [windowed(area, cursor), maximised(area, cursor)]) {
            const placed = orbit(desk, panes(count, area));
            expect(placed.filter((pane) => covers(pane.bounds, cursor))).toEqual([]);
            expect(placed.every((pane) => inside(area, pane.bounds))).toBe(true);
          }
        }
      });
    }
  }
});

describe("emerging and returning", () => {
  const area = workAreas[1] as ScreenRect;
  const console = { x: 200, y: 100, width: 1000, height: 800 };
  const desk = deskOf(area, console, false, farCorner(area));

  it("starts a pane of the same size tucked inside the console's nearest edge", () => {
    const target = { x: 1212, y: 300, width: 480, height: 320 };
    expect(emergeStart(desk, target)).toEqual({ x: 720, y: 300, width: 480, height: 320 });
    const above = { x: 400, y: 0, width: 480, height: 88 };
    expect(emergeStart(desk, above)).toEqual({ x: 400, y: 100, width: 480, height: 88 });
  });

  it("starts a pane beyond the console's corner from inside that corner", () => {
    const target = { x: 1300, y: 950, width: 480, height: 120 };
    expect(emergeStart(desk, target)).toEqual({ x: 720, y: 780, width: 480, height: 120 });
  });

  it("gives a pane that stands over the console a short run outward to its place", () => {
    const overTheFarThird = { x: 708, y: 112, width: 480, height: 320 };
    const start = emergeStart(desk, overTheFarThird);
    expect(start).toEqual({
      ...overTheFarThird,
      x: overTheFarThird.x - outsideMetrics.emergeTravel,
    });
    const overTheNearThird = { x: 212, y: 112, width: 480, height: 320 };
    expect(emergeStart(desk, overTheNearThird).x).toBe(212 + outsideMetrics.emergeTravel);
  });

  it("keeps the start on the console's display", () => {
    const flush = maximised(area);
    const [first] = orbit(flush, panes(1, area));
    const start = emergeStart(flush, first?.bounds as ScreenRect);
    expect(inside(area, start)).toBe(true);
    expect(start).not.toEqual(first?.bounds);
  });

  it("sends a recalled pane back to the place it would have emerged from", () => {
    const standing = { x: 1500, y: 700, width: 400, height: 300 };
    expect(recallEnd(desk, standing)).toEqual(emergeStart(desk, standing));
    expect(overlaps(recallEnd(desk, standing), console)).toBe(true);
  });
});

describe("the spread", () => {
  for (const area of workAreas) {
    for (const count of counts) {
      const named = `${count} on ${area.width}x${area.height}`;
      for (const desk of [windowed(area), maximised(area)]) {
        const outside = orbit(desk, panes(count, area));
        const spreadOut = spread(desk, outside);
        const how = desk.consoleMaximized ? "maximised" : "windowed";

        it(`${named}, ${how}: nothing overlaps, everything is on the display, nothing grows`, () => {
          expect(spreadOut.map((pane) => pane.id)).toEqual(outside.map((pane) => pane.id));
          expect(pairs(spreadOut).filter(([a, b]) => overlaps(a.bounds, b.bounds))).toEqual([]);
          expect(spreadOut.every((pane) => inside(area, pane.bounds))).toBe(true);
          for (const [index, pane] of spreadOut.entries()) {
            const before = outside[index]?.bounds as ScreenRect;
            expect(pane.bounds.width).toBeLessThanOrEqual(before.width);
            expect(pane.bounds.height).toBeLessThanOrEqual(before.height);
          }
        });

        it(`${named}, ${how}: the same panes spread the same way`, () => {
          expect(spread(desk, outside)).toEqual(spreadOut);
        });
      }
    }
  }

  it("keeps every pane its size when the display has the room", () => {
    const area = workAreas[2] as ScreenRect;
    const outside = orbit(maximised(area), panes(16, area));
    const sizes = (held: readonly Standing[]): Extent[] =>
      held.map(({ bounds }) => ({ width: bounds.width, height: bounds.height }));
    expect(sizes(spread(maximised(area), outside))).toEqual(sizes(outside));
  });

  it("keeps the panes' order across and down the display", () => {
    const area = workAreas[1] as ScreenRect;
    const size = { width: 480, height: 320 };
    const pile: Standing[] = [
      { id: "top-right", bounds: { x: 900, y: 40, ...size } },
      { id: "bottom-left", bounds: { x: 80, y: 500, ...size } },
      { id: "top-left", bounds: { x: 100, y: 60, ...size } },
      { id: "bottom-right", bounds: { x: 880, y: 520, ...size } },
    ];
    const spreadOut = new Map(spread(maximised(area), pile).map((pane) => [pane.id, pane.bounds]));
    const at = (id: string): ScreenRect => spreadOut.get(id) as ScreenRect;
    expect(at("top-left").x).toBeLessThan(at("top-right").x);
    expect(at("bottom-left").x).toBeLessThan(at("bottom-right").x);
    expect(at("top-left").y).toBeLessThan(at("bottom-left").y);
    expect(at("top-right").y).toBeLessThan(at("bottom-right").y);
    expect(at("top-left").y).toBe(at("top-right").y);
  });

  it("spreads each display's panes over that display", () => {
    const left = workAreas[1] as ScreenRect;
    const right = { ...left, x: left.width };
    const desk: Desk = {
      ...maximised(left),
      displays: [
        { bounds: left, workArea: left, scaleFactor: 1 },
        { bounds: right, workArea: right, scaleFactor: 1 },
      ],
    };
    const size = { width: 480, height: 320 };
    const outside: Standing[] = [
      { id: "here", bounds: { x: 100, y: 100, ...size } },
      { id: "here-too", bounds: { x: 120, y: 120, ...size } },
      { id: "there", bounds: { x: right.x + 100, y: 100, ...size } },
      { id: "there-too", bounds: { x: right.x + 120, y: 120, ...size } },
    ];
    const spreadOut = spread(desk, outside);
    expect(spreadOut.slice(0, 2).every((pane) => inside(left, pane.bounds))).toBe(true);
    expect(spreadOut.slice(2).every((pane) => inside(right, pane.bounds))).toBe(true);
    expect(pairs(spreadOut).some(([a, b]) => overlaps(a.bounds, b.bounds))).toBe(false);
  });
});

describe("sizes", () => {
  const area = workAreas[1] as ScreenRect;
  const { floor, workingShare } = outsideMetrics;
  const readingColumn = presetSize("reading", area, "note").width;

  it("never sets readable text narrower than the yard's readable width: on the named sizes' column", () => {
    expect(floor.width).toBe(yardMetrics.readable.width);
    expect(readingColumn).toBe(624);
    expect(readingColumn).toBeGreaterThanOrEqual(floor.width);
    expect(sizeFor("note", { width: 120, height: 400 }, area).width).toBe(readingColumn);
    expect(sizeFor("note", { width: 560, height: 400 }, area).width).toBe(readingColumn);
    expect(sizeFor("stead", { width: 4000, height: 400 }, area).width).toBe(readingColumn);
    expect(sizeFor("conversation", undefined, area).width).toBe(readingColumn);
  });

  it("sets code on the column that holds the yard's code width, whatever it measures", () => {
    expect(sizeFor("file", { width: 200, height: 400 }, area).width).toBe(942);
    expect(sizeFor("diff", undefined, area).width).toBe(942);
    expect(sizeFor("diff", undefined, area).width).toBeGreaterThanOrEqual(codeWidth);
  });

  it("takes the smallest named size that holds what it measures, with no strip added on", () => {
    expect(sizeFor("note", { width: 480, height: 300 }, area).height).toBe(320);
    expect(sizeFor("note", { width: 480, height: 320 }, area).height).toBe(320);
    expect(sizeFor("note", { width: 480, height: 321 }, area).height).toBe(648);
    expect(sizeFor("note", { width: 480, height: 20 }, area).height).toBe(floor.height);
    expect(sizeFor("file", { width: 720, height: 9000 }, area).height).toBe(
      Math.round(area.height * workingShare),
    );
  });

  it("is always one of the sizes the keeper's keys step through", () => {
    const named = (["card", "reading", "working"] as const).map((name) =>
      presetSize(name, area, "conversation"),
    );
    for (const height of [1, 160, 161, 320, 500, 648, 2000]) {
      expect(named).toContainEqual(sizeFor("conversation", { width: 700, height }, area));
    }
  });

  it("gives an unmeasured pane its kind's resting height", () => {
    const working = Math.round(area.height * workingShare);
    expect(sizeFor("conversation", undefined, area).height).toBe(working);
    expect(sizeFor("file", undefined, area).height).toBe(working);
    expect(sizeFor("note", undefined, area).height).toBe(yardMetrics.readable.height);
    expect(sizeFor("stead", undefined, area).height).toBe(yardMetrics.readable.height);
  });

  it("fits a display smaller than its floors, a gap inside its edge", () => {
    const small = { x: 0, y: 0, width: 400, height: 150 };
    expect(sizeFor("file", undefined, small)).toEqual({ width: 376, height: 90 });
  });
});

describe("a pane arising beside another", () => {
  const area = workAreas[1] as ScreenRect;
  const desk = deskOf(area, { x: 100, y: 100, width: 700, height: 600 }, false, farCorner(area));
  const parent: ScreenRect = { x: 900, y: 200, width: 400, height: 300 };
  const size = { width: 400, height: 250 };

  it("starts at its own size tucked into the parent it grows from", () => {
    const seat = { x: 1312, y: 200, ...size };
    expect(ariseStart(desk, parent, seat)).toEqual({ x: 900, y: 200, ...size });
    const below = { x: 900, y: 512, ...size };
    expect(ariseStart(desk, parent, below)).toEqual({ x: 900, y: 250, ...size });
    expect(overlaps(ariseStart(desk, parent, seat), desk.console)).toBe(false);
  });

  it("gives a pane that already overlaps its parent a short run out to its place", () => {
    const close = { x: 950, y: 220, ...size };
    const start = ariseStart(desk, parent, close);
    expect(start).toEqual({ ...close, x: close.x - outsideMetrics.emergeTravel });
  });

  it("sits one gap to the right of its parent, level with its top, when there is room", () => {
    expect(seatBesidePane(desk, parent, size)).toEqual({ x: 1312, y: 200, ...size });
  });

  it("goes below, then to the left, then above, as the places before are taken or off the display", () => {
    const atTheRight = { x: 1312, y: 200, width: 500, height: 400 };
    expect(seatBesidePane(desk, parent, size, [atTheRight])).toEqual({ x: 900, y: 512, ...size });
    const beneath = { x: 900, y: 512, width: 400, height: 250 };
    expect(seatBesidePane(desk, parent, size, [atTheRight, beneath])).toEqual({
      x: 488,
      y: 200,
      ...size,
    });
    expect(seatBesidePane(desk, parent, size, [atTheRight, beneath, desk.console])).toBeUndefined();
    const lower = { ...parent, y: 600 };
    expect(
      seatBesidePane(desk, lower, size, [
        { ...atTheRight, y: 600 },
        { ...beneath, y: 912 },
        desk.console,
      ]),
    ).toEqual({ x: 900, y: 338, ...size });
  });

  it("slides along its parent's edge to stay a gap inside the display", () => {
    const low = { ...parent, y: 760 };
    const tall = { width: 400, height: 600 };
    expect(seatBesidePane(desk, low, tall)).toEqual({
      x: 1312,
      y: area.height - gap - 600,
      ...tall,
    });
    const atTheEdge = { ...parent, x: 1500 };
    const wide = { width: 700, height: 250 };
    expect(seatBesidePane(desk, atTheEdge, wide)).toEqual({
      x: area.width - gap - 700,
      y: 512,
      ...wide,
    });
  });

  it("has no seat for a pane too large to stand beside its parent on the display", () => {
    expect(seatBesidePane(desk, parent, { width: 1900, height: 1000 })).toBeUndefined();
  });
});
