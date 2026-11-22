import { mulberry32, overlaps } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import type { Desk, ScreenRect } from "../port.ts";
import { outsideMetrics, type Wanted } from "./arrange.ts";
import { dealsFor, dealtCounts } from "./pattern-catalogue.ts";
import { type Authored, composeMetrics, gridLines, madeSafe } from "./pattern-compose.ts";
import {
  type Deal,
  dealMetrics,
  placeOf,
  type Seat,
  type Share,
  sameSeats,
  shareOf,
} from "./pattern-deals.ts";
import { grown, maximised, pairs, windowed, workAreas } from "./pattern-testing.ts";
import { composed, type Way } from "./patterns.ts";

const { gap } = outsideMetrics;
const [small, full, wide] = workAreas as [ScreenRect, ScreenRect, ScreenRect];

const leftHalf: Share = { x: 0, y: 0, width: 0.5, height: 1 };
const topRight: Share = { x: 0.5, y: 0, width: 0.5, height: 0.5 };
const bottomRight: Share = { x: 0.5, y: 0.5, width: 0.5, height: 0.5 };

function written(...seats: Share[]): Authored {
  return { name: "theirs", seats };
}

function sharesOf(deal: Deal): Share[] {
  return deal.seats.map(shareOf);
}

function panes(count: number, heaviest = 0): Wanted[] {
  return Array.from({ length: count }, (_, at) => ({
    id: `pane-${at}`,
    size: { width: 1, height: 1 },
    weight: at === heaviest ? 5 : 0,
  }));
}

function boundsOf(way: Way | undefined): ScreenRect[] {
  return (way?.seats ?? []).map((seat) => seat.bounds);
}

function roomOf(rect: ScreenRect): number {
  return rect.width * rect.height;
}

function isOnTheGrid(seat: Seat): boolean {
  return [seat.left, seat.top, seat.right, seat.bottom].every((line) =>
    gridLines.some((known) => placeOf(known) === placeOf(line)),
  );
}

describe("a composition someone else wrote, made safe to play", () => {
  it("passes one already on the grid's lines through as written, with nothing to say", () => {
    const safe = madeSafe(written(leftHalf, topRight, bottomRight));
    expect(sharesOf(safe.deal)).toEqual([leftHalf, topRight, bottomRight]);
    expect(safe.kept).toEqual([0, 1, 2]);
    expect(safe.said).toEqual([]);
    expect(safe.deal.name).toBe("theirs");
  });

  it("reads every arrangement in the catalogue back as itself: they are compositions like any other", () => {
    for (const count of dealtCounts) {
      for (const deal of dealsFor(count)) {
        const safe = madeSafe({ name: deal.name, seats: sharesOf(deal) });
        expect(sameSeats(safe.deal, deal), `${count} ${deal.name}`).toBe(true);
        expect(safe.said, `${count} ${deal.name}`).toEqual([]);
        expect(safe.kept).toHaveLength(count);
      }
    }
  });

  it("knows the grid's lines: the edges, the half, the thirds and the quarters", () => {
    expect(gridLines.map(placeOf)).toEqual([0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1]);
    expect(gridLines.every((line) => line.of <= dealMetrics.finestCut)).toBe(true);
    expect(gridLines.find((line) => placeOf(line) === 0.5)).toEqual({ of: 2, at: 1 });
  });

  it("moves an edge that is off the lines onto the nearest one, and says which seat it moved", () => {
    const safe = madeSafe(written({ x: 0.03, y: 0, width: 0.45, height: 0.97 }, topRight));
    expect(sharesOf(safe.deal)[0]).toEqual(leftHalf);
    expect(safe.said).toEqual(["seat 1 was off the grid's lines and was moved onto them"]);
  });

  it("lets a third written as 0.33 pass without a word", () => {
    const thirds = [0, 0.33, 0.67].map((x): Share => ({ x, y: 0, width: 0.33, height: 1 }));
    const safe = madeSafe(written(...thirds));
    expect(safe.said).toEqual([]);
    expect(safe.deal.seats.map((seat) => seat.left)).toEqual([
      { of: 1, at: 0 },
      { of: 3, at: 1 },
      { of: 3, at: 2 },
    ]);
    expect(composeMetrics.onTheLineWithin).toBe(0.01);
  });

  it("brings a seat that reaches past the display's edge back inside it", () => {
    const safe = madeSafe(written({ x: -0.2, y: 0.5, width: 0.7, height: 0.9 }));
    expect(sharesOf(safe.deal)).toEqual([{ x: 0, y: 0.5, width: 0.5, height: 0.5 }]);
    expect(safe.said).toEqual(["seat 1 reached past the display's edge and was brought inside"]);
  });

  it("widens a seat too narrow to read, and makes one too short taller, to a quarter at least", () => {
    const sliver = madeSafe(written({ x: 0.5, y: 0, width: 0.1, height: 1 }));
    expect(sharesOf(sliver.deal)).toEqual([{ x: 0.5, y: 0, width: 0.25, height: 1 }]);
    expect(sliver.said).toContain("seat 1 was too narrow to read and was widened");
    const strip = madeSafe(written({ x: 0, y: 0.9, width: 1, height: 0.1 }));
    expect(sharesOf(strip.deal)).toEqual([{ x: 0, y: 0.75, width: 1, height: 0.25 }]);
    expect(strip.said).toContain("seat 1 was too short to read and was made taller");
    const betweenLines = madeSafe(written({ x: 1 / 3, y: 0, width: 1 / 6, height: 1 }));
    expect(sharesOf(betweenLines.deal)[0]?.width).toBeCloseTo(1 / 3);
    expect(composeMetrics.smallestShare).toBe(0.25);
  });

  it("cuts a seat that lies over an earlier one back to stand beside it, keeping the most room it can", () => {
    const safe = madeSafe(written(leftHalf, { x: 0.25, y: 0, width: 0.75, height: 0.5 }));
    expect(sharesOf(safe.deal)).toEqual([leftHalf, topRight]);
    expect(safe.said).toEqual(["seat 2 lay over seat 1 and was cut back to stand beside it"]);
    expect(safe.kept).toEqual([0, 1]);
  });

  it("leaves out a seat with no room beside the one it lies over, and names both", () => {
    const whole: Share = { x: 0, y: 0, width: 1, height: 1 };
    const safe = madeSafe(written(whole, topRight, leftHalf));
    expect(sharesOf(safe.deal)).toEqual([whole]);
    expect(safe.kept).toEqual([0]);
    expect(safe.said).toEqual([
      "seat 2 lay over seat 1 with no room beside it and was left out",
      "seat 3 lay over seat 1 with no room beside it and was left out",
    ]);
  });

  it("names a seat by the number it was written under, whatever was left out before it", () => {
    const safe = madeSafe(
      written(leftHalf, { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, topRight, {
        x: 0.5,
        y: 0.25,
        width: 0.5,
        height: 0.75,
      }),
    );
    expect(safe.kept).toEqual([0, 2, 3]);
    expect(safe.said).toEqual([
      "seat 2 was off the grid's lines and was moved onto them",
      "seat 2 lay over seat 1 with no room beside it and was left out",
      "seat 4 lay over seat 3 and was cut back to stand beside it",
    ]);
    expect(sharesOf(safe.deal)[2]).toEqual(bottomRight);
  });

  it("leaves out a seat with no size, or wholly off the display, or not a number", () => {
    const safe = madeSafe(
      written(
        { x: 0, y: 0, width: 0, height: 1 },
        { x: 1.2, y: 0, width: 0.5, height: 1 },
        { x: Number.NaN, y: 0, width: 0.5, height: 1 },
        leftHalf,
      ),
    );
    expect(safe.kept).toEqual([3]);
    expect(safe.said).toEqual([
      "seat 1 has no size on the display and was left out",
      "seat 2 has no size on the display and was left out",
      "seat 3 has no size on the display and was left out",
    ]);
  });

  it("never says what a pane stands on, only seats and the display", () => {
    const said = madeSafe(
      written({ x: -1, y: 0.4, width: 9, height: 0.01 }, leftHalf, {
        x: 2,
        y: 2,
        width: 1,
        height: 1,
      }),
    ).said;
    expect(said.length).toBeGreaterThan(2);
    for (const line of said) {
      expect(line).not.toMatch(/surface/i);
      expect(line).toMatch(/^seat \d+ /);
    }
  });

  it("keeps whatever it is handed on the lines, inside, readable and apart, the same every time", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const random = mulberry32(seed);
      const seats = Array.from(
        { length: 1 + Math.floor(random() * 14) },
        (): Share => ({
          x: random() * 1.4 - 0.2,
          y: random() * 1.4 - 0.2,
          width: random() * 0.9 - 0.05,
          height: random() * 0.9 - 0.05,
        }),
      );
      const safe = madeSafe(written(...seats));
      const shares = sharesOf(safe.deal);
      expect(safe.deal.seats.every(isOnTheGrid), `${seed}`).toBe(true);
      for (const share of shares) {
        expect(share.x, `${seed}`).toBeGreaterThanOrEqual(0);
        expect(share.y, `${seed}`).toBeGreaterThanOrEqual(0);
        expect(share.x + share.width, `${seed}`).toBeLessThanOrEqual(1);
        expect(share.y + share.height, `${seed}`).toBeLessThanOrEqual(1);
        expect(share.width, `${seed}`).toBeGreaterThanOrEqual(0.25);
        expect(share.height, `${seed}`).toBeGreaterThanOrEqual(0.25);
      }
      expect(
        pairs(shares).filter(([one, other]) => overlaps(one, other)),
        `${seed}`,
      ).toEqual([]);
      expect(safe.kept).toHaveLength(shares.length);
      expect(safe.kept).toEqual(safe.kept.toSorted((a, b) => a - b));
      expect(shares.length + safe.said.filter((line) => line.endsWith("left out")).length).toBe(
        seats.length,
      );
      expect(madeSafe(written(...seats))).toEqual(safe);
    }
  });
});

describe("playing a composition", () => {
  const threeOverTwo = madeSafe(
    written(
      { x: 0, y: 0, width: 1 / 3, height: 0.5 },
      { x: 1 / 3, y: 0, width: 1 / 3, height: 0.5 },
      { x: 2 / 3, y: 0, width: 1 / 3, height: 0.5 },
      { x: 0, y: 0.5, width: 0.5, height: 0.5 },
      { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
    ),
  ).deal;
  const leadAndTwo = madeSafe(written(leftHalf, topRight, bottomRight)).deal;
  const play = (deal: Deal, desk: Desk, count: number, standing: ScreenRect[] = []) =>
    composed(deal, { desk, arriving: panes(count), standing });

  it("seats the panes as written, on lines of mixed cuts, one gap apart and inside the display", () => {
    for (const area of workAreas) {
      for (const desk of [windowed(area), maximised(area)]) {
        const seats = boundsOf(play(threeOverTwo, desk, 5)).toSorted(
          (one, other) => one.y - other.y || one.x - other.x,
        );
        expect(seats).toHaveLength(5);
        expect(pairs(seats).filter(([one, other]) => overlaps(grown(one, gap - 1), other))).toEqual(
          [],
        );
        const [first, second, third, fourth, fifth] = seats as [
          ScreenRect,
          ScreenRect,
          ScreenRect,
          ScreenRect,
          ScreenRect,
        ];
        expect(second.x).toBe(first.x + first.width + gap);
        expect(third.x).toBe(second.x + second.width + gap);
        expect(fourth.y).toBe(first.y + first.height + gap);
        expect(fifth.x).toBe(fourth.x + fourth.width + gap);
        expect(fourth.x).toBe(first.x);
        expect(Math.abs(fifth.x + fifth.width - (third.x + third.width))).toBeLessThan(3);
        for (const seat of seats) {
          expect(seat.x).toBeGreaterThanOrEqual(area.x + gap);
          expect(seat.x + seat.width).toBeLessThanOrEqual(area.x + area.width - gap);
          expect(seat.y + seat.height).toBeLessThanOrEqual(area.y + area.height - gap);
          expect(seat.width).toBeGreaterThanOrEqual(dealMetrics.smallestSeat.width);
          expect(seat.height).toBeGreaterThanOrEqual(dealMetrics.smallestSeat.height);
        }
      }
    }
  });

  it("stands beside the console where its seats are readable there, else over all but its near edge", () => {
    expect(play(leadAndTwo, windowed(wide), 3)?.stands).toBe("beside");
    expect(play(leadAndTwo, windowed(full), 3)?.stands).toBe("beside");
    expect(play(threeOverTwo, windowed(full), 5)?.stands).toBe("over");
    const over = boundsOf(play(threeOverTwo, maximised(full), 5));
    expect(Math.min(...over.map((seat) => seat.x))).toBe(128);
  });

  it("gives the heaviest pane the largest seat, and never mirrors what was written", () => {
    for (const heaviest of [0, 1, 2]) {
      const way = composed(leadAndTwo, { desk: maximised(full), arriving: panes(3, heaviest) });
      const seats = boundsOf(way);
      const led = way?.seats.find((seat) => seat.id === `pane-${heaviest}`)?.bounds as ScreenRect;
      expect(roomOf(led)).toBe(Math.max(...seats.map(roomOf)));
      expect(led.x).toBe(Math.min(...seats.map((seat) => seat.x)));
      expect(way?.look).toBe("theirs");
    }
    const onTheLeft = composed(leadAndTwo, {
      desk: { ...windowed(wide), console: { x: 2400, y: 300, width: 1300, height: 1200 } },
      arriving: panes(3),
    });
    const lead = boundsOf(onTheLeft).toSorted((a, b) => roomOf(b) - roomOf(a))[0] as ScreenRect;
    expect(lead.x).toBe(Math.min(...boundsOf(onTheLeft).map((seat) => seat.x)));
  });

  it("leaves its smallest seats empty when there are fewer panes, and refuses when there are more", () => {
    const two = boundsOf(play(leadAndTwo, maximised(full), 2));
    expect(two).toHaveLength(2);
    expect(Math.max(...two.map(roomOf))).toBeGreaterThan(Math.min(...two.map(roomOf)));
    expect(play(leadAndTwo, maximised(full), 4)).toBeUndefined();
  });

  it("refuses where no room on the display gives every seat a size to read, or clear of panes that stay", () => {
    const sixteen = madeSafe({
      name: "sixteen",
      seats: Array.from({ length: 16 }, (_, at) => ({
        x: (at % 4) / 4,
        y: Math.floor(at / 4) / 4,
        width: 0.25,
        height: 0.25,
      })),
    }).deal;
    expect(sixteen.seats).toHaveLength(16);
    expect(play(sixteen, maximised(full), 16)).toBeDefined();
    const cramped: ScreenRect = { x: 0, y: 0, width: 1100, height: 600 };
    expect(play(sixteen, maximised(cramped), 16)).toBeUndefined();
    expect(play(sixteen, maximised(small), 16)).toBeDefined();
    const staying = [{ x: 900, y: 400, width: 300, height: 200 }];
    expect(play(leadAndTwo, maximised(full), 3, staying)).toBeUndefined();
  });

  it("starts the panes a step apart, nearest the console's corner first", () => {
    const way = play(threeOverTwo, maximised(full), 5) as Way;
    expect(way.arrives.map((start) => start.atMs)).toEqual([0, 60, 120, 180, 240]);
    const first = way.seats.find((seat) => seat.id === way.arrives[0]?.id)?.bounds as ScreenRect;
    expect([first.x, first.y]).toEqual([128, 12]);
  });
});
