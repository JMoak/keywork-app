import { mulberry32 } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import { outsideMetrics } from "../feel/arrange.ts";
import type { Desk, ScreenRect } from "../port.ts";
import { presetSize } from "./grid.ts";
import {
  arisenBeside,
  arrivalSizes,
  drilledInto,
  fillsADisplay,
  paneWeights,
  restingPlaces,
  type Seeking,
  sizeFor,
  sizeWanted,
  standsOnADisplay,
  weightOf,
} from "./resting.ts";

const laptop: ScreenRect = { x: 0, y: 0, width: 1920, height: 1040 };
const sideMonitor: ScreenRect = { x: 1920, y: 0, width: 2560, height: 1400 };

const desk: Desk = {
  console: { x: 200, y: 100, width: 900, height: 700 },
  consoleMaximized: false,
  workArea: laptop,
  displays: [
    { bounds: { ...laptop, height: 1080 }, workArea: laptop, scaleFactor: 1 },
    { bounds: { ...sideMonitor, height: 1440 }, workArea: sideMonitor, scaleFactor: 1.5 },
  ],
  cursor: { x: 640, y: 480 },
};

const stored: ScreenRect = { x: 2200, y: 300, width: 520, height: 400 };

function overlaps(one: ScreenRect, other: ScreenRect): boolean {
  return (
    one.x < other.x + other.width &&
    other.x < one.x + one.width &&
    one.y < other.y + other.height &&
    other.y < one.y + one.height
  );
}

describe("where a pane rests outside the window", () => {
  it("returns to the rectangle it stood in while a display still shows its title strip", () => {
    const { places } = restingPlaces(
      desk,
      [{ id: "a", kind: "file", measured: undefined, last: stored }],
      [],
    );
    expect(places).toEqual([stored]);
  });

  it("finds a new place beside the console when its display is gone", () => {
    const oneDisplay: Desk = { ...desk, displays: desk.displays.slice(0, 1) };
    const [place] = restingPlaces(
      oneDisplay,
      [{ id: "a", kind: "note", measured: undefined, last: stored }],
      [],
    ).places;
    expect(place).not.toEqual(stored);
    expect(standsOnADisplay(oneDisplay, place as ScreenRect)).toBe(true);
    expect(overlaps(place as ScreenRect, desk.console)).toBe(false);
  });

  it("counts a pane as on a display only while enough of its strip can be grabbed", () => {
    const { strip } = outsideMetrics;
    expect(standsOnADisplay(desk, stored)).toBe(true);
    expect(standsOnADisplay(desk, { ...stored, x: -stored.width + strip })).toBe(true);
    expect(standsOnADisplay(desk, { ...stored, x: -stored.width + strip - 1 })).toBe(false);
    expect(standsOnADisplay(desk, { ...stored, y: -strip })).toBe(false);
    expect(standsOnADisplay(desk, { ...stored, x: 9000 })).toBe(false);
  });

  it("knows a pane that fills a display, as a maximised window does with its unseen border", () => {
    expect(fillsADisplay(desk, { x: -7, y: -7, width: 1934, height: 1054 })).toBe(true);
    expect(fillsADisplay(desk, laptop)).toBe(true);
    expect(fillsADisplay(desk, { ...laptop, width: 960 })).toBe(false);
    expect(fillsADisplay(desk, stored)).toBe(false);
  });
});

function seeking(count: number, over: Partial<Seeking> = {}, called = "pane"): Seeking[] {
  return Array.from({ length: count }, (_, at) => ({
    id: `${called}-${at}`,
    kind: "conversation",
    measured: undefined,
    last: undefined,
    ...over,
  }));
}

function roomOf(rect: ScreenRect): number {
  return rect.width * rect.height;
}

describe("the size a pane arrives at", () => {
  it("is one of the named sizes the keeper's keys step through, never the largest two", () => {
    expect(arrivalSizes).toEqual(["card", "reading", "working"]);
    for (const kind of ["conversation", "file", "diff", "stead", "note"] as const) {
      for (const measured of [undefined, { width: 300, height: 90 }, { width: 900, height: 900 }]) {
        const named = arrivalSizes.map((name) => presetSize(name, laptop, kind));
        expect(named).toContainEqual(sizeFor(kind, measured, laptop));
      }
    }
  });

  it("is the smallest that holds a measured pane as it stood inside, title row and all", () => {
    const tall = (height: number) => sizeWanted("note", { width: 480, height }, laptop);
    expect([1, 160].map(tall)).toEqual(["card", "card"]);
    expect([161, 320].map(tall)).toEqual(["reading", "reading"]);
    expect([321, 624, 4000].map(tall)).toEqual(["working", "working", "working"]);
    expect(sizeFor("note", { width: 480, height: 300 }, laptop)).toEqual({
      width: 624,
      height: 320,
    });
  });
});

describe("a burst seeking places", () => {
  it("steps a column down the named sizes until it stands beside the console", () => {
    const sizesFor = (count: number): string[] => [
      ...new Set(
        restingPlaces(desk, seeking(count), []).places.map(
          (place) => `${place.width}x${place.height}`,
        ),
      ),
    ];
    expect(sizesFor(1)).toEqual(["624x624"]);
    expect(sizesFor(2)).toEqual(["624x320"]);
    expect(sizesFor(4)).toEqual(["624x160"]);
    expect(sizesFor(5)).toEqual(["624x160"]);
  });

  it("lets each pane step down only as far as the burst must, never up", () => {
    const mixed: Seeking[] = [
      { id: "worked", kind: "conversation", measured: undefined, last: undefined },
      { id: "read", kind: "note", measured: undefined, last: undefined },
      { id: "glanced", kind: "note", measured: { width: 400, height: 120 }, last: undefined },
    ];
    const roomy: Desk = { ...desk, workArea: sideMonitor, console: { ...desk.console, x: 2100 } };
    const tall = restingPlaces(roomy, mixed, []).places.map((place) => place.height);
    expect(tall).toEqual([840, 320, 160]);
    const tight = restingPlaces(desk, mixed, []).places.map((place) => place.height);
    expect(tight).toEqual([320, 320, 160]);
  });

  it("says when each pane starts: those returning first, then the newcomers in their order", () => {
    const { arrives, places } = restingPlaces(
      desk,
      [
        ...seeking(2, {}, "new"),
        { id: "kept", kind: "note", measured: undefined, last: stored },
        ...seeking(1, {}, "newer"),
      ],
      [],
    );
    expect(arrives).toEqual([
      { id: "kept", atMs: 0 },
      { id: "new-0", atMs: 60 },
      { id: "new-1", atMs: 120 },
      { id: "newer-0", atMs: 180 },
    ]);
    expect(places[2]).toEqual(stored);
    const seated = [places[0], places[1], places[3]] as ScreenRect[];
    expect(seated.map((place) => place.y)).toEqual(
      seated.map((place) => place.y).toSorted((a, b) => a - b),
    );
  });

  it("starts sixteen returning panes within about half a second, in the order asked", () => {
    const returning = seeking(16).map((pane, at) => ({
      ...pane,
      last: { x: 1200 + at * 8, y: 100 + at * 8, width: 400, height: 300 },
    }));
    const { arrives, look } = restingPlaces(desk, returning, []);
    expect(arrives.map((start) => start.id)).toEqual(returning.map((pane) => pane.id));
    expect(arrives.at(-1)?.atMs).toBe(510);
    expect(look).toBeUndefined();
  });

  it("names the look it chose, a deal for eight to twelve and cards for fewer", () => {
    expect(restingPlaces(desk, seeking(3), []).look).toBe("column right");
    expect(restingPlaces(desk, seeking(5), []).look).toBe("grid right, rows first, outward");
    expect(restingPlaces(desk, seeking(8), []).look).toBe("tower");
    expect(restingPlaces(desk, seeking(12), []).look).toBe("marquee");
    expect(restingPlaces(desk, seeking(16), []).look).toBe("rows");
  });

  it("keeps clear of the panes already standing and of those that return", () => {
    const standing = [{ x: 1112, y: 100, width: 624, height: 624 }];
    const { places } = restingPlaces(
      desk,
      [{ id: "kept", kind: "note", measured: undefined, last: stored }, ...seeking(1)],
      standing,
    );
    expect(places.some((place) => overlaps(place, standing[0] as ScreenRect))).toBe(false);
    expect(overlaps(places[0] as ScreenRect, places[1] as ScreenRect)).toBe(false);
  });
});

describe("who gets the largest seat", () => {
  const largestOf = (places: readonly ScreenRect[]): number => {
    const rooms = places.map(roomOf);
    return rooms.indexOf(Math.max(...rooms));
  };

  it("weighs what waits on the keeper over what is to read, and that over what can wait", () => {
    const waiting = weightOf("needs-you", false);
    expect(waiting).toBeGreaterThan(weightOf("finished-unseen", false));
    expect(weightOf("failed", false)).toBe(waiting);
    expect(weightOf("finished-unseen", false)).toBeGreaterThan(weightOf("working", false));
    expect(weightOf("working", false)).toBeGreaterThan(weightOf("idle", false));
    expect(weightOf("idle", true)).toBeGreaterThan(waiting);
    expect(weightOf("idle", true) - weightOf("idle", false)).toBe(paneWeights.leads);
  });

  it("seats the heaviest pane in it, wherever it comes in the burst", () => {
    for (const heaviest of [0, 4, 8]) {
      const burst = seeking(9).map((pane, at) => ({ ...pane, weight: at === heaviest ? 3 : 0 }));
      for (const asker of ["keeper", "creature"] as const) {
        const { places } = restingPlaces(desk, burst, [], { asker, random: mulberry32(5) });
        expect(largestOf(places), `${asker} ${heaviest}`).toBe(heaviest);
      }
    }
  });

  it("gives it to the first asked when the keeper deals panes of equal weight", () => {
    expect(largestOf(restingPlaces(desk, seeking(9), []).places)).toBe(0);
  });
});

describe("the seat of a pane that arises from another", () => {
  const parent: ScreenRect = { x: 1112, y: 100, width: 624, height: 320 };

  it("is its named size one gap beside its parent, clear of the console and the panes that stand", () => {
    expect(arisenBeside(desk, parent, "note", [])).toEqual({
      x: 1112,
      y: 432,
      width: 624,
      height: 320,
    });
    const taken = [{ x: 1112, y: 432, width: 624, height: 320 }];
    const overTheConsole = arisenBeside(desk, parent, "note", taken) as ScreenRect;
    expect(overTheConsole).toEqual({ x: 476, y: 100, width: 624, height: 320 });
    expect(overlaps(overTheConsole, desk.console)).toBe(true);
  });

  it("steps down the named sizes until one fits beside its parent, the largest that does", () => {
    const low: ScreenRect = { ...parent, y: 400 };
    expect(arisenBeside(desk, low, "conversation", [])).toEqual({
      x: 1112,
      y: 68,
      width: 624,
      height: 320,
    });
    const hemmedIn = [{ x: 1112, y: 12, width: 624, height: 200 }];
    expect(arisenBeside(desk, low, "conversation", hemmedIn)).toEqual({
      x: 1112,
      y: 732,
      width: 624,
      height: 160,
    });
  });

  it("stands over the console beside its parent when nowhere else is free", () => {
    const filling: ScreenRect = { x: 1112, y: 12, width: 796, height: 1016 };
    const seat = arisenBeside(desk, filling, "note", []);
    expect(seat).toEqual({ x: 476, y: 12, width: 624, height: 320 });
    expect(overlaps(seat as ScreenRect, desk.console)).toBe(true);
    expect(overlaps(seat as ScreenRect, filling)).toBe(false);
  });
});

describe("the seats of a pane drilled into", () => {
  it("gives the new pane the seat its parent stood in, and steps the parent down beside it", () => {
    const parent: ScreenRect = { x: 1112, y: 100, width: 624, height: 624 };
    expect(drilledInto(desk, parent, "conversation", [])).toEqual({
      lead: parent,
      aside: { x: 1112, y: 736, width: 624, height: 160 },
    });
  });

  it("steps the parent down one named size where that fits, a card where it does not", () => {
    const roomy: Desk = { ...desk, workArea: sideMonitor, console: { ...desk.console, x: 2100 } };
    const parent: ScreenRect = { x: 3100, y: 100, width: 640, height: 840 };
    expect(drilledInto(roomy, parent, "conversation", [])?.aside).toEqual({
      x: 3752,
      y: 100,
      width: 625,
      height: 320,
    });
    const atTheRight = [{ x: 3752, y: 100, width: 625, height: 320 }];
    expect(drilledInto(roomy, parent, "conversation", atTheRight)?.aside).toEqual({
      x: 3100,
      y: 952,
      width: 625,
      height: 320,
    });
    const reading: ScreenRect = { x: 3100, y: 100, width: 625, height: 320 };
    expect(drilledInto(roomy, reading, "conversation", [])?.aside).toMatchObject({ height: 160 });
  });

  it("has no seats where the parent can stand nowhere beside the lead", () => {
    const filling: ScreenRect = { x: 12, y: 12, width: 1896, height: 1016 };
    expect(drilledInto(desk, filling, "conversation", [])).toBeUndefined();
  });
});
