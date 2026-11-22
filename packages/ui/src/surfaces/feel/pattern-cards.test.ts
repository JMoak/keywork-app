import { mulberry32, overlaps } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import { presetSize, type SizeName } from "../outside/grid.ts";
import type { Desk, ScreenRect } from "../port.ts";
import { type OutsideKind, outsideMetrics, type Wanted } from "./arrange.ts";
import { chosenWay } from "./pattern-choice.ts";
import {
  deskOf,
  grown,
  maximised,
  outOfTheWay,
  pairs,
  windowed,
  workAreas,
} from "./pattern-testing.ts";
import { type Burst, cardMetrics, cardWays, stepMs, tidyWays, type Way } from "./patterns.ts";

const { gap } = outsideMetrics;
const [small, full, wide] = workAreas as [ScreenRect, ScreenRect, ScreenRect];
const sizesDown: readonly SizeName[] = ["working", "reading", "card"];
const manySeeds = Array.from({ length: 64 }, (_, seed) => seed + 1);

function burstOf(
  desk: Desk,
  count: number,
  kind: OutsideKind = "conversation",
  standing: readonly ScreenRect[] = [],
  called = "pane",
): Burst {
  const at = (name: SizeName): Wanted[] =>
    Array.from({ length: count }, (_, index) => ({
      id: `${called}-${index}`,
      size: presetSize(name, desk.workArea, kind),
    }));
  return { desk, ladder: sizesDown.map(at), standing };
}

function keepers(desk: Desk, count: number, kind?: OutsideKind): Way {
  return tidyWays(burstOf(desk, count, kind))[0] as Way;
}

function boundsOf(way: Way): ScreenRect[] {
  return way.seats.map((seat) => seat.bounds);
}

function sizeOf(way: Way): string {
  return [...new Set(boundsOf(way).map((seat) => `${seat.width}x${seat.height}`))].join(" ");
}

function cornersOf(way: Way): Array<[number, number]> {
  return boundsOf(way).map((seat) => [seat.x, seat.y]);
}

function crowded(way: Way): Array<[ScreenRect, ScreenRect]> {
  return pairs(boundsOf(way)).filter(([one, other]) => overlaps(grown(one, gap - 1), other));
}

function insideTheMargin(area: ScreenRect, rect: ScreenRect): boolean {
  return (
    rect.x >= area.x + gap &&
    rect.y >= area.y + gap &&
    rect.x + rect.width <= area.x + area.width - gap &&
    rect.y + rect.height <= area.y + area.height - gap
  );
}

function widened(area: ScreenRect): Desk {
  const console = {
    x: area.x + 40,
    y: area.y + 40,
    width: Math.round(area.width * 0.85),
    height: Math.round(area.height * 0.85),
  };
  return deskOf(area, console, false, outOfTheWay(area));
}

function centred(area: ScreenRect): Desk {
  const console = {
    x: Math.round(area.width * 0.3),
    y: Math.round(area.height * 0.2),
    width: Math.round(area.width * 0.4),
    height: Math.round(area.height * 0.5),
  };
  return deskOf(area, console, false, outOfTheWay(area));
}

describe("one to three panes", () => {
  const desk = windowed(full);
  const corner = { x: desk.console.x + desk.console.width + gap, y: desk.console.y };

  it("stand in a column beside the console, level with its top, one gap apart", () => {
    expect(cardMetrics.longestColumn).toBe(3);
    expect(cornersOf(keepers(desk, 1))).toEqual([[corner.x, corner.y]]);
    expect(cornersOf(keepers(desk, 2))).toEqual([
      [corner.x, corner.y],
      [corner.x, corner.y + 320 + gap],
    ]);
    const three = keepers(desk, 3);
    expect(new Set(boundsOf(three).map((seat) => seat.x))).toEqual(new Set([corner.x]));
    expect(crowded(three)).toEqual([]);
    expect(boundsOf(three).at(-1)?.y).toBe(full.height - gap - 320);
    expect([keepers(desk, 1), keepers(desk, 2), three].map((way) => way.stands)).toEqual([
      "beside",
      "beside",
      "beside",
    ]);
  });

  it("step down the named sizes until the column fits beside the console", () => {
    expect(sizeOf(keepers(desk, 1))).toBe("624x648");
    expect(sizeOf(keepers(desk, 2))).toBe("624x320");
    expect(sizeOf(keepers(desk, 3))).toBe("624x320");
    expect(sizeOf(keepers(windowed(wide), 3))).toBe("945x320");
    expect(sizeOf(keepers(windowed(wide), 1))).toBe("945x1296");
    expect(sizeOf(keepers(desk, 1, "file"))).toBe("942x648");
    expect(keepers(desk, 1, "file").stands).toBe("over");
  });

  it("arrive top to bottom, a slight step apart", () => {
    const three = keepers(desk, 3);
    expect(three.arrives).toEqual([
      { id: "pane-0", atMs: 0 },
      { id: "pane-1", atMs: 60 },
      { id: "pane-2", atMs: 120 },
    ]);
    const tops = three.arrives.map(
      (start) => three.seats.find((seat) => seat.id === start.id)?.bounds.y,
    );
    expect(tops).toEqual(tops.toSorted((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it("stand in a column over the far side of a console that leaves no room beside it", () => {
    for (const blocked of [maximised(full), widened(full)]) {
      for (const count of [1, 2, 3]) {
        const way = keepers(blocked, count);
        expect(way.stands).toBe("over");
        expect(new Set(boundsOf(way).map((seat) => seat.x)).size).toBe(1);
        expect(crowded(way)).toEqual([]);
        const nearSide = blocked.console.x + blocked.console.width / 3;
        expect(Math.min(...boundsOf(way).map((seat) => seat.x))).toBeGreaterThanOrEqual(nearSide);
      }
    }
    expect(cornersOf(keepers(maximised(full), 1))).toEqual([[full.width - gap - 624, gap]]);
    expect(sizeOf(keepers(maximised(full), 1))).toBe("624x648");
    expect(sizeOf(keepers(maximised(full), 3))).toBe("624x320");
  });

  it("stand over the far side of a console that spans the display, leaving the strip below to a grid", () => {
    const docked = deskOf(full, { x: 0, y: 0, width: 1920, height: 700 }, false, outOfTheWay(full));
    const column = keepers(docked, 3);
    expect(column.look).toBe("column over");
    expect(sizeOf(column)).toBe("624x320");
    const row = keepers(docked, 6);
    expect(row.look).toBe("grid below, rows first, outward");
    expect(sizeOf(row)).toBe("624x160");
    expect(Math.min(...boundsOf(row).map((seat) => seat.y))).toBe(700 + gap);
    expect(crowded(row)).toEqual([]);
  });

  it("stand one gap below a pane already there, at the size that still fits", () => {
    const first = keepers(desk, 1);
    const [standing] = boundsOf(first) as [ScreenRect];
    const second = tidyWays(burstOf(desk, 1, "note", [standing], "later"))[0] as Way;
    expect(cornersOf(second)).toEqual([[standing.x, standing.y + standing.height + gap]]);
    expect(sizeOf(second)).toBe("624x320");
    expect(second.stands).toBe("beside");
    const taken = [standing, ...boundsOf(second)];
    const third = tidyWays(burstOf(desk, 1, "note", taken, "last"))[0] as Way;
    expect(third.look).toBe("column over");
    expect(sizeOf(third)).toBe("624x648");
    expect(boundsOf(third).some((seat) => taken.some((pane) => overlaps(seat, pane)))).toBe(false);
  });
});

describe("four to seven panes", () => {
  it("stand as a grid of cards beside the console while the room holds them", () => {
    const desk = windowed(full);
    for (const count of [4, 5, 6]) {
      const way = keepers(desk, count);
      expect(way.look, `${count}`).toBe("grid right, rows first, outward");
      expect(way.stands).toBe("beside");
      expect(sizeOf(way)).toBe("624x160");
      expect(crowded(way)).toEqual([]);
    }
    expect(cornersOf(keepers(desk, 4))[0]).toEqual([desk.console.x + desk.console.width + gap, 86]);
  });

  it("keep a larger size where the room is there for it", () => {
    expect(sizeOf(keepers(windowed(wide), 6))).toBe("945x320");
    expect(keepers(windowed(wide), 6).stands).toBe("beside");
    expect(sizeOf(keepers(maximised(full), 4))).toBe("624x320");
    expect(sizeOf(keepers(maximised(full), 6))).toBe("624x320");
    expect(sizeOf(keepers(maximised(full), 7))).toBe("624x160");
  });

  it("lie over the far side of the console as a grid when there is no room beside it", () => {
    for (const desk of [maximised(full), widened(full), maximised(wide)]) {
      for (const count of [4, 5, 6, 7]) {
        const way = keepers(desk, count);
        expect(way.look).toBe("grid over, rows first, outward");
        expect(crowded(way)).toEqual([]);
        const farSide = desk.console.x + desk.console.width / 3 - 16;
        expect(Math.min(...boundsOf(way).map((seat) => seat.x))).toBeGreaterThanOrEqual(farSide);
        expect(boundsOf(way).every((seat) => insideTheMargin(desk.workArea, seat))).toBe(true);
      }
    }
    const tiled = boundsOf(keepers(maximised(full), 4));
    expect(tiled.map((seat) => [seat.x, seat.y])).toEqual([
      [648, 12],
      [1284, 12],
      [648, 344],
      [1284, 344],
    ]);
  });

  it("arrive as a wave from the console's corner", () => {
    const way = keepers(maximised(full), 6);
    const reach = way.arrives.map((start) => {
      const seat = way.seats.find((each) => each.id === start.id)?.bounds as ScreenRect;
      return (seat.x - 648) / 636 + (seat.y - 12) / 332;
    });
    expect(reach).toEqual([0, 1, 1, 2, 2, 3]);
    expect(way.arrives.map((start) => start.atMs)).toEqual([0, 60, 120, 180, 240, 300]);
  });

  it("are dealt evenly across the display where even cards cannot stand apart", () => {
    const way = keepers(windowed(small), 6);
    expect(way.look).toBe("rows");
    expect(sizeOf(way)).toBe("373x366");
    expect(crowded(way)).toEqual([]);
    expect(cardWays(burstOf(windowed(small), 6))).toEqual([]);
  });
});

describe("every count, on every desk", () => {
  const stances = [
    ["windowed", windowed],
    ["wide", widened],
    ["centred", centred],
    ["maximised", maximised],
  ] as const;

  for (const area of workAreas) {
    for (const [how, deskFor] of stances) {
      const desk = deskFor(area);

      it(`${area.width}x${area.height}, ${how}: one to sixteen stand apart on the display, started within about half a second`, () => {
        for (let count = 1; count <= 16; count += 1) {
          for (const kind of ["conversation", "file"] as const) {
            const ways = tidyWays(burstOf(desk, count, kind));
            expect(ways.length, `${count} ${kind}`).toBeGreaterThan(0);
            for (const way of ways) {
              const named = `${count} ${kind} ${way.look}`;
              expect(way.look, named).not.toBe("cascade");
              expect(crowded(way), named).toEqual([]);
              expect(
                boundsOf(way).filter((seat) => !insideTheMargin(area, seat)),
                named,
              ).toEqual([]);
              expect(
                way.seats.map((seat) => seat.id),
                named,
              ).toEqual(Array.from({ length: count }, (_, index) => `pane-${index}`));
              const starts = way.arrives.map((start) => start.atMs);
              expect(starts, named).toEqual(starts.map((_, turn) => turn * stepMs(count)));
              expect(starts.at(-1), named).toBeLessThanOrEqual(510);
              expect(way.arrives.map((start) => start.id).toSorted(), named).toEqual(
                way.seats.map((seat) => seat.id).toSorted(),
              );
            }
          }
        }
      });

      it(`${area.width}x${area.height}, ${how}: the ways offered are equally tidy: the same sizes, beside or over alike`, () => {
        for (let count = 1; count < 8; count += 1) {
          const ways = cardWays(burstOf(desk, count));
          expect(new Set(ways.map(sizeOf)).size, `${count}`).toBeLessThanOrEqual(1);
          expect(new Set(ways.map((way) => way.stands)).size, `${count}`).toBeLessThanOrEqual(1);
          expect(new Set(ways.map((way) => way.look)).size, `${count}`).toBe(ways.length);
        }
      });
    }
  }
});

describe("variety without disorder", () => {
  const desk = centred(wide);
  const unrolled = (): number => {
    throw new Error("a keeper's own action rolls no dice");
  };

  it("offers a column on either side of a console with room on both", () => {
    const ways = tidyWays(burstOf(desk, 3));
    expect(ways.map((way) => way.look)).toEqual(["column right", "column left"]);
    const [right, left] = ways.map((way) => boundsOf(way)[0]?.x ?? 0);
    expect(right).toBe(desk.console.x + desk.console.width + gap);
    expect((left ?? 0) + 945).toBe(desk.console.x - gap);
  });

  it("offers a grid on either side, and by rows or columns first and the wave's direction", () => {
    expect(tidyWays(burstOf(desk, 6)).map((way) => way.look)).toEqual([
      "grid right, rows first, outward",
      "grid left, rows first, outward",
    ]);
    expect(tidyWays(burstOf(maximised(wide), 6)).map((way) => way.look)).toEqual([
      "grid over, rows first, outward",
      "grid over, rows first, across",
      "grid over, columns first, outward",
      "grid over, columns first, across",
      "grid over, columns first, down",
    ]);
  });

  it("starts every wave at the console's corner, on either side", () => {
    for (const way of tidyWays(burstOf(desk, 6))) {
      const first = way.seats.find((seat) => seat.id === way.arrives[0]?.id)?.bounds as ScreenRect;
      const nearest = boundsOf(way).toSorted((a, b) => {
        const far = (seat: ScreenRect): number =>
          Math.min(
            Math.abs(seat.x - (desk.console.x + desk.console.width)),
            Math.abs(seat.x + seat.width - desk.console.x),
          );
        return far(a) - far(b) || a.y - b.y;
      })[0];
      expect(first, way.look).toEqual(nearest);
    }
  });

  it("lands a keeper's burst the same way every time, with no dice", () => {
    for (const count of [1, 2, 3, 5, 7]) {
      const ways = tidyWays(burstOf(desk, count));
      for (const previous of [undefined, ways[0]?.look, ways.at(-1)?.look]) {
        expect(chosenWay(ways, { asker: "keeper", previous }, unrolled)).toBe(ways[0]);
      }
    }
  });

  it("varies a creature's burst with the seed, among those ways only, never the one before", () => {
    const ways = tidyWays(burstOf(maximised(wide), 6));
    const looks = ways.map((way) => way.look);
    const chosen = manySeeds.map(
      (seed) => chosenWay(ways, { asker: "creature" }, mulberry32(seed))?.look,
    );
    expect(new Set(chosen).size).toBeGreaterThan(3);
    expect(chosen.every((look) => looks.includes(look as string))).toBe(true);
    for (const previous of looks) {
      const next = manySeeds.map(
        (seed) => chosenWay(ways, { asker: "creature", previous }, mulberry32(seed))?.look,
      );
      expect(next).not.toContain(previous);
    }
    expect(chosenWay(ways, { asker: "creature" }, mulberry32(7))).toBe(
      chosenWay(ways, { asker: "creature" }, mulberry32(7)),
    );
  });

  it("gives a lone pane the one place it has when only one side has room", () => {
    const ways = tidyWays(burstOf(windowed(full), 1));
    expect(ways.map((way) => way.look)).toEqual(["column right"]);
    expect(chosenWay(ways, { asker: "creature", previous: "column right" }, mulberry32(1))).toBe(
      ways[0],
    );
  });
});

describe("when nothing can stand apart", () => {
  it("falls back to the plainest pattern that overlaps, at the smallest size, every title in sight", () => {
    const desk = maximised(full);
    const [way] = tidyWays(burstOf(desk, 20));
    expect(way?.look).toBe("cascade");
    expect(sizeOf(way as Way)).toBe("624x160");
    expect(crowded(way as Way).length).toBeGreaterThan(0);
    expect(tidyWays(burstOf(desk, 20))).toHaveLength(1);
    expect(way?.arrives.map((start) => start.id)).toEqual(way?.seats.map((seat) => seat.id));
  });

  it("stands a crowd as cards when panes already outside leave no canvas to deal on", () => {
    const desk = maximised(wide);
    const inTheWay = [{ x: 400, y: 900, width: 300, height: 200 }];
    const [way] = tidyWays(burstOf(desk, 8, "conversation", inTheWay));
    expect(way?.look).toBe("grid over, rows first, outward");
    expect(crowded(way as Way)).toEqual([]);
    const [obstacle] = inTheWay as [ScreenRect];
    expect(boundsOf(way as Way).some((seat) => overlaps(grown(seat, gap), obstacle))).toBe(false);
  });

  it("plans nothing for no panes", () => {
    expect(tidyWays({ desk: maximised(full), ladder: [] })).toEqual([]);
    expect(tidyWays({ desk: maximised(full), ladder: [[]] })).toEqual([]);
  });
});
