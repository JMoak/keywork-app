import { type Extent, overlaps } from "@keywork-app/habitat";
import type { Desk, ScreenPoint, ScreenRect } from "../port.ts";
import { outsideMetrics, type Standing, type Wanted } from "./arrange.ts";
import {
  bottomOf,
  fitsIn,
  grownBy,
  keptWithin,
  largestOf,
  liesWithin,
  movedBy,
  reachOf,
  rightOf,
  sharedBy,
  spanning,
} from "./pattern-rects.ts";
import { cascadeDecks, cascadeSlots, type Shape, shapeMetrics } from "./pattern-shapes.ts";

export type Side = "right" | "left" | "below" | "above" | "over";

export interface Ground {
  readonly side: Side;
  readonly room: ScreenRect;
}

export interface Manner {
  readonly from: "corner" | "middle";
  readonly apart: boolean;
}

export const groundMetrics = { farShare: 2 / 3 } as const;

export function groundsBeside(desk: Desk): readonly Ground[] {
  if (desk.consoleMaximized) return [];
  const { gap } = outsideMetrics;
  const { workArea: area } = desk;
  const home = consoleOn(desk);
  const beside = (side: Side, room: ScreenRect): Ground => ({ side, room });
  const right = beside(
    "right",
    spanning(rightOf(home) + gap, area.y, rightOf(area), bottomOf(area)),
  );
  const left = beside("left", spanning(area.x, area.y, home.x - gap, bottomOf(area)));
  const below = beside(
    "below",
    spanning(area.x, bottomOf(home) + gap, rightOf(area), bottomOf(area)),
  );
  const above = beside("above", spanning(area.x, area.y, rightOf(area), home.y - gap));
  const roomierSideFirst = left.room.width > right.room.width ? [left, right] : [right, left];
  return [...roomierSideFirst, below, above].filter(hasRoom);
}

export function roomsBeside(desk: Desk): readonly Ground[] {
  const insideTheMargin = grownBy(desk.workArea, -outsideMetrics.gap);
  return groundsBeside(desk)
    .map(({ side, room }): Ground => ({ side, room: sharedBy(room, insideTheMargin) }))
    .filter(hasRoom);
}

export function canvases(desk: Desk): readonly Ground[] {
  return [...roomsBeside(desk), ...allButTheNearEdge(desk).slice(-1), wholeDisplay(desk)];
}

export function farSide(desk: Desk): readonly Ground[] {
  const home = consoleOn(desk);
  return overTheConsole(desk, rightOf(home) - Math.round(home.width * groundMetrics.farShare));
}

export function allButTheNearEdge(desk: Desk): readonly Ground[] {
  return overTheConsole(desk, consoleOn(desk).x + shapeMetrics.titleInSight);
}

export function wholeDisplay(desk: Desk): Ground {
  return { side: "over", room: grownBy(desk.workArea, -outsideMetrics.gap) };
}

export function stoodOn(
  ground: Ground,
  desk: Desk,
  shape: Shape,
  standing: readonly ScreenRect[],
  manner: Manner,
): readonly Standing[] | undefined {
  const reach = reachOf(shape.places.map((place) => place.bounds));
  if (!fitsIn(ground.room, reach) || !keepsItsOwnTitles(shape)) return undefined;
  const seatsAt = (corner: ScreenPoint): Standing[] =>
    shape.places.map(({ id, bounds }) => ({ id, bounds: movedBy(bounds, corner) }));
  const wished = cornerKept(ground, desk, reach, manner);
  const snug = manner.apart ? seatsAgainst(standing, wished, ground.room, reach) : [];
  const corner = firstFound(clearThenClose(ground, manner), (apart) => {
    const holds = (at: ScreenPoint): boolean => keepsFaith(desk, seatsAt(at), standing, apart);
    const slides = [...snug, ...slidesFrom(wished, ground.room, reach)];
    return holds(wished) ? wished : slides.find(holds);
  });
  return corner === undefined ? undefined : seatsAt(corner);
}

export function dealtOn(
  ground: Ground,
  desk: Desk,
  panes: readonly Wanted[],
  standing: readonly ScreenRect[],
): readonly Standing[] | undefined {
  const { room } = ground;
  const largest = largestOf(panes.map((pane) => pane.size));
  const takes = (seat: ScreenRect, dealt: readonly ScreenRect[]): boolean =>
    liesWithin(room, seat) &&
    isClearOfTheCursor(desk, seat) &&
    standing.every((pane) => titleStaysInSight(pane, [...dealt, seat]));
  return firstFound(dealingTops(ground, desk), (top) => {
    const below = { width: room.width, height: bottomOf(room) - top };
    return firstFound(cascadeDecks(panes.length, largest, below), (deck) => {
      const slots = cascadeSlots(deck);
      const reach = reachOf(slots.map((slot) => ({ ...slot, ...largest })));
      const corner = { x: rightOf(room) - reach.width, y: top };
      return dealtInto(
        slots.map((slot) => ({ x: corner.x + slot.x, y: corner.y + slot.y })),
        panes,
        takes,
      );
    });
  });
}

export function consoleOn(desk: Desk): ScreenRect {
  const { console: home, workArea: area } = desk;
  const x = Math.max(area.x, home.x);
  const y = Math.max(area.y, home.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(rightOf(area), rightOf(home)) - x),
    height: Math.max(0, Math.min(bottomOf(area), bottomOf(home)) - y),
  };
}

export function firstFound<Item, Found>(
  items: readonly Item[],
  find: (item: Item) => Found | undefined,
): Found | undefined {
  for (const item of items) {
    const found = find(item);
    if (found !== undefined) return found;
  }
  return undefined;
}

function overTheConsole(desk: Desk, from: number): readonly Ground[] {
  const { gap } = outsideMetrics;
  const insideTheConsole = grownBy(consoleOn(desk), -gap);
  const onTheDisplay = grownBy(desk.workArea, -gap);
  const consoleFillsTheDisplay = liesWithin(insideTheConsole, onTheDisplay);
  const limits = consoleFillsTheDisplay ? [insideTheConsole] : [insideTheConsole, onTheDisplay];
  return limits
    .map((limit) => spanning(from, limit.y, rightOf(limit), bottomOf(limit)))
    .map((room): Ground => ({ side: "over", room }))
    .filter(hasRoom);
}

function dealingTops(ground: Ground, desk: Desk): number[] {
  const { gap } = outsideMetrics;
  const { room } = ground;
  const levelWithTheConsole = Math.max(room.y, consoleOn(desk).y + gap);
  const belowTheCursor = Math.max(room.y, desk.cursor.y + gap);
  return [...new Set([levelWithTheConsole, belowTheCursor, room.y])];
}

function clearThenClose(ground: Ground, manner: Manner): readonly boolean[] {
  return manner.apart || ground.side === "over" ? [manner.apart] : [true, false];
}

function hasRoom(ground: Ground): boolean {
  return ground.room.width > 0 && ground.room.height > 0;
}

function cornerWished(
  ground: Ground,
  desk: Desk,
  reach: Extent,
  manner: Pick<Manner, "from">,
): ScreenPoint {
  const { room } = ground;
  const home = consoleOn(desk);
  const slack = manner.from === "middle" ? 0.5 : 0;
  const down = Math.round(home.y + (home.height - reach.height) * slack);
  const across = Math.round(home.x + (home.width - reach.width) * slack);
  switch (ground.side) {
    case "right":
      return { x: room.x, y: down };
    case "left":
      return { x: rightOf(room) - reach.width, y: down };
    case "below":
      return { x: across, y: room.y };
    case "above":
      return { x: across, y: bottomOf(room) - reach.height };
    case "over":
      return { x: rightOf(room) - reach.width, y: home.y + outsideMetrics.gap };
  }
}

function cornerKept(
  ground: Ground,
  desk: Desk,
  reach: Extent,
  manner: Pick<Manner, "from">,
): ScreenPoint {
  return keptWithin(ground.room, { ...cornerWished(ground, desk, reach, manner), ...reach });
}

function titleStaysInSight(pane: ScreenRect, above: readonly ScreenRect[]): boolean {
  const { titleStep, titleInSight } = shapeMetrics;
  const strip: ScreenRect = { ...pane, height: titleStep };
  const glimpse = (from: number): ScreenRect => ({
    ...strip,
    x: from,
    width: Math.min(titleInSight, pane.width),
  });
  const covers = above.filter((other) => overlaps(strip, other));
  const uncovered = (window: ScreenRect): boolean =>
    liesWithin(strip, window) && !covers.some((cover) => overlaps(window, cover));
  return [strip.x, ...covers.map(rightOf)].some((from) => uncovered(glimpse(from)));
}

function keepsItsOwnTitles(shape: Shape): boolean {
  const inArrival = shape.arrival.flatMap(
    (id) => shape.places.find((place) => place.id === id)?.bounds ?? [],
  );
  return inArrival.every((pane, turn) => titleStaysInSight(pane, inArrival.slice(turn + 1)));
}

function keepsFaith(
  desk: Desk,
  seats: readonly Standing[],
  standing: readonly ScreenRect[],
  apart: boolean,
): boolean {
  const bounds = seats.map((seat) => seat.bounds);
  const crowds = (pane: ScreenRect): boolean =>
    bounds.some((seat) => overlaps(grownBy(seat, outsideMetrics.gap), pane));
  if (!bounds.every((seat) => isClearOfTheCursor(desk, seat))) return false;
  return apart ? !standing.some(crowds) : standing.every((pane) => titleStaysInSight(pane, bounds));
}

function isClearOfTheCursor(desk: Desk, seat: ScreenRect): boolean {
  const underCursor: ScreenRect = { ...desk.cursor, width: 0, height: 0 };
  return !overlaps(grownBy(seat, outsideMetrics.gap), underCursor);
}

function dealtInto(
  slots: readonly ScreenPoint[],
  panes: readonly Wanted[],
  takes: (seat: ScreenRect, dealt: readonly ScreenRect[]) => boolean,
  dealt: readonly Standing[] = [],
): readonly Standing[] | undefined {
  const [pane, ...rest] = panes;
  if (pane === undefined) return dealt;
  const taken = dealt.map((seat) => seat.bounds);
  const slot = slots.find((free) => takes({ ...free, ...pane.size }, taken));
  if (slot === undefined) return undefined;
  const seat = { id: pane.id, bounds: { ...slot, ...pane.size } };
  return dealtInto(slots.slice(slots.indexOf(slot) + 1), rest, takes, [...dealt, seat]);
}

function seatsAgainst(
  standing: readonly ScreenRect[],
  wished: ScreenPoint,
  room: ScreenRect,
  reach: Extent,
): ScreenPoint[] {
  const { gap } = outsideMetrics;
  const xs = standing.flatMap((pane) => [rightOf(pane) + gap, pane.x - gap - reach.width]);
  const ys = standing.flatMap((pane) => [bottomOf(pane) + gap, pane.y - gap - reach.height]);
  return nearestFirst(wished, [wished.x, ...xs], [wished.y, ...ys]).filter((corner) =>
    liesWithin(room, { ...corner, ...reach }),
  );
}

function slidesFrom(wished: ScreenPoint, room: ScreenRect, reach: Extent): ScreenPoint[] {
  const xs = stepsThrough(wished.x, room.x, rightOf(room) - reach.width);
  const ys = stepsThrough(wished.y, room.y, bottomOf(room) - reach.height);
  return nearestFirst(wished, xs, ys);
}

function nearestFirst(
  wished: ScreenPoint,
  xs: readonly number[],
  ys: readonly number[],
): ScreenPoint[] {
  const slid = (corner: ScreenPoint): number =>
    Math.hypot(corner.x - wished.x, corner.y - wished.y);
  return xs.flatMap((x) => ys.map((y) => ({ x, y }))).toSorted((a, b) => slid(a) - slid(b));
}

function stepsThrough(from: number, low: number, high: number): number[] {
  const { titleStep } = shapeMetrics;
  const first = from - Math.floor((from - low) / titleStep) * titleStep;
  return Array.from(
    { length: Math.floor((high - first) / titleStep) + 1 },
    (_, step) => first + step * titleStep,
  );
}
