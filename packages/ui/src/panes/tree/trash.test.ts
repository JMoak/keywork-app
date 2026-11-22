import type { SessionSummary } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import type { SessionsRow } from "./rows.ts";
import { intentFor, purgeIntent, trashQuestion } from "./trash.ts";

const summary: SessionSummary = {
  id: "s1",
  title: "Lights",
  createdAt: "2026-09-07T12:00:00.000Z",
  lastActivityAt: "2026-09-07T12:00:00.000Z",
  messageCount: 2,
};

describe("the trash words", () => {
  it("offers removal only on a live or child row and restore or discard only on a trashed one", () => {
    const live: SessionsRow = {
      kind: "session",
      summary,
      children: 0,
      folded: false,
      parent: undefined,
    };
    const trashed: SessionsRow = { kind: "trashed", summary };
    const child: SessionsRow = {
      kind: "child",
      child: {
        sessionId: "k1",
        parentId: "s1",
        callId: "d1",
        title: "audit",
        bot: undefined,
        state: "completed",
        costNanos: undefined,
      },
    };
    const named = () => "Lights";
    expect(intentFor(live, "remove", named)).toEqual({
      intent: "remove",
      sessionId: "s1",
      name: "Lights",
    });
    expect(intentFor(child, "remove", named)).toMatchObject({ intent: "remove", sessionId: "k1" });
    expect(intentFor(live, "restore", named)).toBeUndefined();
    expect(intentFor(child, "discard", named)).toBeUndefined();
    expect(intentFor(trashed, "discard", named)).toEqual({
      intent: "discard",
      sessionId: "s1",
      name: "Lights",
    });
    expect(intentFor(trashed, "remove", named)).toBeUndefined();
    expect(intentFor(undefined, "remove", named)).toBeUndefined();
  });

  it("asks before emptying the trash, counting what goes, and only when something would", () => {
    const trashed = { ...summary, id: "s2" };
    expect(purgeIntent([])).toBeUndefined();
    expect(purgeIntent([summary, trashed])).toEqual({ intent: "purge", count: 2 });
    expect(trashQuestion({ intent: "purge", count: 2 })).toBe(
      "empty the trash? 2 sessions go for good, there is no undo",
    );
    expect(trashQuestion({ intent: "purge", count: 1 })).toBe(
      "empty the trash? 1 session goes for good, there is no undo",
    );
  });
});
