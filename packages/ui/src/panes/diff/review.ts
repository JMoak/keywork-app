import {
  emptyReview,
  hunkReference,
  type ReviewState,
  type ReviewTally,
  reviewMarked,
  reviewSnapshot,
  reviewState,
  reviewTally,
  type ServerFeed,
  verdictLine,
} from "@keywork-app/client";
import type { HunkReference, HunkVerdict, VerdictMark } from "@keywork-app/protocol";
import { createEffect, createSignal, onCleanup } from "solid-js";
import type { ShellSeams } from "../registry.ts";
import type { MergeHunk } from "./merge-view.ts";

export interface ReviewTrail {
  marks(): readonly VerdictMark[];
  fold(mark: VerdictMark): void;
  reload(): Promise<void>;
}

export const verdictActions: Readonly<Record<string, HunkVerdict>> = {
  "diff.keep": "keep",
  "diff.drop": "drop",
  "diff.ask": "ask",
};

export const talkLabel = "say something about this hunk · enter sends it to the thread";

export const noHunkNotice = "no hunk under the cursor";

export const unwiredNotice = "this server records no verdicts yet · nothing was written";

export const sessionGoneNotice = "this session is gone";

export const changedNotice = "the file changed since you opened it · this is its diff now";

export function createReviewTrail(shell: ShellSeams, sessionId: () => string): ReviewTrail {
  const [state, setState] = createSignal<ReviewState>(emptyReview);
  const reload = async (): Promise<void> => {
    setState(reviewSnapshot(await shell.client.hunkVerdicts(sessionId())));
  };
  createEffect(() => {
    sessionId();
    setState(emptyReview);
    void reload();
  });
  createEffect(() => {
    const feed: ServerFeed | undefined = shell.feed;
    if (feed === undefined) return;
    onCleanup(
      feed.subscribeSession(sessionId(), (envelopes) => {
        setState((held) => envelopes.reduce(reviewState, held));
      }),
    );
  });
  return {
    marks: () => state().marks,
    fold: (mark) => setState((held) => reviewMarked(held, mark)),
    reload,
  };
}

export function referenceOf(path: string, hunk: MergeHunk): HunkReference {
  return hunkReference(path, hunk.header, hunk.removed, hunk.added);
}

export function referenceLine(reference: HunkReference): string {
  return `${reference.path} ${reference.header} · hunk ${reference.digest}`;
}

export function talkMessage(path: string, hunk: MergeHunk, words: string): string {
  const reference = referenceOf(path, hunk);
  const quoted = [
    ...hunk.removed.map((line) => `-${line}`),
    ...hunk.added.map((line) => `+${line}`),
  ];
  return [
    `About ${reference.path} ${reference.header} (hunk ${reference.digest}):`,
    "",
    "```diff",
    ...quoted,
    "```",
    "",
    words.trim(),
  ].join("\n");
}

export function talkedNotice(reference: HunkReference): string {
  return `said to the thread · ${referenceLine(reference)}`;
}

export function hunkPlace(at: number, count: number): string {
  return count === 0 ? "no hunks" : `hunk ${at} of ${count}`;
}

export function reviewedLine(tally: ReviewTally, hunks: number, superseded = 0): string {
  const asks = tally.ask === 0 ? "" : ` · ${counted(tally.ask, "ask")}`;
  const earlier = superseded === 0 ? "" : ` · ${supersededClause(superseded)}`;
  return `${judged(tally)} of ${hunks} reviewed${asks}${earlier}`;
}

export function shownReviewLine(
  marks: readonly VerdictMark[],
  path: string,
  hunks: readonly MergeHunk[],
): string {
  const shown = reviewTally(
    marks,
    path,
    hunks.map((hunk) => referenceOf(path, hunk)),
  );
  return reviewedLine(shown, hunks.length, judged(reviewTally(marks, path)) - judged(shown));
}

export function markedNotice(mark: VerdictMark, talkKey: string): string {
  const line = verdictLine(mark);
  return mark.verdict === "drop"
    ? `${line} · a mark only, the file still has it · ${talkKey} asks the agent to take it out`
    : line;
}

export function fileTallyLine(marks: readonly VerdictMark[], path: string): string | undefined {
  const tally = reviewTally(marks, path);
  const words = (["keep", "drop", "ask"] as const).flatMap((verdict) =>
    tally[verdict] === 0 ? [] : [`${tally[verdict]} ${verdict}`],
  );
  return words.length === 0 ? undefined : words.join(" · ");
}

function judged(tally: ReviewTally): number {
  return tally.keep + tally.drop + tally.ask;
}

function supersededClause(count: number): string {
  return count === 1 ? "1 mark on a hunk since changed" : `${count} marks on hunks since changed`;
}

function counted(count: number, word: string): string {
  return count === 1 ? `1 ${word}` : `${count} ${word}s`;
}
