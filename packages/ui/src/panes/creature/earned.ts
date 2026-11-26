import type { Honour } from "@keywork-app/protocol";
import { honourTitle, type NameOf } from "../stead/block/honour-words.ts";

export interface EarnedRow {
  readonly kind: string;
  readonly title: string;
  readonly proof: string;
  readonly earnedAt: string;
  readonly earlier: boolean;
  readonly folded: number;
  readonly opened: number;
}

export const earnedHeading = "Earned";
export const earlierOnesWord = "earlier ones";
export const foldWord = "fold";
export const earlierOnesSpoken = {
  folded: "show the earlier ones of each kind it earned",
  open: "fold the earlier ones back to the highest of each kind",
} as const;

export function earlierWord(count: number): string {
  return `${count} earlier`;
}

export function earnedBy(honours: readonly Honour[], slug: string): Honour[] {
  return honours.filter((honour) => honour.holder === slug);
}

export function earnedRows(
  held: readonly Honour[],
  nameOf: NameOf,
  open: (kind: string) => boolean = () => false,
): EarnedRow[] {
  return kindsNewestFirst(held).flatMap(([kind, [highest, ...earlier]]) => {
    if (highest === undefined) return [];
    const shown = open(kind) ? earlier : [];
    const row = (honour: Honour, folded: number, opened: number): EarnedRow => ({
      kind,
      title: honourTitle(honour, nameOf),
      proof: honour.proof,
      earnedAt: honour.earnedAt,
      earlier: honour !== highest,
      folded,
      opened,
    });
    return [
      row(highest, earlier.length - shown.length, shown.length),
      ...shown.map((honour) => row(honour, 0, 0)),
    ];
  });
}

export function foldsAnything(held: readonly Honour[]): boolean {
  return kindsNewestFirst(held).some(([, tiers]) => tiers.length > 1);
}

function kindsNewestFirst(held: readonly Honour[]): [string, Honour[]][] {
  const kinds = new Map<string, Honour[]>();
  for (const honour of held) {
    const kind = JSON.stringify([honour.kind, honour.with]);
    kinds.set(kind, [...(kinds.get(kind) ?? []), honour]);
  }
  return [...kinds]
    .map(([kind, tiers]): [string, Honour[]] => [kind, tiers.sort((a, b) => b.tier - a.tier)])
    .sort(([, a], [, b]) => earnedAtOf(b[0]) - earnedAtOf(a[0]));
}

function earnedAtOf(honour: Honour | undefined): number {
  return honour === undefined ? 0 : Date.parse(honour.earnedAt);
}
