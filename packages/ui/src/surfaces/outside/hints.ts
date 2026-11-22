import type { ScreenRect } from "../port.ts";

export const hintAlphabet = "asdfghjklqwertyuiopzxcvbnm";

export interface Hinted<Key> {
  readonly key: Key;
  readonly bounds: ScreenRect;
}

export type Hints<Key> = ReadonlyMap<Key, string>;

export type HintStep<Key> =
  | { readonly kind: "picked"; readonly key: Key }
  | { readonly kind: "narrowed"; readonly typed: string }
  | { readonly kind: "missed" };

export function hintsFor<Key>(panes: readonly Hinted<Key>[], alphabet = hintAlphabet): Hints<Key> {
  const labels = hintLabels(panes.length, alphabet);
  return new Map(
    inReadingOrder(panes).flatMap((pane, at) => {
      const label = labels[at];
      return label === undefined ? [] : [[pane.key, label] as const];
    }),
  );
}

export function hintLabels(count: number, alphabet = hintAlphabet): string[] {
  const letters = [...alphabet];
  const leading = letters.slice(letters.length - leadersNeeded(count, letters.length));
  const alone = letters.slice(0, letters.length - leading.length);
  const paired = leading.flatMap((first) => letters.map((second) => first + second));
  return [...alone, ...paired].slice(0, Math.max(0, count));
}

export function hintTyped<Key>(hints: Hints<Key>, typed: string, letter: string): HintStep<Key> {
  const sofar = typed + letter;
  const reached = [...hints].filter(([, label]) => label.startsWith(sofar));
  const exact = reached.find(([, label]) => label === sofar);
  if (exact !== undefined) return { kind: "picked", key: exact[0] };
  return reached.length === 0 ? { kind: "missed" } : { kind: "narrowed", typed: sofar };
}

export function hintLeft(label: string | undefined, typed: string): string | undefined {
  return label?.startsWith(typed) === true ? label.slice(typed.length) : undefined;
}

function leadersNeeded(count: number, letters: number): number {
  if (count <= letters || letters < 2) return 0;
  return Math.min(letters, Math.ceil((count - letters) / (letters - 1)));
}

function inReadingOrder<Key>(panes: readonly Hinted<Key>[]): Hinted<Key>[] {
  const rows: Hinted<Key>[][] = [];
  for (const pane of panes.toSorted(downThenAcross)) {
    const row = rows.at(-1);
    if (row !== undefined && startsOnTheRowOf(row[0], pane)) row.push(pane);
    else rows.push([pane]);
  }
  return rows.flatMap((row) => row.toSorted(acrossThenDown));
}

function startsOnTheRowOf<Key>(first: Hinted<Key> | undefined, pane: Hinted<Key>): boolean {
  return first !== undefined && pane.bounds.y < first.bounds.y + first.bounds.height / 2;
}

function downThenAcross<Key>(one: Hinted<Key>, other: Hinted<Key>): number {
  return one.bounds.y - other.bounds.y || one.bounds.x - other.bounds.x;
}

function acrossThenDown<Key>(one: Hinted<Key>, other: Hinted<Key>): number {
  return one.bounds.x - other.bounds.x || one.bounds.y - other.bounds.y;
}
