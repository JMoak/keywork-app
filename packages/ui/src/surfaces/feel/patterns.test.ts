import { overlaps } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import type { Desk, ScreenPoint, ScreenRect } from "../port.ts";
import { type OutsideKind, orbit, outsideMetrics } from "./arrange.ts";
import { groundMetrics } from "./pattern-ground.ts";
import { shapeMetrics } from "./pattern-shapes.ts";
import {
  boundsOf,
  brokenPlaces,
  brokenTiming,
  centreOf,
  counts,
  coversTheNearSide,
  deskOf,
  grown,
  inArrivalOrder,
  landsUnderTheCursor,
  leavesTheDisplay,
  maximised,
  named,
  noteKinds,
  outOfTheWay,
  pairs,
  panes,
  settings,
  title,
  windowed,
  workAreas,
} from "./pattern-testing.ts";
import {
  type Arrangement,
  arranged,
  arrivalPace,
  burst,
  cascade,
  column,
  eligible,
  fan,
  grid,
  type Incoming,
  type Pattern,
  patterns,
  pile,
  recalled,
  stair,
  stepMs,
} from "./patterns.ts";

const lays: Record<Pattern, (incoming: Incoming) => Arrangement | undefined> = {
  cascade,
  column,
  stair,
  fan,
  grid,
  burst,
  pile,
};
const { gap, cascadeStep } = outsideMetrics;
const small = workAreas[0] as ScreenRect;
const full = workAreas[1] as ScreenRect;
const wide = workAreas[2] as ScreenRect;
const size = { width: 480, height: 320 };

function alike(count: number, called = "pane") {
  return Array.from({ length: count }, (_, index) => ({ id: `${called}-${index}`, size }));
}

function laid(lay: (incoming: Incoming) => Arrangement | undefined, incoming: Incoming) {
  return lay(incoming) as Arrangement;
}

function arrivalOf(arrangement: Arrangement): string[] {
  return arrangement.arrives.map((start) => start.id);
}

function idsOf(arriving: readonly { readonly id: string }[]): string[] {
  return arriving.map((pane) => pane.id);
}

function cursorsOver(desk: Desk, arriving: Incoming["arriving"]): ScreenPoint[] {
  const first = cascade({ desk, arriving }).seats[0]?.bounds as ScreenRect;
  return [centreOf(first), centreOf(desk.workArea), centreOf(desk.console)];
}

describe("every pattern, wherever it says it holds", () => {
  for (const area of workAreas) {
    for (const [how, deskFor] of settings) {
      for (const count of counts) {
        const incoming: Incoming = { desk: deskFor(area), arriving: panes(count, area) };
        for (const pattern of patterns) {
          const arrangement = lays[pattern](incoming);
          if (arrangement === undefined) continue;

          it(`${pattern}, ${named(area, how, count)}: keeps every promise`, () => {
            expect(arrangement.pattern).toBe(pattern);
            expect(brokenPlaces(incoming, arrangement)).toEqual([]);
            expect(brokenTiming(arrangement)).toEqual([]);
          });
        }
      }
    }
  }
});

describe("the cascade, which is never refused", () => {
  for (const area of workAreas) {
    for (const [how, deskFor] of settings) {
      for (const count of counts) {
        it(`${named(area, how, count)}: holds for notes, and for notes and files`, () => {
          for (const kinds of [undefined, noteKinds]) {
            const incoming = { desk: deskFor(area), arriving: panes(count, area, kinds) };
            expect(brokenPlaces(incoming, cascade(incoming))).toEqual([]);
          }
        });
      }
    }
  }

  it("stands in for a pattern the desk cannot hold", () => {
    const incoming = { desk: maximised(full), arriving: panes(5, full) };
    expect(stair(incoming)).toBeUndefined();
    expect(arranged("stair", incoming)).toEqual(cascade(incoming));
    expect(arranged("fan", incoming)).toEqual(fan(incoming));
  });
});

describe("the cursor", () => {
  const everyBurst = workAreas.flatMap((area) =>
    settings.flatMap(([how, deskFor]) =>
      counts.map((count) => ({ name: named(area, how, count), area, deskFor, count })),
    ),
  );
  const aroundTheCursor = ({ area, deskFor, count }: (typeof everyBurst)[number]): Incoming[] => {
    const arriving = panes(count, area);
    return cursorsOver(deskFor(area), arriving).map((cursor) => ({
      desk: deskFor(area, cursor),
      arriving,
    }));
  };

  for (const burstOf of everyBurst) {
    it(`${burstOf.name}: nothing lands under it, whichever pattern`, () => {
      for (const incoming of aroundTheCursor(burstOf)) {
        for (const pattern of patterns.filter((each) => each !== "cascade")) {
          const arrangement = lays[pattern](incoming);
          if (arrangement === undefined) continue;
          expect([pattern, incoming.desk.cursor, brokenPlaces(incoming, arrangement)]).toEqual([
            pattern,
            incoming.desk.cursor,
            [],
          ]);
        }
        const broken = brokenPlaces(incoming, cascade(incoming));
        expect(broken).not.toContain(landsUnderTheCursor);
        expect(broken).not.toContain(leavesTheDisplay);
      }
    });
  }

  it("costs the cascade a title only where sixteen crowd the smallest display around it", () => {
    const strained = everyBurst.filter((burstOf) =>
      aroundTheCursor(burstOf).some(
        (incoming) => brokenPlaces(incoming, cascade(incoming)).length > 0,
      ),
    );
    expect(strained.map((burstOf) => burstOf.name)).toEqual([
      "16 on 1366x768, windowed",
      "16 on 1366x768, maximised",
    ]);
  });
});

describe("panes already outside", () => {
  for (const area of workAreas) {
    for (const [how, deskFor] of settings) {
      const desk = deskFor(area);
      const earlier = eligible({ desk, arriving: panes(3, area, noteKinds, "earlier") });
      for (const count of counts) {
        it(`${named(area, how, count)}: stay clear of the apart, and keep their titles under any`, () => {
          for (const before of earlier) {
            const incoming: Incoming = {
              desk,
              arriving: panes(count, area),
              standing: boundsOf(before),
            };
            for (const pattern of patterns) {
              const arrangement = lays[pattern](incoming);
              if (arrangement === undefined) continue;
              expect([before.pattern, pattern, brokenPlaces(incoming, arrangement)]).toEqual([
                before.pattern,
                pattern,
                [],
              ]);
            }
          }
        });
      }
    }
  }

  it("lets a second cascade carry on down the first one's diagonal", () => {
    const desk = maximised(full);
    const first = cascade({ desk, arriving: alike(3, "first") });
    const second = cascade({ desk, arriving: alike(3, "second"), standing: boundsOf(first) });
    expect(boundsOf(second)).toEqual(
      [3, 4, 5].map((step) => ({
        x: full.width - gap - size.width - step * cascadeStep,
        y: gap + step * cascadeStep,
        ...size,
      })),
    );
  });
});

describe("room", () => {
  const held = (desk: Desk, count: number, kinds?: readonly OutsideKind[]) =>
    eligible({ desk, arriving: panes(count, desk.workArea, kinds) });
  const names = (arrangements: readonly Arrangement[]): string =>
    arrangements.map((arrangement) => arrangement.pattern).join(" ");
  const stands = (arrangements: readonly Arrangement[]): string[] => [
    ...new Set(arrangements.map((arrangement) => arrangement.stands)),
  ];

  for (const area of workAreas) {
    for (const [how, deskFor] of settings) {
      for (const count of counts) {
        it(`${named(area, how, count)}: what holds stands all beside the console or all over it`, () => {
          expect(stands(held(deskFor(area), count))).toHaveLength(1);
        });
      }
    }
  }

  it("keeps every burst off the console where the desk has room for it", () => {
    for (const count of counts) {
      expect(stands(held(windowed(wide), count))).toEqual(["beside"]);
      expect(stands(held(windowed(full), count))).toEqual(["beside"]);
      expect(stands(held(maximised(wide), count))).toEqual(["over"]);
    }
    expect(stands(held(windowed(small), 8, noteKinds))).toEqual(["beside"]);
    expect(stands(held(windowed(small), 8))).toEqual(["over"]);
  });

  it("holds every pattern for a few panes on a roomy desk, and fewer as room runs out", () => {
    expect(names(held(windowed(wide), 5))).toBe("cascade column stair fan grid burst pile");
    expect(names(held(windowed(wide), 8))).toBe("cascade column stair fan grid burst pile");
    expect(names(held(windowed(wide), 16))).toBe("cascade column pile");
    expect(names(held(windowed(wide), 16, noteKinds))).toBe("cascade column grid burst pile");
    expect(names(held(windowed(full), 2))).toBe("cascade column stair fan grid pile");
    expect(names(held(windowed(full), 5))).toBe("cascade pile");
    expect(names(held(windowed(full), 5, noteKinds))).toBe("cascade burst pile");
    expect(names(held(windowed(full), 8))).toBe("pile");
    expect(names(held(windowed(full), 16))).toBe("pile");
    expect(names(held(windowed(small), 2, noteKinds))).toBe("cascade column stair fan grid pile");
    expect(names(held(windowed(small), 8, noteKinds))).toBe("pile");
  });

  it("holds only the patterns that may overlap once the console fills the display", () => {
    expect(names(held(maximised(wide), 1))).toBe("cascade fan pile");
    expect(names(held(maximised(wide), 16))).toBe("cascade fan pile");
    expect(names(held(maximised(full), 5))).toBe("cascade fan pile");
    expect(names(held(maximised(full), 8))).toBe("cascade pile");
    expect(names(held(maximised(full), 16))).toBe("cascade pile");
    expect(names(held(maximised(small), 2))).toBe("cascade fan pile");
    expect(names(held(maximised(small), 8))).toBe("cascade pile");
    expect(names(held(maximised(small), 16))).toBe("cascade");
    expect(names(held(windowed(small), 16))).toBe("cascade pile");
  });

  it("keeps the near side of the console clear, the far two thirds for all but a crowd", () => {
    const farSide = (area: ScreenRect): number =>
      area.width - Math.round(area.width * groundMetrics.farShare);
    for (const area of workAreas) {
      for (const each of held(maximised(area), 5)) {
        expect(boundsOf(each).every((seat) => seat.x >= farSide(area))).toBe(true);
      }
    }
    const crowd = boundsOf(cascade({ desk: maximised(small), arriving: panes(16, small) }));
    expect(Math.min(...crowd.map((seat) => seat.x))).toBeLessThan(farSide(small));
    expect(Math.min(...crowd.map((seat) => seat.x))).toBeGreaterThanOrEqual(title.width);
  });

  it("straddles the far edge of a console too narrow for a pane, when there is no room beside", () => {
    const desk = windowed(small);
    const seats = boundsOf(cascade({ desk, arriving: panes(2, small) }));
    const farEdge = desk.console.x + desk.console.width;
    const top = desk.console.y + gap;
    expect(seats.map((seat) => seat.y)).toEqual([top, top + cascadeStep]);
    expect(seats.every((seat) => seat.x < farEdge && seat.x + seat.width > farEdge)).toBe(true);
    expect(Math.max(...seats.map((seat) => seat.x + seat.width))).toBeLessThanOrEqual(
      small.width - gap,
    );
  });
});

describe("other desks", () => {
  const second: ScreenRect = { x: 1920, y: 40, width: 2560, height: 1400 };
  const consoles = {
    "room on the left": { x: 0.45, y: 0.1, width: 0.52, height: 0.7 },
    "room below": { x: 0, y: 0, width: 1, height: 0.5 },
    "room above": { x: 0, y: 0.5, width: 1, height: 0.5 },
    "room all round": { x: 0.3, y: 0.25, width: 0.4, height: 0.5 },
  } as const;
  const wheres = Object.keys(consoles) as Array<keyof typeof consoles>;
  const deskWith = (area: ScreenRect, where: keyof typeof consoles): Desk => {
    const share = consoles[where];
    const console = {
      x: area.x + Math.round(area.width * share.x),
      y: area.y + Math.round(area.height * share.y),
      width: Math.round(area.width * share.width),
      height: Math.round(area.height * share.height),
    };
    return deskOf(area, console, false, outOfTheWay(area));
  };
  const everyDesk: Array<[string, Desk]> = [
    ...[...workAreas, second].flatMap((area) =>
      wheres.map((where): [string, Desk] => [
        `${area.width}x${area.height} at ${area.x},${area.y}, ${where}`,
        deskWith(area, where),
      ]),
    ),
    ["a second display, windowed", windowed(second)],
    ["a second display, maximised", maximised(second)],
  ];

  for (const [where, desk] of everyDesk) {
    it(`${where}: every pattern that holds keeps its promises`, () => {
      for (const count of counts) {
        for (const kinds of [undefined, noteKinds]) {
          const incoming = { desk, arriving: panes(count, desk.workArea, kinds) };
          for (const pattern of patterns) {
            const arrangement = lays[pattern](incoming);
            if (arrangement === undefined) continue;
            const broken = brokenPlaces(incoming, arrangement).filter(
              (promise) => pattern !== "cascade" || promise !== coversTheNearSide,
            );
            expect([count, pattern, broken]).toEqual([count, pattern, []]);
          }
        }
      }
    });
  }

  it("mirrors a burst on the console's left, still nearest first", () => {
    const desk = deskWith(wide, "room on the left");
    const arrangement = laid(burst, { desk, arriving: alike(8) });
    const rights = inArrivalOrder(arrangement).map((seat) => seat.bounds.x + seat.bounds.width);
    expect(rights[0]).toBe(desk.console.x - gap);
    expect(rights).toEqual(rights.toSorted((a, b) => b - a));
  });

  it("lets a small console in the middle of a small display be covered past its far side", () => {
    const desk = deskWith(small, "room all round");
    const incoming = { desk, arriving: panes(5, small) };
    expect(brokenPlaces(incoming, cascade(incoming))).toEqual([coversTheNearSide]);
  });
});

describe("the cascade", () => {
  it("steps each pane down and across by a title strip, where the orbit cascades today", () => {
    const desk = maximised(full);
    expect(cascade({ desk, arriving: alike(3) }).seats).toEqual(orbit(desk, alike(3)));
    expect(cascadeStep).toBeGreaterThanOrEqual(outsideMetrics.strip);
  });

  it("stands beside the console when there is room, its front pane at the console's corner", () => {
    const desk = windowed(wide);
    const seats = boundsOf(cascade({ desk, arriving: alike(4) }));
    const corner = { x: desk.console.x + desk.console.width + gap, y: desk.console.y };
    expect(seats).toEqual(
      [0, 1, 2, 3].map((step) => ({
        x: corner.x + (3 - step) * cascadeStep,
        y: corner.y + step * cascadeStep,
        ...size,
      })),
    );
  });

  it("wraps to a new diagonal at the edge, a title's width along, so the first keeps its titles", () => {
    const seats = boundsOf(cascade({ desk: maximised(small), arriving: alike(16) }));
    const [first, ninth] = [seats[0] as ScreenRect, seats[8] as ScreenRect];
    expect(ninth.y).toBe(first.y);
    expect(ninth.x - first.x).toBe(title.width);
    expect(seats.slice(1, 8).map((seat) => [first.x - seat.x, seat.y - first.y])).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((step) => [step * cascadeStep, step * cascadeStep]),
    );
    expect(Math.max(...seats.map((seat) => seat.x + seat.width))).toBe(small.width - gap);
  });
});

describe("the column", () => {
  it("is the orbit's seating beside the console", () => {
    const desk = windowed(wide);
    const arriving = panes(8, wide);
    const seated = laid(column, { desk, arriving });
    expect(seated.seats).toEqual(orbit(desk, arriving));
    expect(arrivalOf(seated)).toEqual(idsOf(arriving));
    expect(pairs(boundsOf(seated)).some(([a, b]) => overlaps(grown(a, gap), b))).toBe(false);
  });

  it("is refused once the orbit would spill over the console", () => {
    expect(column({ desk: windowed(full), arriving: panes(8, full) })).toBeUndefined();
    expect(column({ desk: maximised(wide), arriving: panes(2, wide) })).toBeUndefined();
  });

  it("leaves a lone pane with no room beside to the cascade's first slot, the orbit's own", () => {
    for (const area of workAreas) {
      const incoming = { desk: maximised(area), arriving: panes(1, area) };
      expect(column(incoming)).toBeUndefined();
      expect(arranged("column", incoming).seats).toEqual(orbit(incoming.desk, incoming.arriving));
    }
  });
});

describe("the stair", () => {
  it("steps a column sideways, away from the console, a title strip a pane", () => {
    const desk = windowed(wide);
    const seats = boundsOf(laid(stair, { desk, arriving: alike(4) }));
    const corner = { x: desk.console.x + desk.console.width + gap, y: desk.console.y };
    expect(seats).toEqual(
      [0, 1, 2, 3].map((tread) => ({
        x: corner.x + tread * cascadeStep,
        y: corner.y + tread * (size.height + gap),
        ...size,
      })),
    );
  });

  it("steps the other way when the room is on the console's left", () => {
    const console = { x: 2400, y: 300, width: 1200, height: 900 };
    const desk = deskOf(wide, console, false, outOfTheWay(wide));
    const seats = boundsOf(laid(stair, { desk, arriving: alike(3) }));
    expect(seats.map((seat) => seat.x + seat.width)).toEqual(
      [0, 1, 2].map((tread) => console.x - gap - tread * cascadeStep),
    );
    expect(seats.map((seat) => seat.y)).toEqual(
      [0, 1, 2].map((tread) => console.y + tread * (size.height + gap)),
    );
  });

  it("starts a second flight beside the first when the display runs out below", () => {
    const desk = windowed(wide);
    const seats = boundsOf(laid(stair, { desk, arriving: panes(8, wide) }));
    const flightTops = seats.filter((seat) => seat.y === seats[0]?.y);
    expect(flightTops).toHaveLength(2);
    expect(pairs(seats).some(([a, b]) => overlaps(grown(a, gap), b))).toBe(false);
  });
});

describe("the fan", () => {
  const desk = windowed(wide);
  const arrangement = laid(fan, { desk, arriving: alike(5) });
  const seats = boundsOf(arrangement);

  it("lays the panes left to right along an arc, the middle one highest", () => {
    const lefts = seats.map((seat) => seat.x);
    const tops = seats.map((seat) => seat.y);
    expect(lefts).toEqual([...new Set(lefts)].toSorted((a, b) => a - b));
    expect(tops[2]).toBe(desk.console.y);
    expect(tops[1]).toBeGreaterThan(tops[2] as number);
    expect(tops[0]).toBeGreaterThan(tops[1] as number);
    expect(tops[3]).toBeGreaterThan(tops[2] as number);
    expect(tops[4]).toBeGreaterThan(tops[3] as number);
  });

  it("arrives from its middle outward, each pane a title lower than the last", () => {
    expect(arrivalOf(arrangement)).toEqual([2, 3, 1, 4, 0].map((index) => `pane-${index}`));
    const tops = inArrivalOrder(arrangement).map((seat) => seat.bounds.y);
    const drops = tops.slice(1).map((top, index) => top - (tops[index] ?? 0));
    expect(Math.min(...drops)).toBeGreaterThanOrEqual(title.height);
  });

  it("closes up to fit the far side of a maximised console, and is refused when too tight", () => {
    const over = boundsOf(laid(fan, { desk: maximised(full), arriving: alike(8) }));
    const pitches = over.slice(1).map((seat, index) => seat.x - (over[index]?.x ?? 0));
    expect(Math.max(...pitches)).toBeLessThan(size.width * shapeMetrics.fan.loosest);
    expect(Math.min(...pitches)).toBeGreaterThanOrEqual(shapeMetrics.fan.tightest);
    expect(fan({ desk: maximised(full), arriving: alike(12) })).toBeUndefined();
  });
});

describe("the grid", () => {
  const desk = windowed(wide);
  const arrangement = laid(grid, { desk, arriving: panes(8, wide) });
  const seats = boundsOf(arrangement);
  const columns = [...new Set(seats.map((seat) => seat.x))].toSorted((a, b) => a - b);
  const rows = [...new Set(seats.map((seat) => seat.y))].toSorted((a, b) => a - b);

  it("tiles the free area in rows and columns with nothing overlapping", () => {
    expect([columns.length, rows.length]).toEqual([2, 4]);
    expect(pairs(seats).some(([a, b]) => overlaps(grown(a, gap), b))).toBe(false);
    expect(seats.some((seat) => overlaps(grown(seat, gap), desk.console))).toBe(false);
    expect([columns[0], rows[0]]).toEqual([
      desk.console.x + desk.console.width + gap,
      desk.console.y,
    ]);
  });

  it("arrives as a diagonal wave from the console's corner", () => {
    const waves = inArrivalOrder(arrangement).map(
      (seat) => columns.indexOf(seat.bounds.x) + rows.indexOf(seat.bounds.y),
    );
    expect(waves).toEqual([0, 1, 1, 2, 2, 3, 3, 4]);
    expect(arrivalOf(arrangement)[0]).toBe("pane-0");
  });
});

describe("the burst", () => {
  const desk = windowed(wide);
  const arriving = alike(16);
  const arrangement = laid(burst, { desk, arriving });
  const seats = boundsOf(arrangement);
  const edge = desk.console.x + desk.console.width + gap;
  const reaches = [...new Set(seats.map((seat) => seat.x - edge))];
  const wave = (reach: number): ScreenRect[] => seats.filter((seat) => seat.x - edge === reach);

  it("radiates from the console's edge in waves that thin out and stride further", () => {
    const strides = reaches.slice(1).map((reach, index) => reach - (reaches[index] ?? 0));
    expect(reaches[0]).toBe(0);
    expect(reaches.map((reach) => wave(reach).length)).toEqual([8, 4, 2, 1, 1]);
    expect(strides).toEqual([...new Set(strides)].toSorted((a, b) => a - b));
    expect(strides[0]).toBe(title.width);
  });

  it("arrives nearest first", () => {
    const outward = inArrivalOrder(arrangement).map((seat) => seat.bounds.x);
    expect(outward).toEqual(outward.toSorted((a, b) => a - b));
    expect(arrivalOf(arrangement)).toEqual(idsOf(arriving));
  });

  it("is refused where it cannot radiate: over the console, or with neither side free", () => {
    const docked = { x: 0, y: 0, width: wide.width, height: 1200 };
    expect(burst({ desk: maximised(wide), arriving })).toBeUndefined();
    expect(
      burst({ desk: deskOf(wide, docked, false, outOfTheWay(wide)), arriving: alike(5) }),
    ).toBeUndefined();
  });
});

describe("the pile", () => {
  const arriving = panes(8, full);
  const arrangement = laid(pile, { desk: maximised(full), arriving });
  const seats = boundsOf(arrangement);

  it("stacks the panes a few pixels across and one title down from each other", () => {
    const steps = seats
      .slice(1)
      .map((seat, index) => [seat.x - (seats[index]?.x ?? 0), seat.y - (seats[index]?.y ?? 0)]);
    expect(steps).toEqual(Array(7).fill([shapeMetrics.pileDrift, title.height]));
    expect(shapeMetrics.pileDrift).toBeLessThan(8);
  });

  it("starts a second pile a title's width clear of the first when the display runs out", () => {
    const tall = boundsOf(laid(pile, { desk: maximised(small), arriving: alike(16) }));
    const [first, eighth, ninth] = [tall[0], tall[7], tall[8]] as ScreenRect[];
    expect(ninth?.y).toBe(first?.y);
    expect((ninth?.x ?? 0) - (eighth?.x ?? 0)).toBe(title.width);
  });
});

describe("the cascade in time", () => {
  it("steps slightly, and closes the steps up as the burst grows", () => {
    expect([2, 5, 8, 12, 16].map(stepMs)).toEqual([60, 60, 60, 45, 34]);
    expect(stepMs(40)).toBe(arrivalPace.quickestStepMs);
  });

  it("recalls in reverse: the last to arrive leaves first, on the same beat", () => {
    const arrangement = laid(fan, { desk: windowed(wide), arriving: alike(5) });
    const leaving = recalled(arrangement.arrives);
    expect(leaving.map((start) => start.id)).toEqual(arrivalOf(arrangement).toReversed());
    expect(leaving.map((start) => start.atMs)).toEqual([0, 60, 120, 180, 240]);
    expect(recalled([])).toEqual([]);
  });
});
