import { type Extent, overlaps, yardMetrics } from "@keywork-app/habitat";
import type { Desk, ScreenPoint, ScreenRect, SurfaceId } from "../port.ts";

export type OutsideKind = "conversation" | "file" | "diff" | "stead" | "note";

export interface Wanted {
  readonly id: SurfaceId;
  readonly size: Extent;
  readonly weight?: number | undefined;
}

export interface Standing {
  readonly id: SurfaceId;
  readonly bounds: ScreenRect;
}

export const outsideMetrics = {
  gap: yardMetrics.gap,
  strip: 28,
  cascadeStep: 32,
  cascadeRunShift: 3,
  emergeTravel: 96,
  floor: { width: yardMetrics.readable.width, height: 160 },
  restingHeight: yardMetrics.readable.height,
  workingShare: 0.6,
} as const;

export function orbit(
  desk: Desk,
  arriving: readonly Wanted[],
  standing: readonly ScreenRect[] = [],
): readonly Standing[] {
  const seated: Standing[] = [];
  for (const pane of arriving) {
    const taken = [...standing, ...seated.map((other) => other.bounds)];
    const bounds =
      seatBeside(desk, pane.size, taken) ?? seatOverTheFarThird(desk, pane.size, taken);
    seated.push({ id: pane.id, bounds });
  }
  return seated;
}

export function emergeStart(desk: Desk, target: ScreenRect): ScreenRect {
  return emergedFrom(consoleOn(desk), desk.workArea, target);
}

export function recallEnd(desk: Desk, current: ScreenRect): ScreenRect {
  return emergeStart(desk, current);
}

export function ariseStart(desk: Desk, parent: ScreenRect, target: ScreenRect): ScreenRect {
  return emergedFrom(parent, areaHolding(desk, parent), target);
}

export function seatBesidePane(
  desk: Desk,
  parent: ScreenRect,
  size: Extent,
  taken: readonly ScreenRect[] = [],
): ScreenRect | undefined {
  const { gap } = outsideMetrics;
  const area = areaHolding(desk, parent);
  const insideTheMargin: ScreenRect = {
    x: area.x + gap,
    y: area.y + gap,
    width: area.width - 2 * gap,
    height: area.height - 2 * gap,
  };
  const besideIt: ScreenRect[] = [
    { x: right(parent) + gap, y: parent.y, ...size },
    { x: parent.x, y: bottom(parent) + gap, ...size },
    { x: parent.x - gap - size.width, y: parent.y, ...size },
    { x: parent.x, y: parent.y - gap - size.height, ...size },
  ];
  return besideIt
    .map((seat) => keptOn(insideTheMargin, seat))
    .find(
      (seat) =>
        holds(insideTheMargin, seat) && [parent, ...taken].every((rect) => apart(seat, rect)),
    );
}

export function spread(desk: Desk, outside: readonly Standing[]): readonly Standing[] {
  const areaOf = (pane: Standing): ScreenRect => areaHolding(desk, pane.bounds);
  const spreadOut = distinct(outside.map(areaOf)).flatMap((area) =>
    spreadOver(
      area,
      outside.filter((pane) => sameRect(areaOf(pane), area)),
    ),
  );
  return outside.map((pane) => spreadOut.find((other) => other.id === pane.id) ?? pane);
}

export function travelBetween(from: ScreenRect, to: ScreenRect): number {
  return distance(from, to);
}

type Side = "right" | "left" | "below" | "above";

function emergedFrom(home: ScreenRect, area: ScreenRect, target: ScreenRect): ScreenRect {
  const tucked = tuckedInto(home, target);
  const travels = distance(tucked, target) >= outsideMetrics.emergeTravel;
  return keptOn(area, travels ? tucked : drawnBack(home, target));
}

function seatBeside(
  desk: Desk,
  size: Extent,
  taken: readonly ScreenRect[],
): ScreenRect | undefined {
  if (desk.consoleMaximized) return undefined;
  const home = consoleOn(desk);
  const blocked = [home, underCursor(desk.cursor), ...taken];
  const free = (seat: ScreenRect): boolean =>
    holds(desk.workArea, seat) && blocked.every((rect) => apart(seat, rect));
  return sidesByRoom(desk.workArea, home)
    .flatMap((side) => seatsOn(side, home, size, blocked))
    .find(free);
}

function sidesByRoom(area: ScreenRect, home: ScreenRect): readonly Side[] {
  const roomLeft = home.x - area.x;
  const roomRight = right(area) - right(home);
  return roomLeft > roomRight
    ? ["left", "right", "below", "above"]
    : ["right", "left", "below", "above"];
}

function seatsOn(
  side: Side,
  home: ScreenRect,
  size: Extent,
  blocked: readonly ScreenRect[],
): readonly ScreenRect[] {
  const { gap } = outsideMetrics;
  const downTheColumn = onward(home.y, blocked.map(bottom));
  const alongTheRow = onward(home.x, blocked.map(right));
  switch (side) {
    case "right":
      return columns(onward(right(home) + gap, blocked.map(right)), downTheColumn, size);
    case "left":
      return columns(
        backward(home.x - gap - size.width, blocked.map(left), size.width),
        downTheColumn,
        size,
      );
    case "below":
      return rows(onward(bottom(home) + gap, blocked.map(bottom)), alongTheRow, size);
    case "above":
      return rows(
        backward(home.y - gap - size.height, blocked.map(top), size.height),
        alongTheRow,
        size,
      );
  }
}

function onward(first: number, edges: readonly number[]): number[] {
  const past = edges.map((edge) => edge + outsideMetrics.gap);
  return [...new Set([first, ...past])].filter((at) => at >= first).sort((a, b) => a - b);
}

function backward(first: number, edges: readonly number[], span: number): number[] {
  const short = edges.map((edge) => edge - outsideMetrics.gap - span);
  return [...new Set([first, ...short])].filter((at) => at <= first).sort((a, b) => b - a);
}

function columns(xs: readonly number[], ys: readonly number[], size: Extent): ScreenRect[] {
  return xs.flatMap((x) => ys.map((y) => ({ x, y, ...size })));
}

function rows(ys: readonly number[], xs: readonly number[], size: Extent): ScreenRect[] {
  return ys.flatMap((y) => xs.map((x) => ({ x, y, ...size })));
}

function seatOverTheFarThird(desk: Desk, size: Extent, taken: readonly ScreenRect[]): ScreenRect {
  const slots = cascadeSlots(desk, size);
  const uncrowded = (seat: ScreenRect): boolean =>
    !taken.some((other) => sharesCorner(seat, other));
  return (
    slots.find((slot) => uncrowded(slot) && clearOfCursor(desk, slot)) ??
    slots.map((slot) => dodgingCursor(desk, slot)).find(uncrowded) ??
    dodgingCursor(desk, cascadeSlot(desk, size, 0, 0))
  );
}

function cascadeSlots(desk: Desk, size: Extent): readonly ScreenRect[] {
  const { across, down } = cascadeRoom(desk, size);
  return Array.from({ length: across * down }, (_, step) => {
    const run = Math.floor(step / down);
    const along = step % down;
    return cascadeSlot(desk, size, (along + run * outsideMetrics.cascadeRunShift) % across, along);
  });
}

function cascadeSlot(desk: Desk, size: Extent, inward: number, downward: number): ScreenRect {
  const { gap, cascadeStep } = outsideMetrics;
  const home = consoleOn(desk);
  return keptOn(desk.workArea, {
    x: right(home) - gap - size.width - inward * cascadeStep,
    y: home.y + gap + downward * cascadeStep,
    ...size,
  });
}

function cascadeRoom(desk: Desk, size: Extent): { across: number; down: number } {
  const { gap, cascadeStep } = outsideMetrics;
  const home = consoleOn(desk);
  const first = cascadeSlot(desk, size, 0, 0);
  const fitsAcross = size.width <= home.width - 2 * gap;
  const fitsDown = size.height <= home.height - 2 * gap;
  const leftmost = fitsAcross ? home.x + gap : desk.workArea.x;
  const lowest = fitsDown ? bottom(home) - gap : bottom(desk.workArea);
  const stepsIn = (room: number): number => Math.max(1, Math.floor(room / cascadeStep) + 1);
  return { across: stepsIn(first.x - leftmost), down: stepsIn(lowest - bottom(first)) };
}

function sharesCorner(one: ScreenRect, other: ScreenRect): boolean {
  const near = outsideMetrics.cascadeStep / 2;
  return Math.abs(right(one) - right(other)) < near && Math.abs(one.y - other.y) < near;
}

function clearOfCursor(desk: Desk, seat: ScreenRect): boolean {
  return apart(seat, underCursor(desk.cursor));
}

function dodgingCursor(desk: Desk, seat: ScreenRect): ScreenRect {
  if (clearOfCursor(desk, seat)) return seat;
  const { cursor, workArea } = desk;
  const { gap } = outsideMetrics;
  const dodges: ScreenRect[] = [
    { ...seat, x: cursor.x - gap - seat.width },
    { ...seat, x: cursor.x + gap },
    { ...seat, y: cursor.y - gap - seat.height },
    { ...seat, y: cursor.y + gap },
  ];
  return (
    dodges
      .filter((dodge) => holds(workArea, dodge))
      .toSorted((a, b) => distance(seat, a) - distance(seat, b))[0] ?? seat
  );
}

function tuckedInto(home: ScreenRect, rect: ScreenRect): ScreenRect {
  return {
    ...rect,
    x: clamp(rect.x, home.x, Math.max(home.x, right(home) - rect.width)),
    y: clamp(rect.y, home.y, Math.max(home.y, bottom(home) - rect.height)),
  };
}

function drawnBack(home: ScreenRect, target: ScreenRect): ScreenRect {
  const fromTheMiddle = outward(centre(target).x - centre(home).x);
  return { ...target, x: target.x - fromTheMiddle * outsideMetrics.emergeTravel };
}

function outward(offset: number): number {
  return offset < 0 ? -1 : 1;
}

interface Grid {
  readonly columns: number;
  readonly rows: number;
  readonly cell: Extent;
}

function spreadOver(area: ScreenRect, panes: readonly Standing[]): readonly Standing[] {
  const grid = roomiestGrid(area, panes);
  return inReadingOrder(panes, grid.columns).map((pane, index) => ({
    id: pane.id,
    bounds: centredIn(cellAt(area, grid, index), pane.bounds),
  }));
}

function roomiestGrid(area: ScreenRect, panes: readonly Standing[]): Grid {
  const landscape = area.width >= area.height;
  const merits = (grid: Grid): readonly number[] => [
    leastKept(grid, panes),
    panes.length - grid.columns * grid.rows,
    landscape ? grid.columns : -grid.columns,
  ];
  return Array.from({ length: panes.length }, (_, index) =>
    gridOf(area, panes.length, index + 1),
  ).reduce((best, grid) => (outranks(merits(grid), merits(best)) ? grid : best));
}

function gridOf(area: ScreenRect, count: number, columnCount: number): Grid {
  const { gap } = outsideMetrics;
  const rowCount = Math.ceil(count / columnCount);
  const share = (room: number, parts: number): number =>
    Math.max(1, Math.floor((room - gap * (parts + 1)) / parts));
  return {
    columns: columnCount,
    rows: rowCount,
    cell: { width: share(area.width, columnCount), height: share(area.height, rowCount) },
  };
}

function leastKept(grid: Grid, panes: readonly Standing[]): number {
  const kept = ({ bounds }: Standing): number =>
    Math.min(1, grid.cell.width / bounds.width) * Math.min(1, grid.cell.height / bounds.height);
  return Math.min(...panes.map(kept));
}

function outranks(one: readonly number[], other: readonly number[]): boolean {
  const differs = one.findIndex((merit, index) => merit !== other[index]);
  return differs >= 0 && (one[differs] ?? 0) > (other[differs] ?? 0);
}

function inReadingOrder(panes: readonly Standing[], perRow: number): readonly Standing[] {
  const across = (pane: Standing): number => centre(pane.bounds).x;
  const down = (pane: Standing): number => centre(pane.bounds).y;
  const downThePage = panes.toSorted((a, b) => down(a) - down(b) || across(a) - across(b));
  return Array.from({ length: Math.ceil(panes.length / perRow) }, (_, row) =>
    downThePage
      .slice(row * perRow, (row + 1) * perRow)
      .toSorted((a, b) => across(a) - across(b) || down(a) - down(b)),
  ).flat();
}

function cellAt(area: ScreenRect, grid: Grid, index: number): ScreenRect {
  const { gap } = outsideMetrics;
  const column = index % grid.columns;
  const row = Math.floor(index / grid.columns);
  return {
    x: area.x + gap + column * (grid.cell.width + gap),
    y: area.y + gap + row * (grid.cell.height + gap),
    ...grid.cell,
  };
}

function centredIn(cell: ScreenRect, pane: ScreenRect): ScreenRect {
  const width = Math.min(pane.width, cell.width);
  const height = Math.min(pane.height, cell.height);
  return {
    x: cell.x + Math.round((cell.width - width) / 2),
    y: cell.y + Math.round((cell.height - height) / 2),
    width,
    height,
  };
}

function areaHolding(desk: Desk, rect: ScreenRect): ScreenRect {
  const at = centre(rect);
  const display = desk.displays.find(({ bounds }) => holdsPoint(bounds, at));
  return display?.workArea ?? desk.workArea;
}

function consoleOn(desk: Desk): ScreenRect {
  const { console: home, workArea } = desk;
  const x = Math.max(workArea.x, home.x);
  const y = Math.max(workArea.y, home.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(right(workArea), right(home)) - x),
    height: Math.max(0, Math.min(bottom(workArea), bottom(home)) - y),
  };
}

function underCursor(cursor: ScreenPoint): ScreenRect {
  return { ...cursor, width: 0, height: 0 };
}

function apart(seat: ScreenRect, other: ScreenRect): boolean {
  const { gap } = outsideMetrics;
  const reach = {
    x: seat.x - gap,
    y: seat.y - gap,
    width: seat.width + 2 * gap,
    height: seat.height + 2 * gap,
  };
  return !overlaps(reach, other);
}

function holds(area: ScreenRect, rect: ScreenRect): boolean {
  return (
    rect.x >= area.x &&
    rect.y >= area.y &&
    right(rect) <= right(area) &&
    bottom(rect) <= bottom(area)
  );
}

function holdsPoint(area: ScreenRect, point: ScreenPoint): boolean {
  return point.x >= area.x && point.x < right(area) && point.y >= area.y && point.y < bottom(area);
}

function keptOn(area: ScreenRect, rect: ScreenRect): ScreenRect {
  return {
    ...rect,
    x: clamp(rect.x, area.x, Math.max(area.x, right(area) - rect.width)),
    y: clamp(rect.y, area.y, Math.max(area.y, bottom(area) - rect.height)),
  };
}

function distinct(rects: readonly ScreenRect[]): ScreenRect[] {
  return rects.filter((rect, index) => rects.findIndex((other) => sameRect(other, rect)) === index);
}

function sameRect(one: ScreenRect, other: ScreenRect): boolean {
  return (
    one.x === other.x &&
    one.y === other.y &&
    one.width === other.width &&
    one.height === other.height
  );
}

function distance(from: ScreenPoint, to: ScreenPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function centre(rect: ScreenRect): ScreenPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function left(rect: ScreenRect): number {
  return rect.x;
}

function top(rect: ScreenRect): number {
  return rect.y;
}

function right(rect: ScreenRect): number {
  return rect.x + rect.width;
}

function bottom(rect: ScreenRect): number {
  return rect.y + rect.height;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
