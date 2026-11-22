import { codeWidth, type Extent, overlaps } from "@keywork-app/habitat";
import type { Desk, ScreenPoint, ScreenRect } from "../port.ts";
import { type OutsideKind, outsideMetrics, type Standing, type Wanted } from "./arrange.ts";
import { arrivalTiming, glideTiming } from "./choreography.ts";
import { groundMetrics } from "./pattern-ground.ts";
import { shapeMetrics } from "./pattern-shapes.ts";
import {
  type Arrangement,
  arrivalPace,
  type Incoming,
  type Pattern,
  patternsStandingApart,
  stepMs,
} from "./patterns.ts";

export const workAreas: readonly ScreenRect[] = [
  { x: 0, y: 0, width: 1366, height: 768 },
  { x: 0, y: 0, width: 1920, height: 1080 },
  { x: 0, y: 0, width: 3840, height: 2160 },
];

export const counts = [1, 2, 5, 8, 16] as const;

export const seeds = [1, 7, 42, 2026, 90210] as const;

export const mixedKinds: readonly OutsideKind[] = ["note", "file"];

export const noteKinds: readonly OutsideKind[] = ["note"];

export const title = { width: shapeMetrics.titleInSight, height: shapeMetrics.titleStep } as const;

export const settings = [
  ["windowed", windowed],
  ["maximised", maximised],
] as const;

export function windowed(area: ScreenRect, cursor: ScreenPoint = outOfTheWay(area)): Desk {
  const console = {
    x: area.x + Math.round(area.width * 0.06),
    y: area.y + Math.round(area.height * 0.08),
    width: Math.round(area.width * 0.5),
    height: Math.round(area.height * 0.7),
  };
  return deskOf(area, console, false, cursor);
}

export function maximised(area: ScreenRect, cursor: ScreenPoint = outOfTheWay(area)): Desk {
  const console = {
    x: area.x - 8,
    y: area.y - 8,
    width: area.width + 16,
    height: area.height + 16,
  };
  return deskOf(area, console, true, cursor);
}

export function deskOf(
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

export function outOfTheWay(area: ScreenRect): ScreenPoint {
  return { x: area.x + 1, y: area.y + area.height - 1 };
}

export const noteSize: Extent = { width: 480, height: 308 };

export const fileSize: Extent = { width: codeWidth, height: 308 };

export function panes(
  count: number,
  _area: ScreenRect,
  kinds: readonly OutsideKind[] = mixedKinds,
  called = "pane",
): Wanted[] {
  return Array.from({ length: count }, (_, index) => {
    const kind = kinds[index % kinds.length] ?? "note";
    return { id: `${called}-${index}`, size: kind === "file" ? fileSize : noteSize };
  });
}

export function named(area: ScreenRect, how: string, count: number): string {
  return `${count} on ${area.width}x${area.height}, ${how}`;
}

export function boundsOf(arrangement: Arrangement): ScreenRect[] {
  return arrangement.seats.map((seat) => seat.bounds);
}

export function centreOf(rect: ScreenRect): ScreenPoint {
  return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
}

export function grown(rect: ScreenRect, by: number): ScreenRect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  };
}

export function pairs<Item>(items: readonly Item[]): Array<[Item, Item]> {
  return items.flatMap((one, index) =>
    items.slice(index + 1).map((other): [Item, Item] => [one, other]),
  );
}

export function inArrivalOrder(arrangement: Arrangement): Standing[] {
  return arrangement.arrives.flatMap(
    ({ id }) => arrangement.seats.find((seat) => seat.id === id) ?? [],
  );
}

export function hiddenTitles(stacked: readonly Standing[]): string[] {
  const above = (turn: number): ScreenRect[] => stacked.slice(turn + 1).map((pane) => pane.bounds);
  return stacked.filter((pane, turn) => !titleShows(pane.bounds, above(turn))).map(({ id }) => id);
}

export function brokenPlaces(incoming: Incoming, arrangement: Arrangement): string[] {
  const { desk, arriving, standing = [] } = incoming;
  const seats = boundsOf(arrangement);
  const asked = arriving.map(({ id, size }) => [id, size.width, size.height]);
  const given = arrangement.seats.map(({ id, bounds }) => [id, bounds.width, bounds.height]);
  const touchesTheConsole = seats.some((seat) => overlaps(seat, desk.console));
  const crowded = (pane: ScreenRect): boolean =>
    seats.some((seat) => overlaps(grown(seat, outsideMetrics.gap), pane));
  return [
    ...said(JSON.stringify(given) !== JSON.stringify(asked), "changes a pane's size or order"),
    ...said(!seats.every((seat) => onTheDisplay(desk.workArea, seat)), leavesTheDisplay),
    ...hiddenTitles(inArrivalOrder(arrangement)).map((id) => `hides the title of ${id}`),
    ...said(
      seats.some((seat) => covers(seat, desk.cursor)),
      landsUnderTheCursor,
    ),
    ...said(
      standing.some((pane) => !titleShows(pane, seats)),
      "hides the title of a pane already outside",
    ),
    ...said(
      patternsStandingApart.has(arrangement.pattern) && standing.some(crowded),
      "overlaps a pane already outside",
    ),
    ...said(
      (arrangement.stands === "over") !== touchesTheConsole,
      "says the wrong thing about covering the console",
    ),
    ...said(
      touchesTheConsole && seats.some((seat) => seat.x < nearestAllowed(desk, arrangement.pattern)),
      coversTheNearSide,
    ),
  ];
}

export const leavesTheDisplay = "leaves the display";

export const landsUnderTheCursor = "lands under the cursor";

export const coversTheNearSide = "covers the near side of the console";

export function brokenTiming(arrangement: Arrangement): string[] {
  const starts = arrangement.arrives.map((start) => start.atMs);
  const step = stepMs(starts.length);
  const gliding = (at: number): number =>
    starts.filter((start) => start <= at && at < start + glideTiming.longestMs).length;
  const started = arrangement.arrives.map((start) => start.id).toSorted();
  const seated = arrangement.seats.map((seat) => seat.id).toSorted();
  return [
    ...said(started.join() !== seated.join(), "does not start every pane exactly once"),
    ...said(
      starts.some((start, turn) => start !== turn * step),
      "does not start the panes one even step apart, from nought",
    ),
    ...said(
      step < arrivalPace.quickestStepMs || step > arrivalPace.slowestStepMs,
      "steps out of pace",
    ),
    ...said(
      starts.some((start) => gliding(start) > arrivalTiming.maxGliding),
      "glides more panes at once than the choreography allows",
    ),
  ];
}

function said(broken: boolean, what: string): string[] {
  return broken ? [what] : [];
}

function onTheDisplay(area: ScreenRect, rect: ScreenRect): boolean {
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

function titleShows(pane: ScreenRect, above: readonly ScreenRect[]): boolean {
  const width = Math.min(title.width, pane.width);
  const lefts = Array.from({ length: pane.width - width + 1 }, (_, shift) => pane.x + shift);
  return lefts.some((x) => {
    const glimpse = { x, y: pane.y, width, height: title.height };
    return !above.some((other) => overlaps(glimpse, other));
  });
}

function nearestAllowed(desk: Desk, pattern: Pattern): number {
  const { console: home, workArea: area } = desk;
  const near = Math.max(area.x, home.x);
  const far = Math.min(area.x + area.width, home.x + home.width);
  const farSide = far - Math.round((far - near) * groundMetrics.farShare);
  return pattern === "cascade" ? Math.min(farSide, near + title.width) : farSide;
}
