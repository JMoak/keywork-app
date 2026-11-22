import { codeWidth, type Extent } from "@keywork-app/habitat";
import type { Direction } from "../../layout/index.ts";
import { tierMinPx } from "../../page/tiers.ts";
import { type OutsideKind, outsideMetrics } from "../feel/arrange.ts";
import type { Desk, ScreenPoint, ScreenRect } from "../port.ts";

export const gridFractions = [2, 3, 4] as const;

export const sizeNames = ["card", "reading", "working", "half", "full"] as const;

export type SizeName = (typeof sizeNames)[number];

export interface SizePreset {
  readonly name: SizeName;
  readonly size: Extent;
}

export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface GridShape {
  readonly columns: number;
  readonly rows: number;
}

export interface GridPlace {
  readonly column: number;
  readonly row: number;
}

export function gridTracks(start: number, length: number, parts: number): Span[] {
  const { gap } = outsideMetrics;
  const track = Math.max(1, Math.floor((length - gap * (parts + 1)) / parts));
  return Array.from({ length: parts }, (_, at) => {
    const from = start + gap + at * (track + gap);
    return { start: from, end: from + track };
  });
}

export function gridCell(area: ScreenRect, shape: GridShape, at: GridPlace): ScreenRect {
  const across = gridTracks(area.x, area.width, shape.columns)[at.column];
  const down = gridTracks(area.y, area.height, shape.rows)[at.row];
  if (across === undefined || down === undefined) return area;
  return {
    x: across.start,
    y: down.start,
    width: across.end - across.start,
    height: down.end - down.start,
  };
}

export function sizeLadder(area: ScreenRect, kind: OutsideKind): readonly SizePreset[] {
  const ascending: SizePreset[] = [];
  for (const name of sizeNames) {
    const size = presetSize(name, area, kind);
    const largest = ascending.at(-1)?.size;
    if (largest === undefined || roomIn(size) > roomIn(largest)) ascending.push({ name, size });
  }
  return ascending;
}

export function presetSize(name: SizeName, area: ScreenRect, kind: OutsideKind): Extent {
  const { gap, floor, restingHeight, workingShare } = outsideMetrics;
  const within = { width: area.width - 2 * gap, height: area.height - 2 * gap };
  const tall = (height: number): Extent => ({
    width: readingColumn(area, kind),
    height: Math.min(Math.round(height), within.height),
  });
  switch (name) {
    case "card":
      return tall(floor.height);
    case "reading":
      return tall(restingHeight);
    case "working":
      return tall(area.height * workingShare);
    case "half":
      return { width: trackWidth(area, 2), height: within.height };
    case "full":
      return { width: area.width, height: area.height };
  }
}

export function steppedOnGrid(
  desk: Desk,
  pane: ScreenRect,
  direction: Direction,
  others: readonly ScreenRect[],
): ScreenRect {
  const area = areaHolding(desk, pane);
  const axis = axisOf(direction);
  const stops = [
    ...gridStops(axis, area, pane),
    ...seatsBeside(axis, pane, [desk.console, ...others]),
    ...inLineWith(axis, pane, desk.console),
  ].filter((stop) => restsWithin(axis, area, pane, stop));
  const next = nextStop(stops, pane[axis], direction);
  return next === undefined ? pane : { ...pane, [axis]: next };
}

export function steppedAlongLadder(
  desk: Desk,
  pane: ScreenRect,
  kind: OutsideKind,
  step: number,
): ScreenRect {
  const area = areaHolding(desk, pane);
  const ladder = sizeLadder(area, kind);
  const next =
    step > 0
      ? ladder.find(({ size }) => roomIn(size) > roomIn(pane))
      : ladder.findLast(({ size }) => roomIn(size) < roomIn(pane));
  return next === undefined ? pane : sizedOn(area, pane, next);
}

export function sizedOn(area: ScreenRect, pane: ScreenPoint, preset: SizePreset): ScreenRect {
  if (preset.name === "full") return area;
  const { gap } = outsideMetrics;
  const { width, height } = preset.size;
  return {
    x: clamp(pane.x, area.x + gap, area.x + area.width - gap - width),
    y: clamp(pane.y, area.y + gap, area.y + area.height - gap - height),
    width,
    height,
  };
}

export function standsFull(desk: Desk, rect: ScreenRect): boolean {
  return desk.displays.some(({ workArea }) => sameRect(workArea, rect));
}

export function areaHolding(desk: Desk, rect: ScreenRect): ScreenRect {
  const at = centreOf(rect);
  return desk.displays.find(({ bounds }) => holdsPoint(bounds, at))?.workArea ?? desk.workArea;
}

export function sameRect(one: ScreenRect, other: ScreenRect): boolean {
  return (
    one.x === other.x &&
    one.y === other.y &&
    one.width === other.width &&
    one.height === other.height
  );
}

type Axis = "x" | "y";

const codePanes: ReadonlySet<OutsideKind> = new Set<OutsideKind>(["file", "diff"]);

const closeEnough = 0.5;

function readingColumn(area: ScreenRect, kind: OutsideKind): number {
  const needed = codePanes.has(kind) ? Math.max(tierMinPx.column, codeWidth) : tierMinPx.column;
  const narrowestFirst = gridFractions.toReversed().map((parts) => trackWidth(area, parts));
  return narrowestFirst.find((width) => width >= needed) ?? trackWidth(area, 1);
}

function trackWidth(area: ScreenRect, parts: number): number {
  const [first] = gridTracks(area.x, area.width, parts);
  return first === undefined ? area.width : first.end - first.start;
}

function gridStops(axis: Axis, area: ScreenRect, pane: ScreenRect): number[] {
  const span = lengthAlong(axis, pane);
  const cuts = gridFractions.map((parts) => gridTracks(area[axis], lengthAlong(axis, area), parts));
  const cutToFit = cuts.filter((tracks) => tracks.some((track) => fills(track, span)));
  const starts = (cutToFit.length > 0 ? cutToFit : cuts).flat().map((track) => track.start);
  return [...starts, farEdge(axis, area) - outsideMetrics.gap - span];
}

function fills(track: Span, span: number): boolean {
  return Math.abs(track.end - track.start - span) <= closeEnough;
}

function seatsBeside(axis: Axis, pane: ScreenRect, standing: readonly ScreenRect[]): number[] {
  const { gap } = outsideMetrics;
  const span = lengthAlong(axis, pane);
  return standing
    .filter((other) => sharesTheLane(axis, pane, other))
    .flatMap((other) => [other[axis] - gap - span, farEdge(axis, other) + gap])
    .filter((seat) => standing.every((other) => !covers({ ...pane, [axis]: seat }, other)));
}

function inLineWith(axis: Axis, pane: ScreenRect, console: ScreenRect): number[] {
  if (sharesTheLane(axis, pane, console)) return [];
  return [console[axis], farEdge(axis, console) - lengthAlong(axis, pane)];
}

function covers(one: ScreenRect, other: ScreenRect): boolean {
  return sharesTheLane("x", one, other) && sharesTheLane("y", one, other);
}

function sharesTheLane(axis: Axis, pane: ScreenRect, other: ScreenRect): boolean {
  const across = axis === "x" ? "y" : "x";
  return pane[across] < farEdge(across, other) && other[across] < farEdge(across, pane);
}

function restsWithin(axis: Axis, area: ScreenRect, pane: ScreenRect, stop: number): boolean {
  const { gap } = outsideMetrics;
  const first = area[axis] + gap;
  const last = farEdge(axis, area) - gap - lengthAlong(axis, pane);
  return stop >= first - closeEnough && stop <= last + closeEnough;
}

function nextStop(
  stops: readonly number[],
  from: number,
  direction: Direction,
): number | undefined {
  const ahead =
    direction === "right" || direction === "down"
      ? stops.filter((stop) => stop > from + closeEnough)
      : stops.filter((stop) => stop < from - closeEnough);
  const nearest = ahead.toSorted((a, b) => Math.abs(a - from) - Math.abs(b - from))[0];
  return nearest === undefined ? undefined : Math.round(nearest);
}

function axisOf(direction: Direction): Axis {
  return direction === "left" || direction === "right" ? "x" : "y";
}

function roomIn(size: Extent): number {
  return size.width * size.height;
}

function lengthAlong(axis: Axis, rect: ScreenRect): number {
  return axis === "x" ? rect.width : rect.height;
}

function farEdge(axis: Axis, rect: ScreenRect): number {
  return rect[axis] + lengthAlong(axis, rect);
}

function centreOf(rect: ScreenRect): ScreenPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function holdsPoint(area: ScreenRect, point: ScreenPoint): boolean {
  return (
    point.x >= area.x &&
    point.x < area.x + area.width &&
    point.y >= area.y &&
    point.y < area.y + area.height
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}
