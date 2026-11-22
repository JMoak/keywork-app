import type { Extent } from "@keywork-app/habitat";
import type { ScreenPoint, ScreenRect, SurfaceId } from "../port.ts";
import { outsideMetrics, type Standing, type Wanted } from "./arrange.ts";
import { bottomOf, clamp, fitsIn, largestOf, reachOf, rightOf } from "./pattern-rects.ts";

export interface Shape {
  readonly places: readonly Standing[];
  readonly arrival: readonly SurfaceId[];
}

export interface DeckSize {
  readonly runs: number;
  readonly perRun: number;
}

export interface Cell {
  readonly column: number;
  readonly row: number;
}

export type Fill = "rows" | "columns";

export type Wave = "outward" | "across" | "down";

export const fills: readonly Fill[] = ["rows", "columns"];

export const waves: readonly Wave[] = ["outward", "across", "down"];

export const shapeMetrics = {
  titleStep: outsideMetrics.cascadeStep,
  titleInSight: 4 * outsideMetrics.cascadeStep,
  pileDrift: 4,
  fan: { loosest: 0.8, tightest: 96, curve: 4 },
  burst: { spreading: 1.5, loosening: 3 },
} as const;

export function cascadeShape(panes: readonly Wanted[], room: Extent): Shape {
  return deck(panes, room, cascading);
}

export function cascadeDecks(count: number, largest: Extent, room: Extent): DeckSize[] {
  const { titleStep, titleInSight } = shapeMetrics;
  const across = Math.floor((room.width - largest.width) / titleInSight) + 1;
  const down = Math.floor((room.height - largest.height) / titleStep) + 1;
  const everyRunCount = Array.from({ length: clamp(across, 0, count) }, (_, index) => index + 1);
  return everyRunCount.flatMap((runs) => {
    const even = Math.ceil(count / runs);
    const lengths = even < down ? [even, down] : [down];
    return lengths.filter((perRun) => perRun > 0).map((perRun) => ({ runs, perRun }));
  });
}

export function cascadeSlots({ runs, perRun }: DeckSize): ScreenPoint[] {
  return Array.from({ length: runs * perRun }, (_, index) => deckSlot(index, perRun, cascading));
}

export function pileShape(panes: readonly Wanted[], room: Extent): Shape {
  return deck(panes, room, piling);
}

export function stairShape(panes: readonly Wanted[], room: Extent): Shape {
  const treads: Standing[] = [];
  for (const { id, size } of panes) treads.push({ id, bounds: nextTread(treads, size, room) });
  return { places: treads, arrival: panes.map((pane) => pane.id) };
}

export function fanShape(panes: readonly Wanted[], room: Extent): Shape {
  const { titleStep, fan } = shapeMetrics;
  const order = middleOutward(panes.length);
  const middle = order[0] ?? 0;
  const lefts = fanLefts(panes, room);
  const places = placedAt(panes, (index) => ({
    x: lefts[index] ?? 0,
    y: titleStep * order.indexOf(index) + fan.curve * (index - middle) ** 2,
  }));
  return { places, arrival: idsIn(panes, order) };
}

export function gridShape(
  panes: readonly Wanted[],
  room: Extent,
  fill: Fill = "rows",
  wave: Wave = "outward",
): Shape {
  const { gap } = outsideMetrics;
  const cell = largestOf(panes.map((pane) => pane.size));
  const pitch = { width: cell.width + gap, height: cell.height + gap };
  const columns = columnsFor(panes.length, pitch, room);
  const rows = Math.ceil(panes.length / columns);
  const cells = panes.map((_, index) => cellFilled(fill, index, columns, rows));
  const places = placedAt(panes, (index) => ({
    x: (cells[index]?.column ?? 0) * pitch.width,
    y: (cells[index]?.row ?? 0) * pitch.height,
  }));
  return { places, arrival: idsIn(panes, inWave(wave, cells)) };
}

export function columnShape(panes: readonly Wanted[]): Shape {
  const tops = startsOf(panes.map((pane) => pane.size.height + outsideMetrics.gap));
  return {
    places: placedAt(panes, (index) => ({ x: 0, y: tops[index] ?? 0 })),
    arrival: panes.map((pane) => pane.id),
  };
}

export function inWave(wave: Wave, cells: readonly Cell[]): number[] {
  const reached = (index: number): number => {
    const cell = cells[index];
    return cell === undefined ? 0 : reachIn[wave](cell);
  };
  return cells.map((_, index) => index).toSorted((a, b) => reached(a) - reached(b) || a - b);
}

export function burstShape(panes: readonly Wanted[]): Shape {
  const tallest = largestOf(panes.map((pane) => pane.size)).height;
  const rippleAt = (index: number): Ripple => rippleOf(index, panes.length);
  const span = ({ wave, of }: Ripple): number => (of - 1) * apartIn(wave) + tallest;
  const depth = Math.max(0, ...panes.map((_, index) => span(rippleAt(index))));
  const places = placedAt(panes, (index) => {
    const ripple = rippleAt(index);
    return {
      x: outwardOf(ripple.wave),
      y: Math.round((depth - span(ripple)) / 2) + ripple.turn * apartIn(ripple.wave),
    };
  });
  return { places, arrival: panes.map((pane) => pane.id) };
}

export function mirrored(shape: Shape): Shape {
  const { width } = reachOf(shape.places.map((place) => place.bounds));
  const flipped = (bounds: ScreenRect): ScreenRect => ({ ...bounds, x: width - rightOf(bounds) });
  return {
    ...shape,
    places: shape.places.map(({ id, bounds }) => ({ id, bounds: flipped(bounds) })),
  };
}

interface DeckStep {
  readonly across: number;
  readonly down: number;
}

const cascading: DeckStep = { across: -shapeMetrics.titleStep, down: shapeMetrics.titleStep };

const piling: DeckStep = { across: shapeMetrics.pileDrift, down: shapeMetrics.titleStep };

function deck(panes: readonly Wanted[], room: Extent, step: DeckStep): Shape {
  const tallest = largestOf(panes.map((pane) => pane.size)).height;
  const longest = Math.max(1, Math.floor((room.height - tallest) / step.down) + 1);
  const runs = Math.max(1, Math.ceil(panes.length / longest));
  const perRun = Math.max(1, Math.ceil(panes.length / runs));
  return {
    places: placedAt(panes, (index) => deckSlot(index, perRun, step)),
    arrival: panes.map((pane) => pane.id),
  };
}

function deckSlot(index: number, perRun: number, step: DeckStep): ScreenPoint {
  const run = Math.floor(index / perRun);
  const along = index % perRun;
  const runShift = shapeMetrics.titleInSight + Math.max(0, step.across) * (perRun - 1);
  const lean = step.across < 0 ? -step.across * (perRun - 1 - along) : step.across * along;
  return { x: run * runShift + lean, y: along * step.down };
}

function nextTread(climbed: readonly Standing[], size: Extent, room: Extent): ScreenRect {
  const { gap, cascadeStep } = outsideMetrics;
  const last = climbed.at(-1)?.bounds;
  if (last === undefined) return { x: 0, y: 0, ...size };
  const below = bottomOf(last) + gap;
  if (below + size.height <= room.height) return { x: last.x + cascadeStep, y: below, ...size };
  const flights = reachOf(climbed.map((tread) => tread.bounds));
  return { x: flights.width + gap, y: 0, ...size };
}

function middleOutward(count: number): number[] {
  const middle = Math.floor((count - 1) / 2);
  return Array.from(
    { length: count },
    (_, turn) => middle + (turn % 2 === 1 ? 1 : -1) * Math.ceil(turn / 2),
  );
}

function fanLefts(panes: readonly Wanted[], room: Extent): number[] {
  const share = fanShare(panes, room);
  return startsOf(panes.map((pane) => Math.floor(share * pane.size.width)));
}

function fanShare(panes: readonly Wanted[], room: Extent): number {
  const { loosest, tightest } = shapeMetrics.fan;
  const widths = panes.map((pane) => pane.size.width);
  const before = startsOf(widths);
  const fitting = widths.flatMap((width, index) =>
    index === 0 ? [] : [(room.width - width) / (before[index] ?? width)],
  );
  return Math.max(tightest / Math.min(...widths), Math.min(loosest, ...fitting));
}

function startsOf(lengths: readonly number[]): number[] {
  return lengths.map((_, index) =>
    lengths.slice(0, index).reduce((sum, length) => sum + length, 0),
  );
}

const reachIn: Record<Wave, (cell: Cell) => number> = {
  outward: ({ column, row }) => column + row,
  across: ({ column }) => column,
  down: ({ row }) => row,
};

function cellFilled(fill: Fill, index: number, columns: number, rows: number): Cell {
  return fill === "rows"
    ? { column: index % columns, row: Math.floor(index / columns) }
    : { column: Math.floor(index / rows), row: index % rows };
}

function columnsFor(count: number, pitch: Extent, room: Extent): number {
  const { gap } = outsideMetrics;
  const wished = Math.max(1, Math.ceil(Math.sqrt(count)));
  const fits = (columns: number): boolean =>
    fitsIn(room, {
      width: columns * pitch.width - gap,
      height: Math.ceil(count / columns) * pitch.height - gap,
    });
  const nearerTheWish = (best: number, columns: number): number =>
    Math.abs(columns - wished) < Math.abs(best - wished) ? columns : best;
  const fitting = Array.from({ length: count }, (_, index) => index + 1).filter(fits);
  return fitting.reduce(nearerTheWish, fitting[0] ?? wished);
}

interface Ripple {
  readonly wave: number;
  readonly turn: number;
  readonly of: number;
}

function rippleOf(index: number, count: number, wave = 0): Ripple {
  const nearest = Math.ceil(count / 2);
  return index < nearest
    ? { wave, turn: index, of: nearest }
    : rippleOf(index - nearest, count - nearest, wave + 1);
}

function outwardOf(wave: number): number {
  const { titleInSight, burst } = shapeMetrics;
  return Math.round((titleInSight * (burst.spreading ** wave - 1)) / (burst.spreading - 1));
}

function apartIn(wave: number): number {
  return shapeMetrics.titleStep * shapeMetrics.burst.loosening ** wave;
}

function placedAt(panes: readonly Wanted[], corner: (index: number) => ScreenPoint): Standing[] {
  return panes.map(({ id, size }, index) => ({ id, bounds: { ...corner(index), ...size } }));
}

function idsIn(panes: readonly Wanted[], order: readonly number[]): SurfaceId[] {
  return order.flatMap((index) => panes[index]?.id ?? []);
}
