import { outsideMetrics } from "../feel/arrange.ts";
import { dealMetrics, type Line, reflected, type Seat, seatOn } from "../feel/pattern-deals.ts";
import type { Desk, ScreenRect } from "../port.ts";
import { holdsACard, roomsToDealOn } from "./stage.ts";

export const drillPictureMetrics = {
  leadOf: 4,
  leadRows: 3,
  trail: 3,
  cardColumns: 2,
  cardRows: 3,
} as const;

export interface DrillSeats {
  readonly lead: ScreenRect;
  readonly trail: readonly ScreenRect[];
  readonly cards: readonly ScreenRect[];
}

export function drillSeats(
  desk: Desk,
  standing: readonly ScreenRect[],
  ancestors: number,
  others: number,
): DrillSeats | undefined {
  const room = roomsToDealOn(desk, standing)[0]?.room;
  if (room === undefined) return undefined;
  const half = seatOn(room, halfSeat(0, 1));
  const across = cardsAcross(half.width);
  const down = cardsDown(room.height);
  if (across < drillPictureMetrics.cardColumns) return undefined;
  const trailing = Math.min(ancestors, drillPictureMetrics.trail, across);
  const wanted = Math.min(ancestors - trailing + others, across * down);
  const drawn = [
    leadSeat(trailing > 0),
    ...trailSeats(trailing),
    ...cardSeats(wanted, gridFor(wanted, across, down, half, room)),
  ];
  const hubOnTheRight = middleOf(desk.console) > middleOf(room);
  const seats = (hubOnTheRight ? drawn.map(reflected) : drawn).map((seat) => seatOn(room, seat));
  if (!seats.every(holdsACard)) return undefined;
  const [lead, ...rest] = seats;
  if (lead === undefined) return undefined;
  return {
    lead,
    trail: rest.slice(0, trailing),
    cards: rest.slice(trailing).toSorted((one, other) => one.y - other.y || one.x - other.x),
  };
}

interface Grid {
  readonly columns: number;
  readonly rows: number;
}

function leadSeat(overATrail: boolean): Seat {
  const { leadOf, leadRows } = drillPictureMetrics;
  return {
    ...halfSeat(0, 1),
    bottom: { of: leadOf, at: overATrail ? leadRows : leadOf },
  };
}

function trailSeats(count: number): Seat[] {
  const { leadOf, leadRows } = drillPictureMetrics;
  return Array.from({ length: count }, (_, at) => ({
    left: { of: 2 * count, at },
    right: { of: 2 * count, at: at + 1 },
    top: { of: leadOf, at: leadRows },
    bottom: { of: leadOf, at: leadOf },
  }));
}

function cardSeats(count: number, { columns, rows }: Grid): Seat[] {
  return Array.from({ length: count }, (_, at) => {
    const row = Math.floor(at / columns);
    const inTheRow = Math.min(columns, count - row * columns);
    const place = inTheRow + (at % columns);
    return {
      left: { of: 2 * inTheRow, at: place },
      right: { of: 2 * inTheRow, at: place + 1 },
      top: { of: rows, at: row },
      bottom: { of: rows, at: row + 1 },
    };
  });
}

function gridFor(
  count: number,
  across: number,
  down: number,
  half: ScreenRect,
  room: ScreenRect,
): Grid {
  const { smallestSeat } = dealMetrics;
  const { gap } = outsideMetrics;
  const fewestRows = Math.min(down, drillPictureMetrics.cardRows);
  const grids = Array.from({ length: across }, (_, at): Grid => {
    const columns = at + 1;
    return { columns, rows: Math.max(fewestRows, Math.ceil(count / columns)) };
  }).filter((grid) => grid.rows <= down);
  const ease = ({ columns, rows }: Grid): number =>
    Math.min(
      (half.width - (columns - 1) * gap) / columns / smallestSeat.width,
      (room.height - (rows - 1) * gap) / rows / smallestSeat.height,
    );
  return grids.toSorted((one, other) => ease(other) - ease(one))[0] ?? { columns: 1, rows: 1 };
}

function halfSeat(from: number, to: number): Seat {
  const whole: Line = { of: 1, at: 0 };
  return {
    left: { of: 2, at: from },
    right: { of: 2, at: to },
    top: whole,
    bottom: { of: 1, at: 1 },
  };
}

function cardsAcross(width: number): number {
  const { gap } = outsideMetrics;
  return Math.floor((width + gap) / (dealMetrics.smallestSeat.width + gap));
}

function cardsDown(height: number): number {
  const { gap } = outsideMetrics;
  return Math.floor((height + gap) / (dealMetrics.smallestSeat.height + gap));
}

function middleOf(rect: ScreenRect): number {
  return rect.x + rect.width / 2;
}
