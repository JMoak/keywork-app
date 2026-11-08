import {
  byDepth,
  defaultHub,
  foldedOf,
  type MotionPrefs,
  type Placement,
  placeYard,
  rankOf,
  stillShown,
  type YardSetting,
  yardIds,
  yardMetrics,
} from "@keywork-app/habitat";
import type { Rung } from "@keywork-app/protocol";
import type { Rect } from "../layout/index.ts";

export interface YardLayoutInput {
  readonly viewport: Rect;
  readonly settings: readonly YardSetting[];
  readonly railWanted: boolean;
  readonly prefs: MotionPrefs;
}

export interface YardLayout {
  readonly hub: Rect;
  readonly rail: RailLayout | undefined;
  readonly satellites: readonly Placement[];
  readonly selectable: readonly YardSetting[];
}

export interface RailLayout {
  readonly region: Rect;
  readonly head: Rect;
  readonly cards: readonly Placement[];
  readonly fold: Rect | undefined;
  readonly folded: number;
}

export function yardLayout(input: YardLayoutInput): YardLayout {
  const ladder = input.settings.filter(onTheLadder).toSorted(byDepth);
  const hub = hubFor(input.viewport, ladder, input.railWanted);
  const placements = placeYard({
    viewport: input.viewport,
    hub,
    settings: ladder,
    prefs: input.prefs,
  });
  const byId = new Map(ladder.map((setting) => [setting.id, setting]));
  const satellites = placements.filter(
    (placement) => byId.has(placement.id) && reaches(placement.rung, "unfold"),
  );
  const cards = placements.filter(
    (placement) => byId.has(placement.id) && placement.rung === "card",
  );
  const placed = [...satellites, ...cards].flatMap((placement) => byId.get(placement.id) ?? []);
  return {
    hub: placements.find((placement) => placement.id === yardIds.hub)?.rect ?? hub,
    rail: railOf(placements, cards, foldedOf(placements, ladder).length, hub, input.railWanted),
    satellites,
    selectable: placed,
  };
}

export function reaches(rung: Rung, floor: Rung): boolean {
  return rankOf(rung) >= rankOf(floor);
}

export function onTheLadder(setting: YardSetting): boolean {
  return stillShown(setting) && reaches(setting.shown, "card");
}

function hubFor(viewport: Rect, ladder: readonly YardSetting[], railWanted: boolean): Rect {
  if (ladder.some((setting) => reaches(setting.shown, "unfold"))) return defaultHub(viewport);
  if (ladder.length > 0 || railWanted) return besideTheRail(viewport);
  return viewport;
}

function besideTheRail(viewport: Rect): Rect {
  const { margin, gap, rail } = yardMetrics;
  return { ...viewport, width: Math.max(0, viewport.width - margin - rail.width - gap) };
}

function railOf(
  placements: readonly Placement[],
  cards: readonly Placement[],
  folded: number,
  hub: Rect,
  railWanted: boolean,
): RailLayout | undefined {
  const head = placements.find((placement) => placement.id === yardIds.card)?.rect;
  const fold = placements.find((placement) => placement.id === yardIds.fold)?.rect;
  if (head === undefined) return railWanted ? emptyRailBeside(hub) : undefined;
  const parts = [head, ...cards.map((card) => card.rect), ...(fold === undefined ? [] : [fold])];
  return { region: boundsOf(parts), head, cards, fold, folded };
}

function emptyRailBeside(hub: Rect): RailLayout {
  const { gap, rail } = yardMetrics;
  const head = { x: hub.x + hub.width + gap, y: hub.y, width: rail.width, height: rail.head };
  return { region: head, head, cards: [], fold: undefined, folded: 0 };
}

function boundsOf(rects: readonly Rect[]): Rect {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
