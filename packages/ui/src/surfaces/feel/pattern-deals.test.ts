import { mulberry32, overlaps } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import { gridTracks } from "../outside/grid.ts";
import type { Desk, ScreenRect } from "../port.ts";
import { outsideMetrics, type Wanted } from "./arrange.ts";
import { dealsFor, dealtCounts } from "./pattern-catalogue.ts";
import { chosenWay, nextDeal } from "./pattern-choice.ts";
import {
  type Deal,
  dealMetrics,
  drawn,
  evenRows,
  flipped,
  holdsOn,
  mirrorsItself,
  type Seat,
  sameSeats,
  seatOn,
  shareOf,
  smallestOn,
  turned,
} from "./pattern-deals.ts";
import { canvases } from "./pattern-ground.ts";
import { shapeMetrics } from "./pattern-shapes.ts";
import {
  deskOf,
  grown,
  maximised,
  outOfTheWay,
  pairs,
  seeds,
  windowed,
  workAreas,
} from "./pattern-testing.ts";
import { dealWays, type Incoming, stepMs, type Way } from "./patterns.ts";

const { gap } = outsideMetrics;
const { smallestSeat } = dealMetrics;
const [small, full, wide] = workAreas as [ScreenRect, ScreenRect, ScreenRect];

const stances = [
  ["windowed", windowed],
  ["wide", widened],
  ["maximised", maximised],
] as const;

const everyDesk = workAreas.flatMap((area) =>
  stances.map(([how, deskFor]) => ({
    where: `${area.width}x${area.height}, ${how}`,
    desk: deskFor(area),
  })),
);

function widened(area: ScreenRect): Desk {
  const console = {
    x: area.x + 40,
    y: area.y + 40,
    width: Math.round(area.width * 0.85),
    height: Math.round(area.height * 0.85),
  };
  return deskOf(area, console, false, outOfTheWay(area));
}

function arriving(count: number, heaviest = count - 1): Wanted[] {
  return Array.from({ length: count }, (_, at) => ({
    id: `pane-${at}`,
    size: { width: 1, height: 1 },
    weight: at === heaviest ? 9 : at % 3,
  }));
}

function waysOf(desk: Desk, count: number, standing: readonly ScreenRect[] = []): readonly Way[] {
  return dealWays({ desk, arriving: arriving(count), standing });
}

function called(ways: readonly Way[], name: string): Way[] {
  return ways.filter((way) => way.look === name);
}

function looksOf(ways: readonly Way[]): string[] {
  return [...new Set(ways.map((way) => way.look))];
}

function canvasOf(desk: Desk, deal: Deal): ScreenRect {
  return canvases(desk).find((canvas) => holdsOn(canvas.room, deal))?.room as ScreenRect;
}

function shareCovered(deal: Deal): number {
  const covered = deal.seats
    .map(shareOf)
    .reduce((sum, share) => sum + share.width * share.height, 0);
  return Number(covered.toFixed(6));
}

function seatsSharingRoom(deal: Deal): Array<[Seat, Seat]> {
  const shares = (seat: Seat): ScreenRect => shareOf(seat);
  return pairs([...deal.seats]).filter(([one, other]) => overlaps(shares(one), shares(other)));
}

function cutsOf(deal: Deal): number[] {
  return deal.seats.flatMap(({ left, top, right, bottom }) =>
    [left, top, right, bottom].map((line) => line.of),
  );
}

function roomOf(rect: ScreenRect): number {
  return rect.width * rect.height;
}

function boundsOf(way: Way): ScreenRect[] {
  return way.seats.map((seat) => seat.bounds);
}

function onTheLines(rect: ScreenRect, canvas: ScreenRect): boolean {
  const cuts = [1, 2, 3, 4];
  const across = cuts.flatMap((of) => gridTracks(canvas.x - gap, canvas.width + 2 * gap, of));
  const down = cuts.flatMap((of) => gridTracks(canvas.y - gap, canvas.height + 2 * gap, of));
  return (
    across.some((track) => track.start === rect.x) &&
    across.some((track) => track.end === rect.x + rect.width) &&
    down.some((track) => track.start === rect.y) &&
    down.some((track) => track.end === rect.y + rect.height)
  );
}

function isInside(area: ScreenRect, rect: ScreenRect): boolean {
  return (
    rect.x >= area.x + gap &&
    rect.y >= area.y + gap &&
    rect.x + rect.width <= area.x + area.width - gap &&
    rect.y + rect.height <= area.y + area.height - gap
  );
}

describe("the catalogue of arrangements for eight to twelve panes", () => {
  for (const count of dealtCounts) {
    const deals = dealsFor(count);

    it(`${count}: every arrangement seats exactly ${count}, each on room of its own, none left empty`, () => {
      for (const deal of deals) {
        expect(deal.seats, deal.name).toHaveLength(count);
        expect(seatsSharingRoom(deal), deal.name).toEqual([]);
        expect(shareCovered(deal), deal.name).toBe(1);
        expect(Math.max(...cutsOf(deal)), deal.name).toBeLessThanOrEqual(dealMetrics.finestCut);
        expect(Math.min(...cutsOf(deal)), deal.name).toBeGreaterThanOrEqual(2);
      }
    });
  }

  it("draws a seat as the letters it is written in", () => {
    const tower = drawn("tower", "abb", "acd", "aef", "agh");
    const thirds = (at: number) => ({ of: 3, at });
    const quarters = (at: number) => ({ of: 4, at });
    expect(tower.seats.slice(0, 3)).toEqual([
      { left: thirds(0), top: quarters(0), right: thirds(1), bottom: quarters(4) },
      { left: thirds(1), top: quarters(0), right: thirds(3), bottom: quarters(1) },
      { left: thirds(1), top: quarters(1), right: thirds(2), bottom: quarters(2) },
    ]);
    expect(shareOf(tower.seats[0] as Seat)).toEqual({ x: 0, y: 0, width: 0.333333333, height: 1 });
    expect(shareOf(flipped(tower).seats[0] as Seat)).toEqual({
      x: 0,
      y: 0,
      width: 0.666666667,
      height: 0.25,
    });
    expect(sameSeats(flipped(flipped(tower)), tower)).toBe(true);
    expect(mirrorsItself(tower)).toBe(false);
    expect(mirrorsItself(drawn("ledger", "ab", "cd"))).toBe(true);
  });
});

describe("every arrangement, on every desk", () => {
  for (const { where, desk } of everyDesk) {
    const area = desk.workArea;
    for (const count of dealtCounts) {
      const ways = waysOf(desk, count);

      it(`${count} on ${where}: every arrangement in the catalogue holds`, () => {
        expect(looksOf(ways)).toEqual(dealsFor(count).map((deal) => deal.name));
      });

      it(`${count} on ${where}: nothing overlaps, every edge is on a grid line one gap from the next`, () => {
        for (const deal of dealsFor(count)) {
          const canvas = canvasOf(desk, deal);
          for (const way of called(ways, deal.name)) {
            const seats = boundsOf(way);
            expect(seats, deal.name).toHaveLength(count);
            expect(
              pairs(seats).filter(([one, other]) => overlaps(grown(one, gap - 1), other)),
              deal.name,
            ).toEqual([]);
            expect(
              seats.filter((seat) => !onTheLines(seat, canvas)),
              deal.name,
            ).toEqual([]);
          }
        }
      });

      it(`${count} on ${where}: every pane is inside the display, with room for its title and more`, () => {
        for (const way of ways) {
          const seats = boundsOf(way);
          expect(
            seats.filter((seat) => !isInside(area, seat)),
            way.look,
          ).toEqual([]);
          expect(Math.min(...seats.map((seat) => seat.width)), way.look).toBeGreaterThanOrEqual(
            Math.max(smallestSeat.width, shapeMetrics.titleInSight),
          );
          expect(Math.min(...seats.map((seat) => seat.height)), way.look).toBeGreaterThanOrEqual(
            Math.max(smallestSeat.height, shapeMetrics.titleStep),
          );
        }
      });

      it(`${count} on ${where}: a heavier pane never sits in a smaller seat than a lighter one`, () => {
        const weighed = arriving(count);
        const weightOf = (id: string): number =>
          weighed.find((pane) => pane.id === id)?.weight ?? 0;
        for (const way of ways) {
          const heaviestFirst = way.seats.toSorted((a, b) => weightOf(b.id) - weightOf(a.id));
          const rooms = heaviestFirst.map((seat) => roomOf(seat.bounds));
          const lightest = (weight: number): number =>
            Math.min(
              ...heaviestFirst
                .filter((seat) => weightOf(seat.id) === weight)
                .map((seat) => roomOf(seat.bounds)),
            );
          const largestOf = (weight: number): number =>
            Math.max(
              ...heaviestFirst
                .filter((seat) => weightOf(seat.id) === weight)
                .map((seat) => roomOf(seat.bounds)),
            );
          expect(rooms.length, way.look).toBe(count);
          expect(lightest(9), way.look).toBeGreaterThanOrEqual(largestOf(2));
          expect(lightest(2), way.look).toBeGreaterThanOrEqual(largestOf(1));
          expect(lightest(1), way.look).toBeGreaterThanOrEqual(largestOf(0));
        }
      });

      it(`${count} on ${where}: the panes start one even step apart, the first by the console's corner`, () => {
        for (const way of ways) {
          const starts = way.arrives.map((start) => start.atMs);
          expect(starts, way.look).toEqual(starts.map((_, turn) => turn * stepMs(count)));
          expect(way.arrives.map((start) => start.id).toSorted()).toEqual(
            way.seats.map((seat) => seat.id).toSorted(),
          );
          expect(starts.at(-1)).toBeLessThanOrEqual(510);
          const first = way.seats.find((seat) => seat.id === way.arrives[0]?.id)?.bounds;
          expect(first?.y, way.look).toBe(Math.min(...boundsOf(way).map((seat) => seat.y)));
        }
      });
    }
  }
});

describe("where an arrangement is dealt", () => {
  const standsOf = (desk: Desk, count: number): string[] =>
    looksOf(waysOf(desk, count)).map(
      (look) => `${look} ${called(waysOf(desk, count), look)[0]?.stands}`,
    );
  const leftmost = (way: Way | undefined): number =>
    Math.min(...(way?.seats ?? []).map((seat) => seat.bounds.x));

  it("stands beside the console when its seats are large enough there, as on a roomy display", () => {
    for (const count of dealtCounts) {
      const ways = waysOf(windowed(wide), count);
      expect(ways.every((way) => way.stands === "beside")).toBe(true);
      const console = windowed(wide).console;
      expect(Math.min(...ways.map(leftmost))).toBe(console.x + console.width + gap);
    }
  });

  it("stands beside a windowed console on 1920x1080 only where two columns are enough", () => {
    expect(standsOf(windowed(full), 8)).toEqual([
      "tower over",
      "ledger beside",
      "studio over",
      "banner over",
    ]);
    expect(standsOf(windowed(full), 12).every((stands) => stands.endsWith("over"))).toBe(true);
  });

  it("covers a console it cannot stand beside, all but a title's width of its near edge", () => {
    const nearEdge = (desk: Desk): number =>
      Math.max(desk.workArea.x, desk.console.x) + shapeMetrics.titleInSight;
    for (const desk of [windowed(full), widened(full), maximised(full), maximised(wide)]) {
      for (const count of dealtCounts) {
        for (const way of waysOf(desk, count).filter((each) => each.stands === "over")) {
          expect(leftmost(way), `${count} ${way.look}`).toBe(nearEdge(desk));
        }
      }
    }
  });

  it("takes the whole display where four columns would be too narrow to read beside the edge", () => {
    const ways = waysOf(maximised(small), 12);
    expect(leftmost(called(ways, "dozen")[0])).toBe(gap);
    expect(leftmost(called(waysOf(maximised(small), 8), "tower")[0])).toBe(
      shapeMetrics.titleInSight,
    );
    const cell = smallestOn(
      { x: gap, y: gap, width: small.width - 2 * gap, height: 744 },
      drawn("four", "abcd", "efgh", "ijkl", "mnop"),
    );
    expect(cell).toEqual({ width: 326, height: 177 });
    expect(cell.width).toBeGreaterThanOrEqual(smallestSeat.width);
  });

  it("turns the picture to face a console that stands on the right, and offers it turned away too", () => {
    const console = { x: 2200, y: 300, width: 1500, height: 1200 };
    const desk = deskOf(wide, console, false, outOfTheWay(wide));
    const towers = called(waysOf(desk, 8), "tower");
    const tallOf = (way: Way): ScreenRect =>
      boundsOf(way).toSorted((a, b) => b.height - a.height)[0] as ScreenRect;
    expect(towers[0]?.stands).toBe("beside");
    const farEdge = tallOf(towers[0] as Way).x + tallOf(towers[0] as Way).width;
    expect(farEdge).toBeLessThanOrEqual(console.x - gap);
    expect(farEdge).toBeGreaterThan(console.x - gap - 3);
    expect(new Set(towers.map((way) => tallOf(way).x)).size).toBe(2);
    expect(called(waysOf(desk, 8), "ledger")).toHaveLength(3);
    expect(towers).toHaveLength(6);
  });

  it("keeps clear of panes already outside, or does not deal at all", () => {
    const desk = maximised(full);
    const inTheWay = [{ x: 900, y: 400, width: 300, height: 200 }];
    expect(waysOf(desk, 8, inTheWay)).toEqual([]);
    const outOfIt = [{ x: 20, y: 400, width: 80, height: 200 }];
    expect(looksOf(waysOf(desk, 8, outOfIt))).toEqual(["tower", "ledger", "studio", "banner"]);
  });
});

describe("panes dealt evenly, for the counts the catalogue does not name", () => {
  it("fills rows as evenly as it can, each row cut into as many equal seats as it holds", () => {
    const rowsOf = (deal: Deal): string =>
      [...new Set(deal.seats.map((seat) => seat.top.at))]
        .map((row) => deal.seats.filter((seat) => seat.top.at === row))
        .map((row) => `${row.length} of ${row[0]?.right.of}`)
        .join(", ");
    expect(rowsOf(evenRows(1))).toBe("1 of 1");
    expect(rowsOf(evenRows(2))).toBe("2 of 2");
    expect(rowsOf(evenRows(3))).toBe("2 of 2, 1 of 1");
    expect(rowsOf(evenRows(5))).toBe("3 of 3, 2 of 2");
    expect(rowsOf(evenRows(7))).toBe("3 of 3, 2 of 2, 2 of 2");
    expect(rowsOf(evenRows(13))).toBe("4 of 4, 3 of 3, 3 of 3, 3 of 3");
    expect(rowsOf(evenRows(16))).toBe("4 of 4, 4 of 4, 4 of 4, 4 of 4");
    expect(shareOf(evenRows(5).seats[3] as Seat)).toEqual({
      x: 0,
      y: 0.5,
      width: 0.5,
      height: 0.5,
    });
  });

  it("covers every cell once for every count up to sixteen, and offers the turn of it", () => {
    for (let count = 1; count <= dealMetrics.most; count += 1) {
      if (dealtCounts.some((named) => named === count)) continue;
      const deals = dealsFor(count);
      expect(deals[0]?.name, `${count}`).toBe("rows");
      for (const deal of deals) {
        expect(deal.seats, `${count} ${deal.name}`).toHaveLength(count);
        expect(seatsSharingRoom(deal), `${count} ${deal.name}`).toEqual([]);
        expect(shareCovered(deal), `${count} ${deal.name}`).toBe(1);
        expect(Math.max(...cutsOf(deal))).toBeLessThanOrEqual(dealMetrics.finestCut);
      }
      expect(deals.map((deal) => deal.name)).toEqual(
        sameSeats(evenRows(count), turned(evenRows(count), "columns"))
          ? ["rows"]
          : ["rows", "columns"],
      );
    }
    expect(dealsFor(17)).toEqual([]);
    expect(dealsFor(0)).toEqual([]);
  });

  it("deals thirteen to sixteen as tidily as twelve, nothing overlapping", () => {
    for (const { where, desk } of everyDesk) {
      for (const count of [13, 14, 15, 16]) {
        const [way] = waysOf(desk, count);
        const seats = boundsOf(way as Way);
        expect(seats, `${count} on ${where}`).toHaveLength(count);
        expect(pairs(seats).filter(([one, other]) => overlaps(grown(one, gap - 1), other))).toEqual(
          [],
        );
        expect(seats.every((seat) => isInside(desk.workArea, seat))).toBe(true);
        expect(way?.arrives.at(-1)?.atMs).toBeLessThanOrEqual(510);
      }
    }
  });
});

describe("dealing again", () => {
  const incoming = (desk: Desk, count: number): Incoming => ({ desk, arriving: arriving(count) });

  for (const { where, desk } of everyDesk) {
    for (const count of dealtCounts) {
      it(`${count} on ${where}: goes through every arrangement in turn and comes back to the first`, () => {
        const names = dealsFor(count).map((deal) => deal.name);
        const dealt: string[] = [];
        let after: string | undefined;
        for (const turn of [...names.keys(), names.length]) {
          const next = nextDeal(incoming(desk, count), after);
          expect(next?.turn).toBe((turn % names.length) + 1);
          expect(next?.of).toBe(names.length);
          after = next?.way.look;
          dealt.push(after as string);
        }
        expect(dealt).toEqual([...names, names[0]]);
      });
    }
  }

  it("starts from the first when the last look was not one of these", () => {
    expect(nextDeal(incoming(maximised(full), 8), "dozen")?.way.look).toBe("tower");
    expect(nextDeal(incoming(maximised(full), 8), "grid right, rows first, outward")?.turn).toBe(1);
  });

  it("deals the one even arrangement for a count that has no other, and none for too many", () => {
    expect(nextDeal(incoming(maximised(full), 4), undefined)).toMatchObject({ turn: 1, of: 1 });
    expect(nextDeal(incoming(maximised(full), 4), "rows")?.way.look).toBe("rows");
    expect(nextDeal(incoming(maximised(full), 5), "rows")?.way.look).toBe("columns");
    expect(nextDeal(incoming(maximised(full), 17), undefined)).toBeUndefined();
  });
});

describe("which arrangement a burst is given", () => {
  const unrolled = (): number => {
    throw new Error("a keeper's own action rolls no dice");
  };
  const manySeeds = Array.from({ length: 64 }, (_, seed) => seed + 1);

  it("is the first for the keeper, with no dice and whatever came before", () => {
    for (const count of dealtCounts) {
      const ways = waysOf(maximised(full), count);
      const [first] = dealsFor(count);
      for (const previous of [undefined, first?.name, "dozen"]) {
        expect(chosenWay(ways, { asker: "keeper", previous }, unrolled)).toBe(ways[0]);
      }
      expect(ways[0]?.look).toBe(first?.name);
    }
  });

  it("varies for a creature among every arrangement that holds, the same for the same seed", () => {
    for (const count of dealtCounts) {
      const ways = waysOf(maximised(full), count);
      const chosen = manySeeds.map(
        (seed) => chosenWay(ways, { asker: "creature" }, mulberry32(seed))?.look,
      );
      expect(new Set(chosen)).toEqual(new Set(dealsFor(count).map((deal) => deal.name)));
      for (const seed of seeds) {
        expect(chosenWay(ways, { asker: "creature" }, mulberry32(seed))).toBe(
          chosenWay(ways, { asker: "creature" }, mulberry32(seed)),
        );
      }
    }
  });

  it("does not deal a creature the arrangement it was dealt last, when another holds", () => {
    for (const count of dealtCounts) {
      const ways = waysOf(maximised(full), count);
      for (const previous of looksOf(ways)) {
        const chosen = manySeeds.map(
          (seed) => chosenWay(ways, { asker: "creature", previous }, mulberry32(seed))?.look,
        );
        expect(chosen).not.toContain(previous);
        expect(new Set(chosen).size).toBe(looksOf(ways).length - 1);
      }
    }
  });

  it("repeats it when it alone holds, and chooses nothing from nothing", () => {
    const ways = waysOf(maximised(full), 16);
    expect(looksOf(ways)).toEqual(["rows"]);
    expect(chosenWay(ways, { asker: "creature", previous: "rows" }, mulberry32(3))?.look).toBe(
      "rows",
    );
    expect(chosenWay([], { asker: "creature" }, mulberry32(3))).toBeUndefined();
    expect(chosenWay([], { asker: "keeper" }, unrolled)).toBeUndefined();
  });
});

describe("a seat on a canvas", () => {
  const canvas: ScreenRect = { x: 128, y: 12, width: 1780, height: 1056 };
  const four = drawn("four", "abcd", "efgh", "ijkl", "mnop");
  const quarter = (at: number) => ({ of: 4, at });
  const spanning = (left: number, top: number, right: number, bottom: number): Seat => ({
    left: quarter(left),
    top: quarter(top),
    right: quarter(right),
    bottom: quarter(bottom),
  });

  it("spans whole cells and the gaps between them, never a part of one", () => {
    expect(seatOn(canvas, spanning(0, 0, 1, 1))).toEqual({
      x: 128,
      y: 12,
      width: 436,
      height: 255,
    });
    expect(seatOn(canvas, spanning(0, 0, 2, 2))).toEqual({
      x: 128,
      y: 12,
      width: 436 * 2 + gap,
      height: 255 * 2 + gap,
    });
    expect(seatOn(canvas, spanning(3, 3, 4, 4))).toEqual({
      x: 128 + 3 * (436 + gap),
      y: 12 + 3 * (255 + gap),
      width: 436,
      height: 255,
    });
  });

  it("puts a seat's edges on the lines of whichever cuts they name, a half beside a third", () => {
    const wholeTall = { top: { of: 1, at: 0 }, bottom: { of: 1, at: 1 } };
    const leftHalf = seatOn(canvas, {
      ...wholeTall,
      left: { of: 2, at: 0 },
      right: { of: 2, at: 1 },
    });
    const pastTheHalf = seatOn(canvas, {
      ...wholeTall,
      left: { of: 2, at: 1 },
      right: { of: 3, at: 2 },
    });
    const lastThird = seatOn(canvas, {
      ...wholeTall,
      left: { of: 3, at: 2 },
      right: { of: 1, at: 1 },
    });
    expect(leftHalf).toEqual({ x: 128, y: 12, width: 884, height: 1056 });
    expect(pastTheHalf.x).toBe(leftHalf.x + leftHalf.width + gap);
    expect(lastThird.x).toBe(pastTheHalf.x + pastTheHalf.width + gap);
    expect(lastThird.x + lastThird.width).toBeGreaterThan(canvas.x + canvas.width - 3);
    expect(lastThird.x + lastThird.width).toBeLessThanOrEqual(canvas.x + canvas.width);
  });

  it("holds an arrangement only while its smallest seat is wide and tall enough to read", () => {
    expect(smallestSeat).toEqual({ width: 320, height: 160 });
    expect(holdsOn(canvas, four)).toBe(true);
    expect(holdsOn({ ...canvas, width: 4 * 320 + 3 * gap }, four)).toBe(true);
    expect(holdsOn({ ...canvas, width: 4 * 320 + 3 * gap - 1 }, four)).toBe(false);
    expect(holdsOn({ ...canvas, height: 4 * 160 + 3 * gap - 1 }, four)).toBe(false);
  });
});
