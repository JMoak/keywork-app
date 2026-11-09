import { minute, second } from "../clock/clock.ts";
import { descendantsOf, lineageOf } from "./lineage.ts";
import { focusWithin, pendingFoldsApplied } from "./plot.ts";
import {
  type AttendKind,
  type Attention,
  type Size,
  sizeOf,
  type Visit,
  type YardSetting,
  type YardState,
} from "./types.ts";

export const attentionTuning = {
  halfLifeMs: 10 * minute,
  entry: 5,
  passThroughMs: 2 * second,
  interaction: 1,
  interactionEveryMs: 2 * second,
  dwellPointMs: 10 * second,
  dwellCapMs: 60 * second,
  ceiling: 40,
  working: { enter: 20, leave: 10 },
  workingAtMost: 2,
  depthShare: 6,
  flowPerLevel: 0.5,
} as const;

export interface Attend {
  readonly id: string;
  readonly kind: AttendKind;
  readonly at: number;
}

export function attend(yard: YardState, notice: Attend): YardState {
  if (yard.settings[notice.id] === undefined) return yard;
  const visited = noticed(yard, notice);
  if (visited === yard) return yard;
  return sizesDecided(pendingFoldsApplied(visited), notice.at);
}

export function scoreAt(attention: Attention | undefined, at: number): number {
  if (attention === undefined) return 0;
  return attention.score * 0.5 ** (Math.max(0, at - attention.lastAt) / attentionTuning.halfLifeMs);
}

export function sizeAfter(size: Size, score: number): Size {
  const { working } = attentionTuning;
  if (size === "working" && score >= working.leave) return "working";
  return score >= working.enter ? "working" : "readable";
}

export function sizesDecided(yard: YardState, at: number): YardState {
  const inside = yard.visit?.id;
  const wanted = Object.values(yard.settings)
    .filter(sizable)
    .map((setting) => ({ setting, size: sizeWanted(setting, inside, at) }));
  const working = new Set(
    wanted
      .filter(({ size }) => size === "working")
      .map(({ setting }) => setting)
      .sort((a, b) => keepsWorkingFirst(a, b, inside))
      .slice(0, attentionTuning.workingAtMost)
      .map((setting) => setting.id),
  );
  const changed = wanted.flatMap(({ setting, size }) => {
    const decided: Size = size === "working" && !working.has(setting.id) ? "readable" : size;
    return decided === sizeOf(setting) ? [] : [{ ...setting, size: decided }];
  });
  if (changed.length === 0) return yard;
  return {
    ...yard,
    settings: { ...yard.settings, ...Object.fromEntries(changed.map((held) => [held.id, held])) },
  };
}

export function sizable(setting: Pick<YardSetting, "shown" | "folded">): boolean {
  return setting.shown === "unfold" && setting.folded === undefined;
}

export function flowedScore(yard: YardState, id: string, at: number): number {
  const lineage = lineageOf(yard);
  const levels = new Map<string, number>([[id, 0]]);
  return Math.max(
    0,
    ...descendantsOf(lineage, id).map((member) => {
      const parent = lineage.parent(member);
      const level = member === id || parent === undefined ? 0 : (levels.get(parent) ?? 0) + 1;
      levels.set(member, level);
      const score = scoreAt(yard.settings[member]?.attention, at);
      return score * attentionTuning.flowPerLevel ** level;
    }),
  );
}

export function attendedAt(yard: YardState, id: string, at: number): boolean {
  return focusWithin(yard, id) || flowedScore(yard, id, at) > attentionTuning.working.leave;
}

function noticed(yard: YardState, notice: Attend): YardState {
  switch (notice.kind) {
    case "enter":
      return yard.visit?.id === notice.id
        ? yard
        : visitOpened(visitClosed(yard, notice.at), notice);
    case "leave":
      return yard.visit?.id === notice.id ? visitClosed(yard, notice.at) : yard;
    case "interact":
      return interacted(yard, notice.id, notice.at);
  }
}

function visitOpened(yard: YardState, notice: Attend): YardState {
  return { ...yard, visit: { id: notice.id, since: notice.at, counted: false } };
}

function visitClosed(yard: YardState, at: number): YardState {
  const { visit, ...rest } = yard;
  if (visit === undefined) return yard;
  const held = rest.settings[visit.id];
  const stay = Math.max(0, at - visit.since);
  if (held === undefined || (!visit.counted && stay < attentionTuning.passThroughMs)) return rest;
  const attention = credited(held.attention, at, {
    points: (visit.counted ? 0 : attentionTuning.entry) + dwellPoints(stay),
    entries: visit.counted ? 0 : 1,
    dwellMs: stay,
  });
  return { ...rest, settings: { ...rest.settings, [held.id]: { ...held, attention } } };
}

function interacted(yard: YardState, id: string, at: number): YardState {
  const held = yard.settings[id];
  if (held === undefined) return yard;
  const visit = yard.visit;
  const entering = visit !== undefined && visit.id === id && !visit.counted;
  const counts = interactionCounts(held.attention, at);
  if (!entering && !counts) return yard;
  const attention = credited(held.attention, at, {
    points: (entering ? attentionTuning.entry : 0) + (counts ? attentionTuning.interaction : 0),
    entries: entering ? 1 : 0,
    interactions: counts ? 1 : 0,
  });
  const marked = counts ? { ...attention, interactedAt: at } : attention;
  const settings = { ...yard.settings, [id]: { ...held, attention: marked } };
  return entering ? { ...yard, settings, visit: counted(visit) } : { ...yard, settings };
}

function interactionCounts(attention: Attention | undefined, at: number): boolean {
  const last = attention?.interactedAt;
  return last === undefined || at - last >= attentionTuning.interactionEveryMs;
}

interface Credit {
  readonly points: number;
  readonly entries?: number;
  readonly interactions?: number;
  readonly dwellMs?: number;
}

function credited(attention: Attention | undefined, at: number, credit: Credit): Attention {
  const held = attention ?? { dwellMs: 0, entries: 0, interactions: 0, lastAt: at, score: 0 };
  return {
    ...held,
    dwellMs: held.dwellMs + (credit.dwellMs ?? 0),
    entries: held.entries + (credit.entries ?? 0),
    interactions: held.interactions + (credit.interactions ?? 0),
    score: Math.min(attentionTuning.ceiling, scoreAt(attention, at) + credit.points),
    lastAt: at,
  };
}

function counted(visit: Visit): Visit {
  return { ...visit, counted: true };
}

function sizeWanted(setting: YardSetting, inside: string | undefined, at: number): Size {
  if (setting.id === inside && sizeOf(setting) === "working") return "working";
  return sizeAfter(sizeOf(setting), scoreAt(setting.attention, at));
}

function keepsWorkingFirst(a: YardSetting, b: YardSetting, inside: string | undefined): number {
  return (
    Number(b.id === inside) - Number(a.id === inside) ||
    (b.attention?.lastAt ?? 0) - (a.attention?.lastAt ?? 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function dwellPoints(stay: number): number {
  const { dwellCapMs, dwellPointMs } = attentionTuning;
  return Math.floor(Math.min(Math.max(0, stay), dwellCapMs) / dwellPointMs);
}
