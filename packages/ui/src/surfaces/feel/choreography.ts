import type { MotionPrefs } from "@keywork-app/habitat";
import type {
  Desk,
  Glide,
  ScreenRect,
  SurfaceId,
  SurfaceMove,
  SurfaceOrigin,
  SurfaceShow,
} from "../port.ts";
import {
  ariseStart,
  emergeStart,
  recallEnd,
  type Standing,
  spread,
  travelBetween,
} from "./arrange.ts";
import { briskly, type Pacing, pacedMs, pacedStarts } from "./pace.ts";

export type MotionStyle = "glide" | "fade" | "still";

export type Cue =
  | { readonly atMs: number; readonly kind: "show"; readonly show: SurfaceShow }
  | { readonly atMs: number; readonly kind: "glide"; readonly glide: Glide }
  | { readonly atMs: number; readonly kind: "hide"; readonly id: SurfaceId };

export interface Plan {
  readonly style: MotionStyle;
  readonly cues: readonly Cue[];
  readonly endsAtMs: number;
}

export interface Start {
  readonly id: SurfaceId;
  readonly atMs: number;
}

export interface DrillIn {
  readonly parent: Standing;
  readonly aside: ScreenRect;
  readonly arrival: SurfaceShow;
}

export interface DrillOut {
  readonly child: Standing;
  readonly parent: Standing;
  readonly lead: ScreenRect;
}

export const arrivalTiming = { maxGliding: 6 } as const;

export const riseTiming = { steps: 8, stepMs: 60 } as const;

// The desktop refuses a pane window smaller than this (its surface minimum), and a window the
// desktop resized on its own reads as one the keeper moved, so no step may go below it.
export const windowFloor = { width: 200, height: 120 } as const;

export type Places = ReadonlyMap<SurfaceId, ScreenRect>;

export const noPlaces: Places = new Map();

export const glideTiming = { shortestMs: 140, longestMs: 200, nearPx: 240, farPx: 1200 } as const;

export const typingHold = { quietMs: 400, longestMs: 2000 } as const;

export const gathering = { quietMs: 16, longestMs: 48 } as const;

export const regrouping = { quietMs: 240, longestMs: 720 } as const;

export function motionStyle(prefs: MotionPrefs): MotionStyle {
  if (prefs.tier === "hidden") return "still";
  return prefs.reducedMotion ? "fade" : "glide";
}

export function arrivalPlan(
  desk: Desk,
  arrivals: readonly SurfaceShow[],
  starts: readonly Start[],
  prefs: MotionPrefs,
  pacing: Pacing = briskly,
  places: Places = noPlaces,
): Plan {
  const style = motionStyle(prefs);
  const pace = paceUnder(style, pacing);
  const shows = arrivals.map(leavingFocusWithTheKeeper);
  const entrances = inTurn(turnsUnder(style, starts, pace), shows, (show) => show.id);
  return planOf(
    style,
    entrances.flatMap(({ item: show, atMs }) => {
      if (style !== "glide") return [shownInPlace(show, atMs)];
      const place = places.get(show.id);
      return place === undefined
        ? flownFrom(emergeStart(desk, show.bounds), show, atMs, pace)
        : risenFrom(place, show, atMs, pace);
    }),
  );
}

export function recallPlan(
  desk: Desk,
  outside: readonly Standing[],
  starts: readonly Start[],
  prefs: MotionPrefs,
  pacing: Pacing = briskly,
  places: Places = noPlaces,
): Plan {
  const style = motionStyle(prefs);
  const pace = paceUnder(style, pacing);
  const exits = inTurn(turnsUnder(style, starts, pace), outside, (pane) => pane.id);
  return planOf(
    style,
    exits.flatMap(({ item: pane, atMs }) => {
      if (style !== "glide") return [hidden(pane.id, atMs)];
      const place = places.get(pane.id);
      return place === undefined
        ? flownInto(recallEnd(desk, pane.bounds), pane, atMs, pace)
        : steppedInto(place, pane, atMs, pace);
    }),
  );
}

export function steppedBetween(from: ScreenRect, to: ScreenRect): ScreenRect[] {
  const { steps } = riseTiming;
  const start = atLeastAWindow(from);
  return Array.from({ length: steps }, (_, step) => {
    const done = 1 - (1 - (step + 1) / steps) ** 2;
    const at = (begin: number, end: number): number => Math.round(begin + (end - begin) * done);
    return atLeastAWindow({
      x: at(start.x, to.x),
      y: at(start.y, to.y),
      width: at(start.width, to.width),
      height: at(start.height, to.height),
    });
  });
}

export function atLeastAWindow(rect: ScreenRect): ScreenRect {
  const width = Math.max(windowFloor.width, Math.round(rect.width));
  const height = Math.max(windowFloor.height, Math.round(rect.height));
  return {
    x: Math.round(rect.x + (rect.width - width) / 2),
    y: Math.round(rect.y + (rect.height - height) / 2),
    width,
    height,
  };
}

export function arisePlan(
  desk: Desk,
  parent: ScreenRect,
  arrival: SurfaceShow,
  prefs: MotionPrefs,
  pacing: Pacing = briskly,
): Plan {
  const style = motionStyle(prefs);
  const show = leavingFocusWithTheKeeper(arrival);
  return planOf(
    style,
    style === "glide"
      ? flownFrom(ariseStart(desk, parent, show.bounds), show, 0, paceUnder(style, pacing))
      : [shownInPlace(show, 0)],
  );
}

export function retreatPlan(
  desk: Desk,
  into: ScreenRect,
  leaving: Standing,
  prefs: MotionPrefs,
  pacing: Pacing = briskly,
): Plan {
  const style = motionStyle(prefs);
  return planOf(
    style,
    style === "glide"
      ? flownInto(ariseStart(desk, into, leaving.bounds), leaving, 0, paceUnder(style, pacing))
      : [hidden(leaving.id, 0)],
  );
}

export function drillInPlan(
  desk: Desk,
  drill: DrillIn,
  starts: readonly Start[],
  prefs: MotionPrefs,
  pacing: Pacing = briskly,
): Plan {
  const style = motionStyle(prefs);
  const pace = paceUnder(style, pacing);
  const { parent, aside } = drill;
  const arrival = leavingFocusWithTheKeeper(drill.arrival);
  const turnOf = turnsOf(style, turnsUnder(style, starts, pace));
  const leads =
    style === "glide"
      ? flownFrom(ariseStart(desk, aside, arrival.bounds), arrival, turnOf(arrival.id), pace)
      : [shownInPlace(arrival, turnOf(arrival.id))];
  return planOf(style, [glidden(style, parent, aside, turnOf(parent.id), pace), ...leads]);
}

export function drillOutPlan(
  desk: Desk,
  drill: DrillOut,
  starts: readonly Start[],
  prefs: MotionPrefs,
  pacing: Pacing = briskly,
): Plan {
  const style = motionStyle(prefs);
  const pace = paceUnder(style, pacing);
  const { child, parent, lead } = drill;
  const turnOf = turnsOf(style, turnsUnder(style, starts, pace));
  const withdrawn =
    style === "glide"
      ? flownInto(ariseStart(desk, parent.bounds, child.bounds), child, turnOf(child.id), pace)
      : [hidden(child.id, turnOf(child.id))];
  return planOf(style, [...withdrawn, glidden(style, parent, lead, turnOf(parent.id), pace)]);
}

export function spreadPlan(desk: Desk, outside: readonly Standing[], prefs: MotionPrefs): Plan {
  return movePlan(outside, spread(desk, outside), prefs);
}

export function movePlan(
  from: readonly Standing[],
  to: readonly SurfaceMove[],
  prefs: MotionPrefs,
): Plan {
  const style = motionStyle(prefs);
  const moves = to.filter((move) => !restsAt(from, move));
  if (moves.length === 0) return planOf(style, []);
  const durationMs = style === "glide" ? longestGlideMs(from, moves) : 0;
  return planOf(style, [{ atMs: 0, kind: "glide", glide: { moves, durationMs } }]);
}

export function dealPlan(
  from: readonly Standing[],
  to: readonly SurfaceMove[],
  starts: readonly Start[],
  prefs: MotionPrefs,
  pacing: Pacing = briskly,
): Plan {
  const style = motionStyle(prefs);
  if (style === "still") return movePlan(from, to, prefs);
  const pace = paceUnder(style, pacing);
  const moves = to.filter((move) => !restsAt(from, move));
  const durationOf = (move: SurfaceMove): number =>
    style === "glide" ? pacedMs(longestGlideMs(from, [move]), pace) : 0;
  return planOf(
    style,
    inTurn(turnsUnder(style, starts, pace), moves, (move) => move.id).map(
      ({ item: move, atMs }): Cue => ({
        atMs,
        kind: "glide",
        glide: { moves: [move], durationMs: durationOf(move) },
      }),
    ),
  );
}

export function glideMs(travelPx: number): number {
  const { shortestMs, longestMs, nearPx, farPx } = glideTiming;
  const far = Math.min(1, Math.max(0, (travelPx - nearPx) / (farPx - nearPx)));
  return Math.round(shortestMs + (longestMs - shortestMs) * far);
}

export interface Arriving {
  readonly origin: SurfaceOrigin;
}

export interface Held<Arrival> {
  readonly arrival: Arrival;
  readonly since: number;
}

export interface Hold<Arrival> {
  readonly held: readonly Held<Arrival>[];
  readonly typedAt: number | undefined;
}

export interface Released<Arrival> {
  readonly hold: Hold<Arrival>;
  readonly release: readonly Arrival[];
}

export function nothingHeld<Arrival>(): Hold<Arrival> {
  return { held: [], typedAt: undefined };
}

export function keeperTyped<Arrival>(hold: Hold<Arrival>, at: number): Hold<Arrival> {
  return { ...hold, typedAt: at };
}

export function offered<Arrival extends Arriving>(
  hold: Hold<Arrival>,
  arrival: Arrival,
  at: number,
): Released<Arrival> {
  if (arrival.origin === "keeper") return { hold, release: [arrival] };
  return releasedBy({ ...hold, held: [...hold.held, { arrival, since: at }] }, at);
}

export function releasedBy<Arrival>(hold: Hold<Arrival>, at: number): Released<Arrival> {
  const due = nextReleaseAt(hold);
  if (due === undefined || at < due) return { hold, release: [] };
  return { hold: { ...hold, held: [] }, release: hold.held.map((held) => held.arrival) };
}

export function nextReleaseAt<Arrival>(hold: Hold<Arrival>): number | undefined {
  const oldest = hold.held[0];
  if (oldest === undefined) return undefined;
  if (hold.typedAt === undefined) return oldest.since;
  return Math.min(hold.typedAt + typingHold.quietMs, oldest.since + typingHold.longestMs);
}

export function gatheredBy(first: number, latest: number): number {
  return Math.min(latest + gathering.quietMs, first + gathering.longestMs);
}

export function regroupedBy(first: number, latest: number): number {
  return Math.min(latest + regrouping.quietMs, first + regrouping.longestMs);
}

interface Turn<Item> {
  readonly item: Item;
  readonly atMs: number;
}

function inTurn<Item>(
  starts: readonly Start[],
  items: readonly Item[],
  idOf: (item: Item) => SurfaceId,
): Turn<Item>[] {
  const startOf = (item: Item): number =>
    starts.find((start) => start.id === idOf(item))?.atMs ?? 0;
  return items
    .map((item) => ({ item, atMs: startOf(item) }))
    .toSorted((one, other) => one.atMs - other.atMs);
}

function turnsOf(style: MotionStyle, starts: readonly Start[]): (id: SurfaceId) => number {
  return (id) => (style === "still" ? 0 : (starts.find((start) => start.id === id)?.atMs ?? 0));
}

function paceUnder(style: MotionStyle, pacing: Pacing): Pacing {
  return style === "glide" ? pacing : briskly;
}

function turnsUnder(style: MotionStyle, starts: readonly Start[], pace: Pacing): readonly Start[] {
  return style === "still" ? [] : pacedStarts(starts, pace);
}

function flownFrom(from: ScreenRect, show: SurfaceShow, atMs: number, pace: Pacing): Cue[] {
  const durationMs = pacedMs(glideMs(travelBetween(from, show.bounds)), pace);
  const moves = [{ id: show.id, bounds: show.bounds }];
  return [
    { atMs, kind: "show", show: { ...show, bounds: from } },
    { atMs, kind: "glide", glide: { moves, durationMs } },
  ];
}

function flownInto(home: ScreenRect, pane: Standing, atMs: number, pace: Pacing): Cue[] {
  const durationMs = pacedMs(glideMs(travelBetween(pane.bounds, home)), pace);
  const moves = [{ id: pane.id, bounds: home }];
  return [
    { atMs, kind: "glide", glide: { moves, durationMs } },
    hidden(pane.id, atMs + durationMs),
  ];
}

function risenFrom(place: ScreenRect, show: SurfaceShow, atMs: number, pace: Pacing): Cue[] {
  const stepMs = pacedMs(riseTiming.stepMs, pace);
  return [
    { atMs, kind: "show", show: { ...show, bounds: atLeastAWindow(place) } },
    ...steppedBetween(place, show.bounds).map((bounds, step) =>
      jumped(show.id, bounds, atMs + (step + 1) * stepMs),
    ),
  ];
}

function steppedInto(place: ScreenRect, pane: Standing, atMs: number, pace: Pacing): Cue[] {
  const stepMs = pacedMs(riseTiming.stepMs, pace);
  const steps = steppedBetween(pane.bounds, place);
  return [
    ...steps.map((bounds, step) => jumped(pane.id, bounds, atMs + step * stepMs)),
    hidden(pane.id, atMs + steps.length * stepMs),
  ];
}

function jumped(id: SurfaceId, bounds: ScreenRect, atMs: number): Cue {
  return { atMs, kind: "glide", glide: { moves: [{ id, bounds }], durationMs: 0 } };
}

function glidden(
  style: MotionStyle,
  pane: Standing,
  to: ScreenRect,
  atMs: number,
  pace: Pacing,
): Cue {
  const durationMs = style === "glide" ? pacedMs(glideMs(travelBetween(pane.bounds, to)), pace) : 0;
  return { atMs, kind: "glide", glide: { moves: [{ id: pane.id, bounds: to }], durationMs } };
}

function shownInPlace(show: SurfaceShow, atMs: number): Cue {
  return { atMs, kind: "show", show };
}

function hidden(id: SurfaceId, atMs: number): Cue {
  return { atMs, kind: "hide", id };
}

function leavingFocusWithTheKeeper(show: SurfaceShow): SurfaceShow {
  return show.origin === "creature" && show.focus ? { ...show, focus: false } : show;
}

function longestGlideMs(from: readonly Standing[], moves: readonly SurfaceMove[]): number {
  const travels = moves.map((move) => {
    const current = from.find((pane) => pane.id === move.id);
    return current === undefined ? 0 : travelBetween(current.bounds, move.bounds);
  });
  return glideMs(Math.max(0, ...travels));
}

function restsAt(from: readonly Standing[], move: SurfaceMove): boolean {
  const current = from.find((pane) => pane.id === move.id)?.bounds;
  return (
    current !== undefined &&
    current.x === move.bounds.x &&
    current.y === move.bounds.y &&
    current.width === move.bounds.width &&
    current.height === move.bounds.height
  );
}

function planOf(style: MotionStyle, cues: readonly Cue[]): Plan {
  const endOf = (cue: Cue): number =>
    cue.kind === "glide" ? cue.atMs + cue.glide.durationMs : cue.atMs;
  return {
    style,
    cues: cues.toSorted((one, other) => one.atMs - other.atMs),
    endsAtMs: Math.max(0, ...cues.map(endOf)),
  };
}
