import type { Extent } from "@keywork-app/habitat";
import { tierMinPx } from "../../page/tiers.ts";
import { gridTracks, type Span } from "../outside/grid.ts";
import type { ScreenRect } from "../port.ts";
import { outsideMetrics } from "./arrange.ts";
import { grownBy, spanning } from "./pattern-rects.ts";

export interface Line {
  readonly of: number;
  readonly at: number;
}

export interface Seat {
  readonly left: Line;
  readonly top: Line;
  readonly right: Line;
  readonly bottom: Line;
}

export interface Deal {
  readonly name: string;
  readonly seats: readonly Seat[];
}

export interface Share {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const dealMetrics = {
  fewest: 8,
  most: 16,
  finestCut: 4,
  smallestSeat: { width: tierMinPx.clipping, height: outsideMetrics.floor.height },
} as const;

export function drawn(name: string, ...picture: readonly string[]): Deal {
  const columns = Math.max(0, ...picture.map((line) => line.length));
  const marks = picture.flatMap((line, row) =>
    [...line].map((letter, column) => ({ letter, column, row })),
  );
  const seatOf = (letter: string): Seat => {
    const lettered = marks.filter((mark) => mark.letter === letter);
    const across = lettered.map((mark) => mark.column);
    const down = lettered.map((mark) => mark.row);
    return {
      left: { of: columns, at: Math.min(...across) },
      top: { of: picture.length, at: Math.min(...down) },
      right: { of: columns, at: Math.max(...across) + 1 },
      bottom: { of: picture.length, at: Math.max(...down) + 1 },
    };
  };
  return { name, seats: [...new Set(marks.map((mark) => mark.letter))].map(seatOf) };
}

export function evenRows(count: number): Deal {
  const widest = Math.min(dealMetrics.finestCut, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / widest);
  const seats = shared(count, rows).flatMap((seated, row) =>
    Array.from({ length: seated }, (_, at) => ({
      left: { of: seated, at },
      top: { of: rows, at: row },
      right: { of: seated, at: at + 1 },
      bottom: { of: rows, at: row + 1 },
    })),
  );
  return { name: "rows", seats };
}

export function turned(deal: Deal, name: string): Deal {
  const seats = deal.seats.map(({ left, top, right, bottom }) => ({
    left: top,
    top: left,
    right: bottom,
    bottom: right,
  }));
  return { name, seats: inReadingOrder(seats) };
}

export function flipped(deal: Deal): Deal {
  return { ...deal, seats: inReadingOrder(deal.seats.map(reflected)) };
}

export function reflected(seat: Seat): Seat {
  const across = ({ of, at }: Line): Line => ({ of, at: of - at });
  return { ...seat, left: across(seat.right), right: across(seat.left) };
}

export function mirrorsItself(deal: Deal): boolean {
  return sameSeats(deal, flipped(deal));
}

export function sameSeats(one: Deal, other: Deal): boolean {
  const shares = (deal: Deal): string => JSON.stringify(inReadingOrder(deal.seats).map(shareOf));
  return shares(one) === shares(other);
}

export function largestFirst(seats: readonly Seat[]): Seat[] {
  const room = (seat: Seat): number => shareOf(seat).width * shareOf(seat).height;
  const lesserSide = (seat: Seat): number => Math.min(shareOf(seat).width, shareOf(seat).height);
  return inReadingOrder(seats).toSorted(
    (one, other) => evened(room(other) - room(one)) || evened(lesserSide(other) - lesserSide(one)),
  );
}

export function inReadingOrder(seats: readonly Seat[]): Seat[] {
  return seats.toSorted(readingOrder);
}

export function readingOrder(one: Seat, other: Seat): number {
  return shareOf(one).y - shareOf(other).y || shareOf(one).x - shareOf(other).x;
}

export function shareOf(seat: Seat): Share {
  const x = placeOf(seat.left);
  const y = placeOf(seat.top);
  return {
    x: evened(x),
    y: evened(y),
    width: evened(placeOf(seat.right) - x),
    height: evened(placeOf(seat.bottom) - y),
  };
}

export function placeOf(line: Line): number {
  return line.at / line.of;
}

export function holdsOn(canvas: ScreenRect, deal: Deal): boolean {
  const { smallestSeat } = dealMetrics;
  const smallest = smallestOn(canvas, deal);
  return smallest.width >= smallestSeat.width && smallest.height >= smallestSeat.height;
}

export function smallestOn(canvas: ScreenRect, deal: Deal): Extent {
  const seats = deal.seats.map((seat) => seatOn(canvas, seat));
  return {
    width: Math.min(...seats.map((seat) => seat.width)),
    height: Math.min(...seats.map((seat) => seat.height)),
  };
}

export function seatOn(canvas: ScreenRect, seat: Seat): ScreenRect {
  const gridded = grownBy(canvas, outsideMetrics.gap);
  const across = (line: Line): Span[] => gridTracks(gridded.x, gridded.width, line.of);
  const down = (line: Line): Span[] => gridTracks(gridded.y, gridded.height, line.of);
  return spanning(
    across(seat.left)[seat.left.at]?.start ?? canvas.x,
    down(seat.top)[seat.top.at]?.start ?? canvas.y,
    across(seat.right)[seat.right.at - 1]?.end ?? canvas.x + canvas.width,
    down(seat.bottom)[seat.bottom.at - 1]?.end ?? canvas.y + canvas.height,
  );
}

const sharePlaces = 9;

function evened(share: number): number {
  return Number(share.toFixed(sharePlaces));
}

function shared(whole: number, parts: number): number[] {
  const each = Math.floor(whole / parts);
  return Array.from({ length: parts }, (_, at) => each + (at < whole % parts ? 1 : 0));
}
