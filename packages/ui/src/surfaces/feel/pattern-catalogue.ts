import { type Deal, dealMetrics, drawn, evenRows, sameSeats, turned } from "./pattern-deals.ts";

export const dealtCounts = [8, 9, 10, 11, 12] as const;

export function dealsFor(count: number): readonly Deal[] {
  return catalogue[count] ?? evenly(count);
}

const catalogue: Readonly<Record<number, readonly Deal[]>> = {
  8: [
    drawn("tower", "abb", "acd", "aef", "agh"),
    drawn("ledger", "ab", "cd", "ef", "gh"),
    drawn("studio", "aabc", "aade", "aaff", "gghh"),
    drawn("banner", "aaaa", "bbcd", "efgh"),
  ],
  9: [
    drawn("marquee", "aabc", "aade", "fghi"),
    drawn("square", "abc", "def", "ghi"),
    drawn("tower", "abc", "ade", "afg", "ahi"),
    drawn("pair", "aabb", "aabb", "ccde", "fghi"),
  ],
  10: [
    drawn("studio", "aabc", "aade", "aafg", "hhij"),
    drawn("gallery", "aabb", "cdef", "ghij"),
    drawn("tower", "abc", "ade", "afg", "hij"),
    drawn("steps", "aabc", "deef", "ghij"),
  ],
  11: [
    drawn("marquee", "aabc", "aade", "fghi", "jjkk"),
    drawn("keystone", "abbc", "defg", "hijk"),
    drawn("tower", "abcd", "aefg", "ahij", "akkk"),
    drawn("lead", "aabc", "defg", "hijk"),
  ],
  12: [
    drawn("marquee", "aabc", "aade", "fghi", "jjkl"),
    drawn("dozen", "abcd", "efgh", "ijkl"),
    drawn("brickwork", "aabc", "deef", "gghi", "jkll"),
    drawn("tower", "abcd", "aefg", "ahij", "akll"),
  ],
};

function evenly(count: number): readonly Deal[] {
  if (count < 1 || count > dealMetrics.most) return [];
  const rows = evenRows(count);
  const columns = turned(rows, "columns");
  return sameSeats(rows, columns) ? [rows] : [rows, columns];
}
