import type { SessionSummary } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import type { SessionsRow } from "./rows.ts";
import {
  alreadyEmptyNotice,
  discardNotice,
  intentFor,
  noLongerTrashedNotice,
  purgeIntent,
  purgeNotice,
  removalNotice,
  restoreNotice,
  trashHeading,
  trashQuestion,
} from "./trash.ts";

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

  it("says what happened, including the refusals, as keywork says it", () => {
    expect(removalNotice("missing", "Lights", "shift+x")).toBe('"Lights" is already gone');
    expect(removalNotice(summary, "Lights", "shift+x")).toBe(
      'removed "Lights" · shift+x shows the trash, memory notes stay',
    );
    expect(restoreNotice("missing")).toBe(noLongerTrashedNotice);
    expect(discardNotice("missing", "Lights")).toBe(noLongerTrashedNotice);
  });

  it("heads the trash with the chord that shows it, then the one that empties it", () => {
    const chords = { show: "shift+x", empty: "shift+d" };
    expect(trashHeading(false, 2, chords)).toBe("trash · shift+x shows it");
    expect(trashHeading(true, 1, chords)).toBe("trash · 1 session · shift+d empties it");
    expect(trashHeading(true, 3, chords)).toBe("trash · 3 sessions · shift+d empties it");
    expect(trashHeading(true, 0, chords)).toBe("trash");
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

  it("says what emptying did with the server's count, and says so when nothing was left", () => {
    expect(purgeNotice({ purged: 2 })).toBe("deleted 2 sessions for good · the trash is empty");
    expect(purgeNotice({ purged: 1 })).toBe("deleted 1 session for good · the trash is empty");
    expect(purgeNotice({ purged: 0 })).toBe(alreadyEmptyNotice);
  });
});
