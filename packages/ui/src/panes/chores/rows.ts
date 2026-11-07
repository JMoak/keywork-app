import type { RowDensity } from "../overview/rows.tsx";
import { type ChoreRow, type CreatureRow, isOn, isRunning } from "./wire.ts";

export type ChoresListRow =
  | {
      readonly kind: "creature";
      readonly creature: CreatureRow;
      readonly count: number;
      readonly folded: boolean;
      readonly refusal: string | undefined;
    }
  | { readonly kind: "chore"; readonly creature: CreatureRow; readonly row: ChoreRow };

export interface ChoreMark {
  readonly glyph: string;
  readonly density: RowDensity;
}

export function creaturesInScope(
  creatures: readonly CreatureRow[],
  only: string | undefined,
): readonly CreatureRow[] {
  return only === undefined ? creatures : creatures.filter((creature) => creature.slug === only);
}

export interface ChoresByCreature {
  readonly chores: Readonly<Record<string, readonly ChoreRow[]>>;
  readonly choreRefusals: Readonly<Record<string, string | undefined>>;
}

export function choresListRows(
  creatures: readonly CreatureRow[],
  known: ChoresByCreature,
  folded: ReadonlySet<string>,
): ChoresListRow[] {
  return creatures.flatMap((creature): ChoresListRow[] => {
    const rows = known.chores[creature.slug] ?? [];
    const closed = folded.has(creature.slug);
    const refusal = known.choreRefusals[creature.slug];
    return [
      { kind: "creature", creature, count: rows.length, folded: closed, refusal },
      ...(closed ? [] : rows.map((row): ChoresListRow => ({ kind: "chore", creature, row }))),
    ];
  });
}

export function refusalsOf(
  creatures: readonly CreatureRow[],
  known: ChoresByCreature,
): readonly string[] {
  return creatures.flatMap((creature) => known.choreRefusals[creature.slug] ?? []);
}

export function choresOf(
  creatures: readonly CreatureRow[],
  chores: Readonly<Record<string, readonly ChoreRow[]>>,
): readonly ChoreRow[] {
  return creatures.flatMap((creature) => chores[creature.slug] ?? []);
}

export function choreMark(row: ChoreRow): ChoreMark {
  if (row.routine === null) return { glyph: "×", density: "full" };
  if (isRunning(row)) return { glyph: "▓", density: "heavy" };
  return isOn(row) ? { glyph: "▒", density: "medium" } : { glyph: "░", density: "light" };
}

export function titleOf(row: ChoreRow): string {
  return row.routine?.title ?? row.id;
}

export function sameChore(row: ChoreRow, creature: string, id: string): boolean {
  return row.creature === creature && row.id === id;
}
