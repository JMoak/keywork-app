import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";

export interface PatchSides {
  readonly path: string;
  readonly before: string | null;
  readonly after: string | null;
}

export const patchContextLines = 3;

export function unifiedPatch(sides: PatchSides): string {
  const before = linesOf(sides.before);
  const after = linesOf(sides.after);
  const hunks = hunksOf(lineChanges(before, after), before.length);
  if (hunks.length === 0) return "";
  return [
    sides.before === null ? "--- /dev/null" : `--- a/${sides.path}`,
    sides.after === null ? "+++ /dev/null" : `+++ b/${sides.path}`,
    ...hunks.flatMap((hunk) => hunkLines(hunk, before, after)),
  ].join("\n");
}

interface LineChange {
  readonly fromA: number;
  readonly toA: number;
  readonly fromB: number;
  readonly toB: number;
}

interface Hunk {
  readonly fromA: number;
  readonly toA: number;
  readonly fromB: number;
  readonly toB: number;
  readonly changes: readonly LineChange[];
}

function linesOf(text: string | null): string[] {
  if (text === null || text === "") return [];
  return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
}

function lineChanges(before: readonly string[], after: readonly string[]): LineChange[] {
  const a = documentOf(before);
  const b = documentOf(after);
  return Chunk.build(a, b).map((chunk) => {
    const [fromA, toA] = lineRange(a, chunk.fromA, chunk.toA, chunk.endA, before.length);
    const [fromB, toB] = lineRange(b, chunk.fromB, chunk.toB, chunk.endB, after.length);
    return { fromA, toA, fromB, toB };
  });
}

function documentOf(lines: readonly string[]): Text {
  return Text.of([...lines, ""]);
}

function lineRange(
  doc: Text,
  from: number,
  to: number,
  end: number,
  lines: number,
): [number, number] {
  const start = from > doc.length ? lines : doc.lineAt(from).number - 1;
  const stop = from === to ? start : doc.lineAt(Math.min(end, doc.length)).number;
  return [Math.min(start, lines), Math.min(stop, lines)];
}

function hunksOf(changes: readonly LineChange[], linesA: number): Hunk[] {
  const hunks: LineChange[][] = [];
  for (const change of changes) {
    const open = hunks.at(-1);
    const last = open?.at(-1);
    if (
      open !== undefined &&
      last !== undefined &&
      change.fromA - last.toA <= 2 * patchContextLines
    ) {
      open.push(change);
    } else {
      hunks.push([change]);
    }
  }
  return hunks.map((group) => framed(group, linesA));
}

function framed(changes: readonly LineChange[], linesA: number): Hunk {
  const first = changes[0] as LineChange;
  const last = changes.at(-1) as LineChange;
  const lead = Math.min(patchContextLines, first.fromA);
  const tail = Math.min(patchContextLines, linesA - last.toA);
  return {
    fromA: first.fromA - lead,
    toA: last.toA + tail,
    fromB: first.fromB - lead,
    toB: last.toB + tail,
    changes,
  };
}

function hunkLines(hunk: Hunk, before: readonly string[], after: readonly string[]): string[] {
  const lines = [`@@ -${rangeOf(hunk.fromA, hunk.toA)} +${rangeOf(hunk.fromB, hunk.toB)} @@`];
  let at = hunk.fromA;
  for (const change of hunk.changes) {
    lines.push(...before.slice(at, change.fromA).map((line) => ` ${line}`));
    lines.push(...before.slice(change.fromA, change.toA).map((line) => `-${line}`));
    lines.push(...after.slice(change.fromB, change.toB).map((line) => `+${line}`));
    at = change.toA;
  }
  lines.push(...before.slice(at, hunk.toA).map((line) => ` ${line}`));
  return lines;
}

function rangeOf(from: number, to: number): string {
  const count = to - from;
  return count === 0 ? `${from},0` : `${from + 1},${count}`;
}
