import type { Setting } from "@keywork-app/protocol";
import { parseTs } from "../clock/clock.ts";
import { ancestry, descendantsOf, lineageOf, plotCardId, plotSeedOf } from "./lineage.ts";
import {
  byId,
  rankOf,
  stillShown,
  type TrailMark,
  type YardSetting,
  type YardState,
} from "./types.ts";

export interface PlotCard {
  readonly id: string;
  readonly seed: string;
  readonly members: readonly YardSetting[];
  readonly depth: number;
  readonly at: string;
}

export function plotIdOf(yard: Pick<YardState, "settings" | "ancestors">, id: string): string {
  return plotCardId(ancestry(lineageOf(yard), id).at(-1) ?? id);
}

export function foldPlot(yard: YardState, id: string): YardState {
  return foldedWithin(yard, id).yard;
}

export function hasLiveDescendants(yard: YardState, id: string): boolean {
  return descendantsOf(lineageOf(yard), id).some(
    (step) => step !== id && yard.settings[step] !== undefined,
  );
}

export function focusWithin(yard: YardState, id: string): boolean {
  const inside = yard.visit?.id;
  return inside !== undefined && descendantsOf(lineageOf(yard), id).includes(inside);
}

export function joinedFold(yard: YardState, setting: Pick<Setting, "from">): string | undefined {
  const { from } = setting;
  if (from === null || from === undefined) return undefined;
  const parent = yard.settings[from];
  if (parent !== undefined) return parent.folded;
  if (yard.ancestors?.[from] === undefined) return undefined;
  const fold = plotIdOf(yard, from);
  const siblings = Object.values(yard.settings).filter((held) => held.from === from);
  return siblings.some((held) => held.folded === fold) ? fold : undefined;
}

export function departedFold(yard: YardState, mark: TrailMark): YardState {
  return focusWithin(yard, mark.id)
    ? markedWith(yard, { ...mark, pendingFold: true })
    : foldedOnLeaving(yard, mark);
}

export function foldedOnLeaving(yard: YardState, mark: TrailMark): YardState {
  const { yard: folded, members } = foldedWithin(yard, mark.id);
  const { pendingFold: _, ...settledMark } = mark;
  return markedWith(folded, { ...settledMark, foldedOnLeaving: members });
}

export function pendingFoldsApplied(yard: YardState): YardState {
  return Object.values(yard.ancestors ?? {})
    .filter((mark) => mark.pendingFold === true)
    .reduce((current, mark) => departedFold(current, mark), yard);
}

export function foldUndone(yard: YardState, mark: TrailMark | undefined): YardState {
  if (mark === undefined) return yard;
  const fold = plotIdOf(yard, mark.id);
  const back = (mark.foldedOnLeaving ?? []).flatMap((id) => {
    const held = yard.settings[id];
    if (held === undefined || held.folded !== fold) return [];
    const { folded: _, ...standing } = held;
    return [standing];
  });
  if (back.length === 0) return yard;
  return {
    ...yard,
    settings: { ...yard.settings, ...Object.fromEntries(back.map((held) => [held.id, held])) },
  };
}

export function hiddenInPlots(settings: readonly YardSetting[]): ReadonlyMap<string, string> {
  return new Map(
    settings.flatMap((held) =>
      held.folded === undefined ? [] : [[held.id, held.folded] as const],
    ),
  );
}

export function plotCardsOf(settings: readonly YardSetting[]): readonly PlotCard[] {
  const byFold = new Map<string, YardSetting[]>();
  for (const held of settings) {
    if (held.folded === undefined) continue;
    byFold.set(held.folded, [...(byFold.get(held.folded) ?? []), held]);
  }
  return [...byFold.entries()].flatMap(([id, members]) =>
    members.some(onTheRail) ? [plotCardOf(id, members)] : [],
  );
}

function foldedWithin(yard: YardState, id: string): { yard: YardState; members: string[] } {
  const fold = plotIdOf(yard, id);
  const members = descendantsOf(lineageOf(yard), id).flatMap((step) => {
    const held = yard.settings[step];
    return held === undefined || held.folded !== undefined ? [] : [{ ...held, folded: fold }];
  });
  if (members.length === 0) return { yard, members: [] };
  return {
    yard: {
      ...yard,
      settings: { ...yard.settings, ...Object.fromEntries(members.map((held) => [held.id, held])) },
    },
    members: members.map((held) => held.id),
  };
}

function markedWith(yard: YardState, mark: TrailMark): YardState {
  return { ...yard, ancestors: { ...yard.ancestors, [mark.id]: mark } };
}

function plotCardOf(id: string, members: readonly YardSetting[]): PlotCard {
  const ordered = members.toSorted(byId);
  return {
    id,
    seed: plotSeedOf(id) ?? id,
    members: ordered,
    depth: Math.max(...ordered.map((member) => member.depth)),
    at: newestOf(ordered.map((member) => member.at)),
  };
}

function onTheRail(setting: YardSetting): boolean {
  return stillShown(setting) && rankOf(setting.shown) >= rankOf("card");
}

function newestOf(times: readonly string[]): string {
  return times.reduce((newest, at) => (parseTs(at) > parseTs(newest) ? at : newest));
}
