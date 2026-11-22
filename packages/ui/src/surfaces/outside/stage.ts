import { overlaps } from "@keywork-app/habitat";
import {
  type Seat as LatticeSeat,
  type Stage,
  type StageRoom,
  stageLattice,
} from "@keywork-app/protocol";
import { outsideMetrics } from "../feel/arrange.ts";
import { dealMetrics, drawn, holdsOn, type Share } from "../feel/pattern-deals.ts";
import { canvases, type Ground, roomsBeside, wholeDisplay } from "../feel/pattern-ground.ts";
import { bottomOf, clamp, grownBy, liesWithin, rightOf, spanning } from "../feel/pattern-rects.ts";
import type { Desk, ScreenRect } from "../port.ts";
import { sameRect } from "./grid.ts";

export type { LatticeSeat };

export const namedSeats: Readonly<Record<string, LatticeSeat>> = {
  full: { x: 0, y: 0, w: 12, h: 12 },
  "left-half": { x: 0, y: 0, w: 6, h: 12 },
  "right-half": { x: 6, y: 0, w: 6, h: 12 },
  "top-half": { x: 0, y: 0, w: 12, h: 6 },
  "bottom-half": { x: 0, y: 6, w: 12, h: 6 },
  "left-third": { x: 0, y: 0, w: 4, h: 12 },
  "middle-third": { x: 4, y: 0, w: 4, h: 12 },
  "right-third": { x: 8, y: 0, w: 4, h: 12 },
  "left-two-thirds": { x: 0, y: 0, w: 8, h: 12 },
  "right-two-thirds": { x: 4, y: 0, w: 8, h: 12 },
  "top-left": { x: 0, y: 0, w: 6, h: 6 },
  "top-right": { x: 6, y: 0, w: 6, h: 6 },
  "bottom-left": { x: 0, y: 6, w: 6, h: 6 },
  "bottom-right": { x: 6, y: 6, w: 6, h: 6 },
};

export const roomWords: Readonly<Record<StageRoom, string>> = {
  beside: "beside the console",
  over: "over the console's far side",
  display: "across the whole display",
};

export function shareOnTheStage(seat: LatticeSeat): Share {
  return {
    x: seat.x / stageLattice,
    y: seat.y / stageLattice,
    width: seat.w / stageLattice,
    height: seat.h / stageLattice,
  };
}

export function seatOnTheLattice(room: ScreenRect, bounds: ScreenRect): LatticeSeat {
  const { gap } = outsideMetrics;
  const across = spanOnTheLattice(bounds.x - room.x, bounds.width, room.width + gap);
  const down = spanOnTheLattice(bounds.y - room.y, bounds.height, room.height + gap);
  return { x: across.from, y: down.from, w: across.length, h: down.length };
}

export function stagesHolding(desk: Desk, standing: readonly ScreenRect[] = []): Ground[] {
  const stages = stagesOn(desk);
  const reach = (ground: Ground): ScreenRect => grownBy(ground.room, outsideMetrics.gap);
  const holdsThemAll = (ground: Ground): boolean =>
    standing.every((pane) => liesWithin(reach(ground), pane));
  const first = stages.findIndex(holdsThemAll);
  return first === -1 ? stages.slice(-1) : stages.slice(first);
}

export function stageHolding(desk: Desk, standing: readonly ScreenRect[] = []): Ground {
  return stagesHolding(desk, standing)[0] ?? wholeDisplay(desk);
}

export function stageBeside(desk: Desk): Ground | undefined {
  return roomsBeside(desk).find((ground) => holdsOn(ground.room, roomForFour));
}

export function roomsToDealOn(desk: Desk, standing: readonly ScreenRect[] = []): Ground[] {
  return roomsBeside(desk).flatMap(({ side, room }) =>
    piecesClearOf(room, standing).map((free): Ground => ({ side, room: free })),
  );
}

export function cutBackToClear(
  seat: ScreenRect,
  standing: readonly ScreenRect[],
): ScreenRect | undefined {
  return piecesClearOf(seat, standing).find(holdsACard);
}

export function holdsACard(rect: ScreenRect): boolean {
  const { smallestSeat } = dealMetrics;
  return rect.width >= smallestSeat.width && rect.height >= smallestSeat.height;
}

export function stageFacts(desk: Desk, stage: Ground): Stage {
  const { gap } = outsideMetrics;
  const { smallestSeat, finestCut } = dealMetrics;
  const fitting = (room: number, card: number): number =>
    clamp(Math.floor((room + gap) / (card + gap)), 1, finestCut);
  return {
    room: roomOf(desk, stage),
    cardsAcross: fitting(stage.room.width, smallestSeat.width),
    cardsDown: fitting(stage.room.height, smallestSeat.height),
    consoleMaximised: desk.consoleMaximized,
  };
}

export function roomOf(desk: Desk, stage: Ground): StageRoom {
  if (stage.side !== "over") return "beside";
  return sameRect(stage.room, wholeDisplay(desk).room) ? "display" : "over";
}

export function placeWords(seat: LatticeSeat): string {
  const name = Object.entries(namedSeats).find(([, named]) => sameSeat(named, seat))?.[0];
  const { x, y, w, h } = seat;
  return name ?? `columns ${x} to ${x + w}, rows ${y} to ${y + h}`;
}

export function sameSeat(one: LatticeSeat, other: LatticeSeat): boolean {
  return one.x === other.x && one.y === other.y && one.w === other.w && one.h === other.h;
}

const roomForFour = drawn("four", "ab", "cd");

function stagesOn(desk: Desk): Ground[] {
  const all = canvases(desk);
  const first = all.findIndex((ground) => holdsOn(ground.room, roomForFour));
  return first === -1 ? all.slice(-1) : all.slice(first);
}

function piecesClearOf(room: ScreenRect, standing: readonly ScreenRect[]): ScreenRect[] {
  const { gap } = outsideMetrics;
  const inTheWay = standing.filter((pane) => overlaps(grownBy(pane, gap), room));
  if (inTheWay.length === 0) return [room];
  const held = spanning(
    Math.min(...inTheWay.map((pane) => pane.x)),
    Math.min(...inTheWay.map((pane) => pane.y)),
    Math.max(...inTheWay.map(rightOf)),
    Math.max(...inTheWay.map(bottomOf)),
  );
  return [
    spanning(room.x, room.y, held.x - gap, bottomOf(room)),
    spanning(rightOf(held) + gap, room.y, rightOf(room), bottomOf(room)),
    spanning(room.x, room.y, rightOf(room), held.y - gap),
    spanning(room.x, bottomOf(held) + gap, rightOf(room), bottomOf(room)),
  ]
    .filter((free) => free.width > 0 && free.height > 0)
    .toSorted((one, other) => other.width * other.height - one.width * one.height);
}

interface Span {
  readonly from: number;
  readonly length: number;
}

function spanOnTheLattice(start: number, length: number, pitched: number): Span {
  const { gap } = outsideMetrics;
  const line = (edge: number): number =>
    clamp(Math.round((edge * stageLattice) / pitched), 0, stageLattice);
  const from = Math.min(line(start), stageLattice - 1);
  return { from, length: Math.max(1, line(start + length + gap) - from) };
}
