import { mulberry32, overlaps } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import { deskOf, outOfTheWay, pairs } from "../feel/pattern-testing.ts";
import type { Desk, ScreenRect } from "../port.ts";
import { drillSeats } from "./drill-seats.ts";
import { hubMetrics, hubOutline, standsAsTheHub } from "./hub.ts";
import { type Seeking, type Taste, troupePlaces } from "./resting.ts";
import { roomsToDealOn, stageBeside } from "./stage.ts";

const display: ScreenRect = { x: 0, y: 0, width: 1920, height: 1080 };
const small: ScreenRect = { x: 0, y: 0, width: 1366, height: 768 };

function windowedAt(x: number, width = 761, area = display): Desk {
  return deskOf(area, { x, y: 140, width, height: 800 }, false, outOfTheWay(area));
}

function asTheHub(desk: Desk): Desk {
  return { ...desk, console: hubOutline(desk), consoleMaximized: false };
}

function notes(count: number, weights: readonly number[] = []): Seeking[] {
  return Array.from({ length: count }, (_, at) => ({
    id: `note-${at}`,
    kind: "note",
    measured: undefined,
    last: undefined,
    weight: weights[at],
  }));
}

const byACreature: Taste = { asker: "creature", random: mulberry32(7) };

describe("the hub the console becomes", () => {
  it("stands one gap in from the nearer side edge and from top and bottom, a readable column wide", () => {
    expect(hubOutline(windowedAt(300))).toEqual({ x: 12, y: 12, width: 504, height: 1056 });
    expect(hubOutline(windowedAt(900))).toEqual({ x: 1404, y: 12, width: 504, height: 1056 });
    expect(hubMetrics.width).toBeGreaterThanOrEqual(480);
    expect(hubMetrics.width).toBeLessThanOrEqual(520);
  });

  it("keeps a console already narrower than a hub as wide as it is, and takes a maximised one to the left", () => {
    expect(hubOutline(windowedAt(1200, 420)).width).toBe(420);
    const filling = { x: -8, y: -8, width: 1936, height: 1096 };
    const maximised = deskOf(display, filling, true, outOfTheWay(display));
    expect(hubOutline(maximised)).toEqual({ x: 12, y: 12, width: 504, height: 1056 });
    expect(standsAsTheHub(asTheHub(maximised))).toBe(true);
    expect(standsAsTheHub(windowedAt(300))).toBe(false);
  });
});

describe("the stage beside the hub", () => {
  it("is everything else on the display, one gap from the console and the edges, level with the hub", () => {
    const hub = asTheHub(windowedAt(300));
    const stage = stageBeside(hub);
    expect(stage?.room).toEqual({ x: 528, y: 12, width: 1380, height: 1056 });
    expect([stage?.room.y, stage?.room.height]).toEqual([hub.console.y, hub.console.height]);
    expect(stageBeside(deskOf(display, display, true, outOfTheWay(display)))).toBeUndefined();
  });

  it("gives the room left clear of a pane that keeps its seat, the largest piece first", () => {
    const hub = asTheHub(windowedAt(300));
    const leftHalf: ScreenRect = { x: 528, y: 12, width: 684, height: 1056 };
    const [first] = roomsToDealOn(hub, [leftHalf]);
    expect(first?.room).toEqual({ x: 1224, y: 12, width: 684, height: 1056 });
    expect(roomsToDealOn(hub)).toHaveLength(1);
  });
});

describe("a creature's panes arranged as one", () => {
  it("do not stand nine together beside a console in the middle, and do once it is the hub", () => {
    const middle = windowedAt(560);
    const nine = { arriving: notes(9), standing: [] };
    expect(
      troupePlaces({ desk: middle, ...nine, atTheSizeWanted: true }, byACreature),
    ).toBeUndefined();
    const hub = asTheHub(middle);
    const landing = troupePlaces({ desk: hub, ...nine }, byACreature);
    expect(landing?.places).toHaveLength(9);
    const places = landing?.places ?? [];
    expect(pairs(places).filter(([one, other]) => overlaps(one, other))).toEqual([]);
    expect(places.filter((place) => overlaps(place, hub.console))).toEqual([]);
  });

  it("give the largest seat to the pane that leads, from two panes up", () => {
    const hub = asTheHub(windowedAt(560));
    const room = (rect: ScreenRect | undefined): number => (rect?.width ?? 0) * (rect?.height ?? 0);
    for (const count of [2, 4, 9]) {
      const landing = troupePlaces(
        { desk: hub, arriving: notes(count, [0, 4]), standing: [] },
        byACreature,
      );
      const rooms = (landing?.places ?? []).map(room);
      expect(Math.max(...rooms), `${count} panes`).toBe(rooms[1]);
      expect(
        rooms.filter((size) => size === rooms[1]),
        `${count} panes`,
      ).toHaveLength(1);
    }
  });

  it("keep a few at their own size beside a console with room at its side, with no need of the hub", () => {
    const toTheLeft = windowedAt(300);
    const few = { desk: toTheLeft, arriving: notes(3), standing: [], atTheSizeWanted: true };
    const places = troupePlaces(few, byACreature)?.places ?? [];
    expect(places.map((place) => [place.width, place.height])).toEqual(Array(3).fill([624, 320]));
    expect(places.filter((place) => overlaps(place, toTheLeft.console))).toEqual([]);
    const middle = { ...few, desk: windowedAt(560) };
    expect(troupePlaces(middle, byACreature)).toBeUndefined();
  });

  it("hold fewer than were sent on a display too small for them all at card size", () => {
    const hub = asTheHub(windowedAt(300, 761, small));
    expect(
      troupePlaces({ desk: hub, arriving: notes(12), standing: [] }, byACreature),
    ).toBeUndefined();
    expect(
      troupePlaces({ desk: hub, arriving: notes(6), standing: [] }, byACreature),
    ).toBeDefined();
  });
});

describe("a lead among a creature's panes", () => {
  const room = (rect: ScreenRect | undefined): number => (rect?.width ?? 0) * (rect?.height ?? 0);

  it("takes the seat nearest the console, on whichever side the console stands", () => {
    for (const x of [300, 900]) {
      const hub = asTheHub(windowedAt(x));
      for (const seed of [1, 2, 3, 4, 5]) {
        const taste: Taste = { asker: "creature", random: mulberry32(seed) };
        const places =
          troupePlaces({ desk: hub, arriving: notes(9, [0, 0, 4]), standing: [] }, taste)?.places ??
          [];
        const lead = places[2] as ScreenRect;
        const nearEdge = (place: ScreenRect): number =>
          x === 300 ? place.x : -(place.x + place.width);
        expect(room(lead), `console at ${x}`).toBe(Math.max(...places.map(room)));
        expect(nearEdge(lead), `console at ${x}`).toBe(Math.min(...places.map(nearEdge)));
      }
    }
  });
});

describe("the picture of a drill", () => {
  const cardAtLeast = (place: ScreenRect): boolean => place.width >= 320 && place.height >= 160;

  it("gives the lead the hub's half of the stage over a trail, and cards the other half", () => {
    const hub = asTheHub(windowedAt(300));
    const picture = drillSeats(hub, [], 1, 6);
    expect(picture?.lead).toEqual({ x: 528, y: 12, width: 684, height: 789 });
    expect(picture?.trail).toEqual([{ x: 528, y: 813, width: 684, height: 255 }]);
    expect(picture?.cards).toHaveLength(6);
    expect(picture?.cards.every((card) => card.x >= 1224 && cardAtLeast(card))).toBe(true);
    const all = [picture?.lead, ...(picture?.trail ?? []), ...(picture?.cards ?? [])].flatMap(
      (place) => place ?? [],
    );
    expect(pairs(all).filter(([one, other]) => overlaps(one, other))).toEqual([]);
  });

  it("keeps the lead and the cards where they are as the trail grows, older ancestors than fit joining the cards", () => {
    const hub = asTheHub(windowedAt(300));
    const one = drillSeats(hub, [], 1, 4);
    const three = drillSeats(hub, [], 3, 4);
    expect(three?.lead).toEqual(one?.lead);
    expect(three?.trail).toEqual([
      { x: 528, y: 813, width: 336, height: 255 },
      { x: 876, y: 813, width: 336, height: 255 },
    ]);
    expect(one?.cards).toHaveLength(4);
    expect(three?.cards).toHaveLength(5);
  });

  it("turns to face a console on the right, the parent still nearest it", () => {
    const hub = asTheHub(windowedAt(900));
    const picture = drillSeats(hub, [], 2, 3);
    expect(picture?.lead).toEqual({ x: 708, y: 12, width: 684, height: 789 });
    expect(picture?.trail.map((seat) => seat.x)).toEqual([1056, 708]);
    expect(picture?.cards.every((card) => card.x + card.width <= 696)).toBe(true);
  });

  it("holds as many cards as stand at card size and no more, and is not drawn on a stage too small for it", () => {
    const hub = asTheHub(windowedAt(300));
    expect(drillSeats(hub, [], 1, 40)?.cards).toHaveLength(12);
    expect(drillSeats(asTheHub(windowedAt(100, 761, small)), [], 1, 2)).toBeUndefined();
  });
});
