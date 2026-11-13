import type { BusEnvelope, SessionDetail, VerdictMark } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { historyEnvelopes } from "./history.ts";
import { projectAll } from "./project.ts";
import {
  emptyReview,
  hunkDigest,
  hunkHeader,
  hunkReference,
  latestVerdicts,
  openAsks,
  reviewMarked,
  reviewNotice,
  reviewSnapshot,
  reviewState,
  reviewTally,
  reviewVerdictOf,
  verdictFor,
  verdictLine,
} from "./review.ts";
import { emptyProjection } from "./types.ts";

const at = "2026-11-06T10:00:00.000Z";

const kept: VerdictMark = {
  index: 1,
  entryId: "v1",
  at,
  path: "src/a.ts",
  header: "@@ -1,3 +1,4 @@",
  digest: "a1b2c3d4",
  verdict: "keep",
};

const asked: VerdictMark = { ...kept, entryId: "v2", digest: "0f0f0f0f", verdict: "ask" };

const dropped: VerdictMark = { ...kept, entryId: "v3", index: 2, verdict: "drop" };

function noticeEnvelope(mark: VerdictMark, id = 1, replay = false): BusEnvelope {
  return {
    id,
    ts: at,
    sessionId: "s1",
    type: "extension.notice",
    payload: { ...reviewNotice(mark), ...(replay && { replay }) },
  };
}

describe("the review trail", () => {
  it("folds review notices once each, live or replayed, and ignores other extensions", () => {
    let state = reviewState(emptyReview, noticeEnvelope(kept));
    state = reviewState(state, noticeEnvelope(kept, 2, true));
    state = reviewState(state, noticeEnvelope(asked, 3));
    state = reviewState(state, {
      id: 4,
      ts: at,
      sessionId: "s1",
      type: "extension.notice",
      payload: { extension: "creature", level: "info", message: "finished" },
    });
    expect(state.marks).toEqual([kept, asked]);
    expect(reviewMarked(state, dropped).marks).toEqual([kept, asked, dropped]);
    expect(reviewMarked(state, kept).marks).toEqual([kept, asked]);
  });

  it("snapshots the served trail and reads an empty one for a missing session", () => {
    expect(reviewSnapshot({ verdicts: [kept] })).toEqual({ marks: [kept], loaded: true });
    expect(reviewSnapshot("missing")).toEqual({ marks: [], loaded: true });
  });

  it("lets the last word on a hunk stand, tallies by file and lists the open asks", () => {
    const marks = [kept, asked, dropped];
    expect(latestVerdicts(marks).map((mark) => mark.verdict)).toEqual(["drop", "ask"]);
    expect(verdictFor(marks, kept)).toBe("drop");
    expect(verdictFor(marks, { ...kept, path: "other.ts" })).toBeUndefined();
    expect(reviewTally(marks)).toEqual({ keep: 0, drop: 1, ask: 1 });
    expect(reviewTally(marks, "other.ts")).toEqual({ keep: 0, drop: 0, ask: 0 });
    expect(openAsks(marks)).toEqual([asked]);
  });

  it("tallies only the hunks still shown, so a verdict on a hunk that changed since counts for none", () => {
    const marks = [kept, asked, dropped];
    const reshown = { ...kept, digest: "99999999" };
    expect(reviewTally(marks, "src/a.ts", [kept, asked])).toEqual({ keep: 0, drop: 1, ask: 1 });
    expect(reviewTally(marks, "src/a.ts", [reshown, asked])).toEqual({ keep: 0, drop: 0, ask: 1 });
    expect(reviewTally(marks, "src/a.ts", [reshown])).toEqual({ keep: 0, drop: 0, ask: 0 });
    expect(reviewTally(marks, "src/a.ts", [])).toEqual({ keep: 0, drop: 0, ask: 0 });
  });

  it("reads the mark out of a notice only when it has the whole shape", () => {
    expect(reviewVerdictOf(reviewNotice(kept))).toEqual(kept);
    expect(
      reviewVerdictOf({ extension: "review", level: "info", message: "x", detail: { verdict: 1 } }),
    ).toBeUndefined();
    expect(reviewVerdictOf({ extension: "creature", level: "info", message: "x" })).toBeUndefined();
  });

  it("digests the changed lines so the reference survives the hunk moving", () => {
    const digest = hunkDigest(["two"], ["2", "two and a half"]);
    expect(digest).toMatch(/^[0-9a-f]{8}$/);
    expect(hunkDigest(["two"], ["2", "two and a half"])).toBe(digest);
    expect(hunkDigest(["two"], ["2"])).not.toBe(digest);
    expect(hunkDigest([], [])).toMatch(/^[0-9a-f]{8}$/);
    expect(hunkHeader({ from: 1, count: 1 }, { from: 1, count: 2 })).toBe("@@ -2,1 +2,2 @@");
    expect(hunkHeader({ from: 3, count: 0 }, { from: 3, count: 1 })).toBe("@@ -3,0 +4,1 @@");
    expect(hunkReference("src/a.ts", "@@ -2,1 +2,2 @@", ["two"], ["2", "two and a half"])).toEqual({
      path: "src/a.ts",
      header: "@@ -2,1 +2,2 @@",
      digest,
    });
  });

  it("words the trail line the way the server does", () => {
    expect(verdictLine(asked)).toBe("ask · src/a.ts @@ -1,3 +1,4 @@ · hunk 0f0f0f0f");
    expect(reviewNotice(kept)).toEqual({
      extension: "review",
      level: "info",
      message: "keep · src/a.ts @@ -1,3 +1,4 @@ · hunk a1b2c3d4",
      detail: { verdict: kept, entryId: "v1" },
    });
  });

  it("replays the served marks as notices where they fell, live and after a reload", () => {
    const detail: SessionDetail = {
      id: "s1",
      title: "review",
      createdAt: at,
      lastActivityAt: at,
      messageCount: 2,
      cwd: "C:/work",
      live: false,
      asOf: 0,
      messages: [
        { role: "user", parts: [{ type: "text", text: "take the delivery" }] },
        { role: "assistant", parts: [{ type: "text", text: "done" }] },
      ],
      verdicts: [kept, dropped],
    };
    const reloaded = projectAll(emptyProjection, historyEnvelopes(detail));
    expect(reloaded.entries.map((entry) => entry.kind)).toEqual([
      "user",
      "notice",
      "assistant",
      "notice",
    ]);
    expect(reloaded.entries[1]).toMatchObject({ text: verdictLine(kept) });
    expect(reloaded.entries[3]).toMatchObject({ text: verdictLine(dropped) });
    const live = projectAll(emptyProjection, [noticeEnvelope(asked)]);
    expect(live.entries).toEqual([
      { kind: "notice", level: "info", text: verdictLine(asked), entryId: asked.entryId },
    ]);
  });
});
