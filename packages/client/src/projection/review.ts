import {
  type BusEnvelope,
  type ExtensionNotice,
  type HunkReference,
  type HunkVerdict,
  type ReviewVerdict,
  reviewExtension,
  type VerdictMark,
  type VerdictsReading,
} from "@keywork-app/protocol";

export interface ReviewState {
  readonly marks: readonly VerdictMark[];
  readonly loaded: boolean;
}

export interface ReviewTally {
  readonly keep: number;
  readonly drop: number;
  readonly ask: number;
}

export const emptyReview: ReviewState = { marks: [], loaded: false };

export function reviewSnapshot(reading: VerdictsReading): ReviewState {
  return { marks: reading === "missing" ? [] : reading.verdicts, loaded: true };
}

export function reviewState(state: ReviewState, envelope: BusEnvelope): ReviewState {
  if (envelope.type !== "extension.notice") return state;
  const mark = reviewVerdictOf(envelope.payload);
  if (mark === undefined || state.marks.some((seen) => seen.entryId === mark.entryId)) return state;
  return { ...state, marks: [...state.marks, mark] };
}

export function reviewMarked(state: ReviewState, mark: VerdictMark): ReviewState {
  return reviewState(state, {
    id: 0,
    ts: mark.at,
    sessionId: "",
    type: "extension.notice",
    payload: reviewNotice(mark),
  });
}

export function reviewNotice(mark: VerdictMark): ExtensionNotice {
  return {
    extension: reviewExtension,
    level: "info",
    message: verdictLine(mark),
    detail: { verdict: mark, entryId: mark.entryId },
  };
}

export function isReviewNotice(payload: ExtensionNotice): boolean {
  return payload.extension === reviewExtension;
}

export function reviewVerdictOf(payload: ExtensionNotice): VerdictMark | undefined {
  if (!isReviewNotice(payload)) return undefined;
  const detail = payload.detail;
  if (typeof detail !== "object" || detail === null || !("verdict" in detail)) return undefined;
  const mark = detail.verdict;
  return isVerdictMark(mark) ? mark : undefined;
}

export function verdictLine(verdict: ReviewVerdict): string {
  return `${verdict.verdict} · ${verdict.path} ${verdict.header} · hunk ${verdict.digest}`;
}

export function hunkKey(hunk: HunkReference): string {
  return `${hunk.path}#${hunk.digest}`;
}

export function latestVerdicts(marks: readonly VerdictMark[]): VerdictMark[] {
  const latest = new Map<string, VerdictMark>();
  for (const mark of marks) latest.set(hunkKey(mark), mark);
  return [...latest.values()];
}

export function verdictFor(
  marks: readonly VerdictMark[],
  hunk: HunkReference,
): HunkVerdict | undefined {
  return latestVerdicts(marks).find((mark) => hunkKey(mark) === hunkKey(hunk))?.verdict;
}

export function openAsks(marks: readonly VerdictMark[]): VerdictMark[] {
  return latestVerdicts(marks).filter((mark) => mark.verdict === "ask");
}

export function reviewTally(
  marks: readonly VerdictMark[],
  path?: string,
  shown?: readonly HunkReference[],
): ReviewTally {
  const tally = { keep: 0, drop: 0, ask: 0 };
  const current = shown === undefined ? undefined : new Set(shown.map(hunkKey));
  for (const mark of latestVerdicts(marks)) {
    const onPath = path === undefined || mark.path === path;
    const stillShown = current === undefined || current.has(hunkKey(mark));
    if (onPath && stillShown) tally[mark.verdict] += 1;
  }
  return tally;
}

export function hunkDigest(removed: readonly string[], added: readonly string[]): string {
  const text = [...removed.map((line) => `-${line}`), ...added.map((line) => `+${line}`)].join(
    "\n",
  );
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function hunkHeader(
  before: { from: number; count: number },
  after: { from: number; count: number },
): string {
  return `@@ -${rangeOf(before)} +${rangeOf(after)} @@`;
}

export function hunkReference(
  path: string,
  header: string,
  removed: readonly string[],
  added: readonly string[],
): HunkReference {
  return { path, header, digest: hunkDigest(removed, added) };
}

function rangeOf(span: { from: number; count: number }): string {
  return span.count === 0 ? `${span.from},0` : `${span.from + 1},${span.count}`;
}

function isVerdictMark(value: unknown): value is VerdictMark {
  if (typeof value !== "object" || value === null) return false;
  const fields = value as Record<string, unknown>;
  return (
    typeof fields.path === "string" &&
    typeof fields.header === "string" &&
    typeof fields.digest === "string" &&
    typeof fields.entryId === "string" &&
    typeof fields.at === "string" &&
    typeof fields.index === "number" &&
    (fields.verdict === "keep" || fields.verdict === "drop" || fields.verdict === "ask")
  );
}
