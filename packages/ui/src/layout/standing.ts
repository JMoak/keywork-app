import { type Arrangement, panesOf, without } from "./arrangement.ts";
import type { Direction, Rect, Screen } from "./geometry.ts";
import { holds } from "./scene.ts";
import { clamp, minPaneSize, type PaneId } from "./tree.ts";

export interface UnitRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const floatStep = 0.05;
export const floatShareBounds = { min: 0.2, max: 1 } as const;
export const floatLiftShare = { width: 0.5, height: 0.6 } as const;

export function tuckedFor(
  arrangement: Arrangement,
  standing: readonly PaneId[],
  screen: Screen,
): PaneId[] {
  if (holds(arrangement, screen)) return [];
  const tucked = tuckedUntilItHolds(arrangement, standing, screen);
  return returnedWhereRoomAllows(arrangement, tucked, screen);
}

export function floatRectOn(screen: Screen, unit: UnitRect): Rect {
  const width = spanOn(screen.width, unit.width, minPaneSize.width);
  const height = spanOn(screen.height, unit.height, minPaneSize.height);
  return {
    x: clamp(Math.round(unit.x * screen.width), 0, screen.width - width),
    y: clamp(Math.round(unit.y * screen.height), 0, screen.height - height),
    width,
    height,
  };
}

export function unitRectOn(screen: Screen, rect: Rect): UnitRect {
  const width = share(rect.width / screen.width);
  const height = share(rect.height / screen.height);
  return {
    x: thousandth(clamp(rect.x / screen.width, 0, 1 - width)),
    y: thousandth(clamp(rect.y / screen.height, 0, 1 - height)),
    width,
    height,
  };
}

export function liftedInPlace(seat: Rect | undefined, screen: Screen): UnitRect {
  const from = seat ?? { x: 0, y: 0, width: screen.width, height: screen.height };
  const width = Math.min(from.width, Math.round(screen.width * floatLiftShare.width));
  const height = Math.min(from.height, Math.round(screen.height * floatLiftShare.height));
  return unitRectOn(screen, {
    x: from.x + Math.round((from.width - width) / 2),
    y: from.y + Math.round((from.height - height) / 2),
    width,
    height,
  });
}

export function nudged(unit: UnitRect, direction: Direction): UnitRect {
  const step = direction === "left" || direction === "up" ? -floatStep : floatStep;
  return direction === "left" || direction === "right"
    ? { ...unit, x: thousandth(clamp(unit.x + step, 0, 1 - unit.width)) }
    : { ...unit, y: thousandth(clamp(unit.y + step, 0, 1 - unit.height)) };
}

export function scaled(unit: UnitRect, delta: number): UnitRect {
  const width = share(unit.width + delta);
  const height = share(unit.height + delta);
  return {
    x: thousandth(clamp(unit.x - (width - unit.width) / 2, 0, 1 - width)),
    y: thousandth(clamp(unit.y - (height - unit.height) / 2, 0, 1 - height)),
    width,
    height,
  };
}

export function sameUnitRect(one: UnitRect, other: UnitRect): boolean {
  return (
    one.x === other.x &&
    one.y === other.y &&
    one.width === other.width &&
    one.height === other.height
  );
}

function tuckedUntilItHolds(
  arrangement: Arrangement,
  standing: readonly PaneId[],
  screen: Screen,
): PaneId[] {
  const seated = new Set(panesOf(arrangement));
  const lowestFirst = standing.filter((id) => seated.has(id)).reverse();
  const tucked: PaneId[] = [];
  for (const id of lowestFirst.slice(0, -1)) {
    tucked.push(id);
    if (holds(leaving(arrangement, tucked), screen)) break;
  }
  return tucked;
}

function returnedWhereRoomAllows(
  arrangement: Arrangement,
  tucked: readonly PaneId[],
  screen: Screen,
): PaneId[] {
  let waiting = [...tucked];
  for (const id of [...tucked].reverse()) {
    const fewer = waiting.filter((other) => other !== id);
    if (holds(leaving(arrangement, fewer), screen)) waiting = fewer;
  }
  return waiting;
}

function leaving(arrangement: Arrangement, gone: readonly PaneId[]): Arrangement {
  return without(arrangement, (id) => gone.includes(id));
}

function spanOn(room: number, wanted: number, floor: number): number {
  return clamp(Math.round(wanted * room), Math.min(floor, room), room);
}

function share(value: number): number {
  return thousandth(clamp(value, floatShareBounds.min, floatShareBounds.max));
}

function thousandth(value: number): number {
  return Math.round(value * 1000) / 1000;
}
