import type { Extent } from "@keywork-app/habitat";
import type { Direction, Rect } from "../../layout/index.ts";
import type { ScreenRect } from "../port.ts";

export const sidewaysCost = 2;

export function nearestAcross<Id>(
  from: ScreenRect,
  candidates: Iterable<readonly [Id, ScreenRect]>,
  direction: Direction,
): Id | undefined {
  let best: { id: Id; reach: Reach } | undefined;
  for (const [id, rect] of candidates) {
    if (!liesToward(from, rect, direction)) continue;
    const reach = reachOf(from, rect, direction);
    if (best === undefined || nearer(reach, best.reach)) best = { id, reach };
  }
  return best?.id;
}

export function pageOnDesk(console: ScreenRect, viewport: Extent, onPage: Rect): ScreenRect {
  const scale = viewport.width > 0 ? console.width / viewport.width : 1;
  const top = console.y + console.height - viewport.height * scale;
  return {
    x: console.x + onPage.x * scale,
    y: top + onPage.y * scale,
    width: onPage.width * scale,
    height: onPage.height * scale,
  };
}

interface Span {
  readonly start: number;
  readonly end: number;
}

interface Reach {
  readonly travel: number;
  readonly apart: number;
}

function liesToward(from: ScreenRect, rect: ScreenRect, direction: Direction): boolean {
  const ahead = middle(along(rect, direction)) - middle(along(from, direction));
  return forward(direction) ? ahead > 0 : ahead < 0;
}

function reachOf(from: ScreenRect, rect: ScreenRect, direction: Direction): Reach {
  const ahead = gapBetween(along(from, direction), along(rect, direction));
  const sideways = gapBetween(beside(from, direction), beside(rect, direction));
  return { travel: ahead + sidewaysCost * sideways, apart: centresApart(from, rect) };
}

function nearer(one: Reach, other: Reach): boolean {
  return one.travel < other.travel || (one.travel === other.travel && one.apart < other.apart);
}

function along(rect: ScreenRect, direction: Direction): Span {
  return horizontal(direction) ? acrossSpan(rect) : downSpan(rect);
}

function beside(rect: ScreenRect, direction: Direction): Span {
  return horizontal(direction) ? downSpan(rect) : acrossSpan(rect);
}

function acrossSpan(rect: ScreenRect): Span {
  return { start: rect.x, end: rect.x + rect.width };
}

function downSpan(rect: ScreenRect): Span {
  return { start: rect.y, end: rect.y + rect.height };
}

function gapBetween(one: Span, other: Span): number {
  return Math.max(0, one.start - other.end, other.start - one.end);
}

function middle(span: Span): number {
  return (span.start + span.end) / 2;
}

function centresApart(one: ScreenRect, other: ScreenRect): number {
  return Math.hypot(
    middle(acrossSpan(one)) - middle(acrossSpan(other)),
    middle(downSpan(one)) - middle(downSpan(other)),
  );
}

function horizontal(direction: Direction): boolean {
  return direction === "left" || direction === "right";
}

function forward(direction: Direction): boolean {
  return direction === "right" || direction === "down";
}
