import type { Extent, Random } from "@keywork-app/habitat";
import type { LifecycleState } from "../../chrome/stamp.ts";
import { type OutsideKind, outsideMetrics, seatBesidePane, type Wanted } from "../feel/arrange.ts";
import { dealsShaped, inOrderOfChoice } from "../feel/arrangements.ts";
import { dealsFor } from "../feel/pattern-catalogue.ts";
import { type Asking, chosenWay } from "../feel/pattern-choice.ts";
import { type Deal, dealMetrics } from "../feel/pattern-deals.ts";
import { firstFound, type Ground, roomsBeside } from "../feel/pattern-ground.ts";
import {
  cardWaysBeside,
  dealWaysOn,
  inTurn,
  type Start,
  tidyWays,
  type Way,
  waysAtTheirSize,
  waysBeside,
} from "../feel/patterns.ts";
import type { Desk, ScreenRect, SurfaceId } from "../port.ts";
import { areaHolding, presetSize, type SizeName, sizeLadder } from "./grid.ts";
import { roomsToDealOn } from "./stage.ts";

export interface Seeking {
  readonly id: SurfaceId;
  readonly kind: OutsideKind;
  readonly measured: Extent | undefined;
  readonly last: ScreenRect | undefined;
  readonly wanted?: SizeName | undefined;
  readonly weight?: number | undefined;
}

export interface Taste extends Asking {
  readonly random: Random;
}

export interface Landing {
  readonly places: readonly ScreenRect[];
  readonly arrives: readonly Start[];
  readonly look: string | undefined;
}

export interface Drilled {
  readonly lead: ScreenRect;
  readonly aside: ScreenRect;
}

export type DealsFor = (count: number) => readonly (readonly Deal[])[];

export interface Troupe {
  readonly desk: Desk;
  readonly arriving: readonly Seeking[];
  readonly standing: readonly ScreenRect[];
  readonly shaped?: DealsFor | undefined;
  readonly atTheSizeWanted?: boolean | undefined;
}

export const steadily: Taste = { asker: "keeper", random: () => 0 };

export const arrivalSizes: readonly SizeName[] = ["card", "reading", "working"];

export const paneWeights = { leads: 4, tieSpread: 0.5 } as const;

export const keepersOwn: Taste = { asker: "keeper", random: () => 0 };

export function restingPlaces(
  desk: Desk,
  arriving: readonly Seeking[],
  standing: readonly ScreenRect[],
  taste: Taste = keepersOwn,
): Landing {
  const kept = arriving.map((pane) => whereItStood(desk, pane));
  const returning = arriving.filter((_, index) => kept[index] !== undefined);
  const seeking = arriving.filter((_, index) => kept[index] === undefined);
  const taken = [...standing, ...kept.flatMap((place) => place ?? [])];
  const way = wayFor(desk, seeking, taken, taste);
  const seatOf = (pane: Seeking): ScreenRect | undefined =>
    way?.seats.find((seat) => seat.id === pane.id)?.bounds;
  return {
    places: arriving.map((pane, index) => kept[index] ?? seatOf(pane) ?? desk.workArea),
    arrives: inTurn([
      ...returning.map((pane) => pane.id),
      ...(way?.arrives ?? []).map((start) => start.id),
    ]),
    look: way?.look,
  };
}

export function troupePlaces(troupe: Troupe, taste: Taste): Landing | undefined {
  const { desk, arriving, standing } = troupe;
  const kept = arriving.map((pane) => whereItStood(desk, pane));
  const returning = arriving.filter((_, index) => kept[index] !== undefined);
  const seeking = arriving.filter((_, index) => kept[index] === undefined);
  const taken = [...standing, ...kept.flatMap((place) => place ?? [])];
  const way = troupeWay(troupe, seeking, taken, taste);
  const seatOf = (pane: Seeking): ScreenRect | undefined =>
    way?.seats.find((seat) => seat.id === pane.id)?.bounds;
  const places = arriving.flatMap((pane, index) => kept[index] ?? seatOf(pane) ?? []);
  if (places.length < arriving.length) return undefined;
  return {
    places,
    arrives: inTurn([
      ...returning.map((pane) => pane.id),
      ...(way?.arrives ?? []).map((start) => start.id),
    ]),
    look: way?.look,
  };
}

export function besideItsParent(
  desk: Desk,
  parent: ScreenRect,
  kind: OutsideKind,
  standing: readonly ScreenRect[],
): ScreenRect | undefined {
  const area = areaHolding(desk, parent);
  const wanted = arrivalSizes.indexOf(sizeWanted(kind, undefined, area));
  const largestFirst = arrivalSizes
    .slice(0, wanted + 1)
    .toReversed()
    .map((name) => presetSize(name, area, kind));
  const taken = [desk.console, ...standing];
  return largestFirst.flatMap((size) => seatBesidePane(desk, parent, size, taken) ?? [])[0];
}

export function arisenBeside(
  desk: Desk,
  parent: ScreenRect,
  kind: OutsideKind,
  standing: readonly ScreenRect[],
): ScreenRect | undefined {
  const area = areaHolding(desk, parent);
  const wanted = arrivalSizes.indexOf(sizeWanted(kind, undefined, area));
  const largestFirst = arrivalSizes
    .slice(0, wanted + 1)
    .toReversed()
    .map((name) => presetSize(name, area, kind));
  return seatedBeside(desk, parent, largestFirst, standing);
}

export function drilledInto(
  desk: Desk,
  parent: ScreenRect,
  kind: OutsideKind,
  standing: readonly ScreenRect[],
): Drilled | undefined {
  const named = sizeLadder(areaHolding(desk, parent), kind).map((preset) => preset.size);
  const shorter = named.filter((size) => size.height < parent.height).toReversed();
  const aside = seatedBeside(
    desk,
    parent,
    shorter.length > 0 ? shorter : named.slice(0, 1),
    standing,
  );
  return aside === undefined ? undefined : { lead: parent, aside };
}

export function sizeFor(kind: OutsideKind, measured: Extent | undefined, area: ScreenRect): Extent {
  return presetSize(sizeWanted(kind, measured, area), area, kind);
}

export function sizeWanted(
  kind: OutsideKind,
  measured: Extent | undefined,
  area: ScreenRect,
): SizeName {
  if (measured === undefined) return workingPanes.has(kind) ? "working" : "reading";
  const holds = (name: SizeName): boolean => presetSize(name, area, kind).height >= measured.height;
  return arrivalSizes.find(holds) ?? "working";
}

export function weightOf(state: LifecycleState, leads: boolean): number {
  return weightWhile[state] + (leads ? paneWeights.leads : 0);
}

export function standsOnADisplay(desk: Desk, rect: ScreenRect): boolean {
  const strip: ScreenRect = { ...rect, height: outsideMetrics.strip };
  return desk.displays.some(({ workArea }) => {
    const reach = overlapOf(strip, workArea);
    return reach.width >= outsideMetrics.strip && reach.height >= outsideMetrics.strip / 2;
  });
}

export function fillsADisplay(desk: Desk, rect: ScreenRect): boolean {
  return desk.displays.some(({ workArea }) => {
    const reach = overlapOf(rect, workArea);
    return reach.width >= workArea.width && reach.height >= workArea.height;
  });
}

function seatedBeside(
  desk: Desk,
  parent: ScreenRect,
  sizes: readonly Extent[],
  standing: readonly ScreenRect[],
): ScreenRect | undefined {
  const clearOf = (taken: readonly ScreenRect[]): ScreenRect | undefined =>
    sizes.flatMap((size) => seatBesidePane(desk, parent, size, taken) ?? [])[0];
  return clearOf([desk.console, ...standing]) ?? clearOf(standing);
}

const roomyRungs = arrivalSizes.length - 1;

const workingPanes: ReadonlySet<OutsideKind> = new Set<OutsideKind>([
  "conversation",
  "file",
  "diff",
]);

const weightWhile: Record<LifecycleState, number> = {
  "needs-you": 3,
  failed: 3,
  "finished-unseen": 2,
  working: 1,
  idle: 0,
};

function wayFor(
  desk: Desk,
  seeking: readonly Seeking[],
  taken: readonly ScreenRect[],
  taste: Taste,
): Way | undefined {
  const ladder = ladderFor(desk.workArea, seeking, taste);
  const roomy = aLonePaneToWorkIn(seeking, desk.workArea) ? ladder.slice(0, roomyRungs) : [];
  const atItsSize =
    firstFound(roomy, (rung) => {
      const ways = waysAtTheirSize({ desk, ladder: [rung], standing: taken });
      return ways.length > 0 ? ways : undefined;
    }) ?? [];
  const ways = atItsSize.length > 0 ? atItsSize : tidyWays({ desk, ladder, standing: taken });
  return chosenWay(ways, taste, taste.random);
}

function aLonePaneToWorkIn(seeking: readonly Seeking[], area: ScreenRect): boolean {
  const [pane] = seeking;
  if (pane === undefined || seeking.length > 1 || !workingPanes.has(pane.kind)) return false;
  return (pane.wanted ?? sizeWanted(pane.kind, pane.measured, area)) === "working";
}

function troupeWay(
  troupe: Troupe,
  seeking: readonly Seeking[],
  taken: readonly ScreenRect[],
  taste: Taste,
): Way | undefined {
  const { desk } = troupe;
  const sought: Sought = {
    desk,
    clear: roomsToDealOn(desk, taken),
    ladder: ladderFor(desk.workArea, seeking, taste),
    shapes: shapesFor(troupe, seeking),
    standing: taken,
    led: isLed(seeking),
  };
  const ways = troupe.atTheSizeWanted ? waysAsWanted(sought) : waysThatHold(sought);
  return chosenWay(ways, taste, taste.random);
}

interface Sought {
  readonly desk: Desk;
  readonly clear: readonly Ground[];
  readonly ladder: readonly (readonly Wanted[])[];
  readonly shapes: readonly (readonly Deal[])[];
  readonly standing: readonly ScreenRect[];
  readonly led: boolean;
}

function waysThatHold({ desk, clear, ladder, shapes, standing, led }: Sought): readonly Way[] {
  const incoming = { desk, arriving: ladder[0] ?? [], standing, led };
  const shaped = firstFound(shapes, (deals) => {
    const ways = dealWaysOn(clear, deals, incoming);
    return ways.length > 0 ? ways : undefined;
  });
  return shaped ?? waysBeside({ desk, ladder, standing, led }, roomsBeside(desk), clear);
}

function waysAsWanted({ desk, clear, ladder, shapes, standing, led }: Sought): readonly Way[] {
  const wanted = ladder[0] ?? [];
  const incoming = { desk, arriving: wanted, standing, led };
  const [asked] = shapes;
  if (asked !== undefined) return dealWaysOn(clear, asked, incoming);
  if (wanted.length < dealMetrics.fewest) {
    return cardWaysBeside({ desk, ladder: [wanted], standing }, roomsBeside(desk));
  }
  const eachDeal = dealsFor(wanted.length).map((deal) => dealWaysOn(clear, [deal], incoming));
  return eachDeal.some((ways) => ways.length === 0) ? [] : eachDeal.flat();
}

function shapesFor(troupe: Troupe, seeking: readonly Seeking[]): readonly (readonly Deal[])[] {
  const count = seeking.length;
  if (count === 0) return [];
  if (troupe.shaped !== undefined) return troupe.shaped(count);
  if (count < 2 || !isLed(seeking)) return [];
  return [...inOrderOfChoice("lead-and-cards", count), dealsShaped("lead-and-stack", count)].filter(
    (deals) => deals.length > 0,
  );
}

function isLed(seeking: readonly Seeking[]): boolean {
  return seeking.some((pane) => (pane.weight ?? 0) >= paneWeights.leads);
}

function ladderFor(area: ScreenRect, seeking: readonly Seeking[], taste: Taste): Wanted[][] {
  const wanted = seeking.map((pane) =>
    arrivalSizes.indexOf(pane.wanted ?? sizeWanted(pane.kind, pane.measured, area)),
  );
  const weights = seeking.map((pane) => (pane.weight ?? 0) + tieBreak(taste));
  const largest = Math.max(0, ...wanted);
  return Array.from({ length: largest + 1 }, (_, down) =>
    seeking.map((pane, index) => {
      const rung = Math.min(wanted[index] ?? 0, largest - down);
      const size = presetSize(arrivalSizes[rung] ?? "card", area, pane.kind);
      return { id: pane.id, size, weight: weights[index] };
    }),
  );
}

function tieBreak(taste: Taste): number {
  return taste.asker === "creature" ? taste.random() * paneWeights.tieSpread : 0;
}

function whereItStood(desk: Desk, pane: Seeking): ScreenRect | undefined {
  return pane.last !== undefined && standsOnADisplay(desk, pane.last) ? pane.last : undefined;
}

function overlapOf(one: ScreenRect, other: ScreenRect): Extent {
  return {
    width: Math.min(one.x + one.width, other.x + other.width) - Math.max(one.x, other.x),
    height: Math.min(one.y + one.height, other.y + other.height) - Math.max(one.y, other.y),
  };
}
