import type { SessionSummary } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  discardNotice,
  intentFor,
  noLongerTrashedNotice,
  removalNotice,
  restoreNotice,
  sessionsRows,
  trashHeading,
} from "./trash.ts";

const summary: SessionSummary = {
  id: "s1",
  title: "Lights",
  createdAt: "2026-09-07T12:00:00.000Z",
  lastActivityAt: "2026-09-07T12:00:00.000Z",
  messageCount: 2,
};

describe("the trash words", () => {
  it("lists live sessions first and trashed ones only while the trash shows", () => {
    const trashed = { ...summary, id: "s2" };
    expect(sessionsRows([summary], [trashed], false).map((row) => row.kind)).toEqual(["session"]);
    expect(sessionsRows([summary], [trashed], true).map((row) => row.kind)).toEqual([
      "session",
      "trashed",
    ]);
  });

  it("offers removal only on a live row and restore or discard only on a trashed one", () => {
    const live = { kind: "session", summary } as const;
    const trashed = { kind: "trashed", summary } as const;
    const named = () => "Lights";
    expect(intentFor(live, "remove", named)).toEqual({ intent: "remove", summary, name: "Lights" });
    expect(intentFor(live, "restore", named)).toBeUndefined();
    expect(intentFor(trashed, "discard", named)).toEqual({
      intent: "discard",
      summary,
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
    expect(trashHeading(true, 1, "shift+x")).toBe("trash · 1 session");
    expect(trashHeading(true, 0, "shift+x")).toBe("trash");
  });
});
