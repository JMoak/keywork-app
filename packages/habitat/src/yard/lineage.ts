import type { Setting } from "@keywork-app/protocol";
import { parseTs } from "../clock/clock.ts";
import {
  belongsTo,
  byArrival,
  rankOf,
  stillShown,
  type TrailMark,
  type YardOwner,
  type YardSetting,
  type YardState,
} from "./types.ts";

export const chainNames = 4;

export const chainKept = 2;

export const chainArrow = " → ";

export const nameLength = 40;

export const plotPrefix = "plot:";

export interface TrailRow {
  readonly id: string;
  readonly level: number;
  readonly parent: string | null;
}

export function plotCardId(seed: string): string {
  return `${plotPrefix}${seed}`;
}

export function plotSeedOf(id: string): string | undefined {
  return id.startsWith(plotPrefix) ? id.slice(plotPrefix.length) : undefined;
}

export function nameOf(subject: Pick<Setting, "what">): string {
  const { kind, ref, title } = subject.what;
  const named = title?.trim();
  if (named !== undefined && named !== "") return clipped(named);
  if (kind === "file") return clipped(lastSegmentOf(ref));
  if (kind === "url") return clipped(ref.replace(/^[a-z]+:\/\//i, "").replace(/\/+$/, ""));
  return clipped(firstLineOf(ref));
}

export function parentOf(yard: YardState, id: string): string | undefined {
  return lineageOf(yard).parent(id);
}

export function trailOf(yard: YardState, id: string): readonly string[] {
  return ancestry(lineageOf(yard), id).toReversed();
}

export function plotOf(yard: YardState, seed: string): readonly string[] {
  const lineage = lineageOf(yard);
  return descendantsOf(lineage, seed).filter((id) => yard.settings[id] !== undefined);
}

export function chainOf(yard: YardState, id: string): string {
  const lineage = lineageOf(yard);
  const seed = plotSeedOf(id);
  const last = seed === undefined ? id : deepestIn(yard, lineage, id, seed);
  if (last === undefined || lineage.node(last) === undefined) return "";
  return chainNamed(
    ancestry(lineage, last)
      .toReversed()
      .flatMap((step) => nameOrNothing(lineage.node(step))),
  );
}

export function trailOrderOf(yard: YardState, owner?: YardOwner): readonly TrailRow[] {
  const lineage = lineageOf(yard);
  const rows = rowsOf(yard, owner);
  const under = rowsUnder(rows, lineage);
  const newest = (row: Row): number =>
    row.plot ? newestMember(yard, row.id) : newestIn(lineage, row.anchor);
  const newestFirst = (a: Row, b: Row): number => newest(b) - newest(a) || byIdOf(a.id, b.id);
  const walk = (parent: Row | undefined, level: number): TrailRow[] =>
    (under.get(parent?.id) ?? [])
      .toSorted(newestFirst)
      .flatMap((row) => [
        { id: row.id, level, parent: parent?.id ?? null },
        ...walk(row, level + 1),
      ]);
  return walk(undefined, 0);
}

export function keptAncestors(yard: YardState): YardState {
  const held = yard.ancestors;
  if (held === undefined) return yard;
  const lineage = lineageOf(yard);
  const kept = Object.values(held).filter(
    (mark) =>
      yard.settings[mark.id] === undefined &&
      descendantsOf(lineage, mark.id).some((id) => yard.settings[id] !== undefined),
  );
  if (kept.length === Object.keys(held).length) return yard;
  if (kept.length === 0) {
    const { ancestors: _, ...rest } = yard;
    return rest;
  }
  return { ...yard, ancestors: Object.fromEntries(kept.map((mark) => [mark.id, mark])) };
}

export function withAncestor(yard: YardState, mark: TrailMark): YardState {
  return keptAncestors({ ...yard, ancestors: { ...yard.ancestors, [mark.id]: mark } });
}

export function markOf(setting: TrailMark, replaceable: boolean): TrailMark {
  const { id, from, what, at, creature, sessionId } = setting;
  return { id, from, what, at, creature, sessionId, replaceable };
}

export function reparented(yard: YardState, predecessor: string, successor: string): YardState {
  const fold = plotCardId(predecessor);
  const moved = <Node extends TrailMark>(node: Node): Node =>
    node.from === predecessor ? { ...node, from: successor } : node;
  const settings = Object.fromEntries(
    Object.entries(yard.settings).map(([id, setting]) => {
      const refolded =
        setting.folded === fold ? { ...setting, folded: plotCardId(successor) } : setting;
      return [id, moved(refolded)];
    }),
  );
  const ancestors =
    yard.ancestors === undefined
      ? undefined
      : Object.fromEntries(Object.entries(yard.ancestors).map(([id, mark]) => [id, moved(mark)]));
  return keptAncestors(
    ancestors === undefined ? { ...yard, settings } : { ...yard, settings, ancestors },
  );
}

export interface Lineage {
  node(id: string): TrailMark | undefined;
  parent(id: string): string | undefined;
  children(id: string): readonly string[];
}

export function lineageOf(yard: Pick<YardState, "settings" | "ancestors">): Lineage {
  const nodes = new Map<string, TrailMark>([
    ...Object.entries(yard.ancestors ?? {}),
    ...Object.entries(yard.settings),
  ]);
  const parent = (id: string): string | undefined => {
    const from = nodes.get(id)?.from;
    return from === null || from === undefined || from === id || !nodes.has(from)
      ? undefined
      : from;
  };
  const children = new Map<string, TrailMark[]>();
  for (const node of nodes.values()) {
    const above = parent(node.id);
    if (above !== undefined) children.set(above, [...(children.get(above) ?? []), node]);
  }
  return {
    node: (id) => nodes.get(id),
    parent,
    children: (id) => (children.get(id) ?? []).toSorted(byArrival).map((node) => node.id),
  };
}

export function ancestry(lineage: Lineage, id: string): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let at: string | undefined = lineage.node(id) === undefined ? undefined : id;
  while (at !== undefined && !seen.has(at)) {
    seen.add(at);
    path.push(at);
    at = lineage.parent(at);
  }
  return path;
}

export function descendantsOf(lineage: Lineage, seed: string): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id) || lineage.node(id) === undefined) return;
    seen.add(id);
    order.push(id);
    for (const child of lineage.children(id)) visit(child);
  };
  visit(seed);
  return order;
}

interface Row {
  readonly id: string;
  readonly anchor: string;
  readonly plot: boolean;
}

function rowsOf(yard: YardState, owner: YardOwner | undefined): Row[] {
  const rows = new Map<string, Row>();
  for (const setting of Object.values(yard.settings).filter(onTheTrail).sort(byArrival)) {
    if (owner !== undefined && !belongsTo(setting, owner)) continue;
    const { folded } = setting;
    const row =
      folded === undefined
        ? { id: setting.id, anchor: setting.id, plot: false }
        : { id: folded, anchor: plotSeedOf(folded) ?? folded, plot: true };
    if (!rows.has(row.id)) rows.set(row.id, row);
  }
  return [...rows.values()];
}

function rowsUnder(rows: readonly Row[], lineage: Lineage): Map<string | undefined, Row[]> {
  const standing = new Set(rows.filter((row) => !row.plot).map((row) => row.id));
  const under = new Map<string | undefined, Row[]>();
  for (const row of rows) {
    const above = ancestry(lineage, row.anchor).slice(row.plot ? 0 : 1);
    const parent = above.find((id) => standing.has(id));
    under.set(parent, [...(under.get(parent) ?? []), row]);
  }
  return under;
}

function deepestIn(
  yard: YardState,
  lineage: Lineage,
  plot: string,
  seed: string,
): string | undefined {
  const members = Object.values(yard.settings).filter((held) => held.folded === plot);
  const candidates =
    members.length > 0 ? members.map((held) => held.id) : descendantsOf(lineage, seed);
  return candidates
    .map((id) => ({ id, length: ancestry(lineage, id).length, at: arrivalOf(lineage, id) }))
    .sort((a, b) => b.length - a.length || b.at - a.at || byIdOf(a.id, b.id))[0]?.id;
}

function newestMember(yard: YardState, plot: string): number {
  return Math.max(
    ...Object.values(yard.settings)
      .filter((held) => held.folded === plot)
      .map((held) => parseTs(held.at)),
  );
}

function onTheTrail(setting: YardSetting): boolean {
  return stillShown(setting) && rankOf(setting.shown) >= rankOf("card");
}

function newestIn(lineage: Lineage, id: string): number {
  return Math.max(...descendantsOf(lineage, id).map((step) => arrivalOf(lineage, step)));
}

function arrivalOf(lineage: Lineage, id: string): number {
  const node = lineage.node(id);
  return node === undefined ? Number.NEGATIVE_INFINITY : parseTs(node.at);
}

function chainNamed(names: readonly string[]): string {
  if (names.length <= chainNames) return names.join(chainArrow);
  const [seed = ""] = names;
  const hidden = names.length - chainKept - 1;
  return [seed, `${hidden} more`, ...names.slice(-chainKept)].join(chainArrow);
}

function nameOrNothing(node: TrailMark | undefined): string[] {
  return node === undefined ? [] : [nameOf(node)];
}

function lastSegmentOf(path: string): string {
  return (
    path
      .split(/[\\/]/)
      .filter((part) => part !== "")
      .at(-1) ?? path
  );
}

function firstLineOf(text: string): string {
  return (text.split("\n")[0] ?? text).trim();
}

function clipped(name: string): string {
  return name.length <= nameLength ? name : `${name.slice(0, nameLength - 1)}…`;
}

function byIdOf(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
