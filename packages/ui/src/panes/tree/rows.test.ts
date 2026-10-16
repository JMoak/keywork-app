import type { ChildLineage } from "@keywork-app/client";
import type { SessionSummary } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  foldedLine,
  parentLine,
  type SessionsListing,
  type SessionsRow,
  sessionIdOf,
  sessionsRows,
} from "./rows.ts";

const summary = (id: string, title = id): SessionSummary => ({
  id,
  title,
  createdAt: "2026-10-15T12:00:00.000Z",
  lastActivityAt: "2026-10-15T12:00:00.000Z",
  messageCount: 2,
});

const child = (sessionId: string, parentId: string, title = sessionId): ChildLineage => ({
  sessionId,
  parentId,
  callId: `call-${sessionId}`,
  title,
  bot: undefined,
  state: "running",
  costNanos: undefined,
});

function listing(overrides: Partial<SessionsListing> = {}): SessionsListing {
  const known = [child("k1", "p", "audit the trust rules"), child("k2", "p", "count callers")];
  return {
    sessions: [summary("p", "refactor-permissions"), summary("q")],
    trash: [],
    showTrash: false,
    folded: new Set(),
    children: (parentId) => known.filter((line) => line.parentId === parentId),
    childOf: (id) => known.find((line) => line.sessionId === id),
    trashed: () => false,
    nameOf: () => undefined,
    ...overrides,
  };
}

function shape(rows: readonly SessionsRow[]): string[] {
  return rows.map((row) => `${row.kind} ${sessionIdOf(row)}`);
}

describe("the sessions level's rows", () => {
  it("nests each child under its parent in the order it started", () => {
    expect(shape(sessionsRows(listing()))).toEqual([
      "session p",
      "child k1",
      "child k2",
      "session q",
    ]);
    expect(sessionsRows(listing())[0]).toMatchObject({ children: 2, folded: false });
  });

  it("folds a parent to one row that counts its children", () => {
    const rows = sessionsRows(listing({ folded: new Set(["p", "q"]) }));
    expect(shape(rows)).toEqual(["session p", "session q"]);
    expect(rows[0]).toMatchObject({ children: 2, folded: true });
    expect(rows[1]).toMatchObject({ children: 0, folded: false });
    expect(foldedLine(2)).toBe("▸ 2 children");
    expect(foldedLine(1)).toBe("▸ 1 child");
  });

  it("leaves a child out once it went to the trash on its own", () => {
    const rows = sessionsRows(listing({ trashed: (id) => id === "k1" }));
    expect(shape(rows)).toEqual(["session p", "child k2", "session q"]);
    expect(rows[0]).toMatchObject({ children: 1 });
  });

  it("nests a child the server lists on its own under a listed parent rather than twice", () => {
    const rows = sessionsRows(listing({ sessions: [summary("k1"), summary("p"), summary("q")] }));
    expect(shape(rows)).toEqual(["session p", "child k1", "child k2", "session q"]);
  });

  it("lists a child flat with a quiet lineage fact when its parent is trashed or not loaded", () => {
    const trashedParent = sessionsRows(
      listing({
        sessions: [summary("k1"), summary("q")],
        trash: [summary("p", "refactor-permissions")],
        nameOf: (id) => (id === "p" ? "refactor-permissions" : undefined),
      }),
    );
    expect(shape(trashedParent)).toEqual(["session k1", "session q"]);
    expect(trashedParent[0]).toMatchObject({
      parent: { name: "refactor-permissions", trashed: true },
    });
    expect(trashedParent[1]).toMatchObject({ parent: undefined });
    const unloaded = sessionsRows(listing({ sessions: [summary("k2")] }));
    expect(unloaded[0]).toMatchObject({ parent: { name: undefined, trashed: false } });
  });

  it("words the lineage fact for each case", () => {
    expect(parentLine({ name: "refactor-permissions", trashed: true })).toBe(
      "↳ child of refactor-permissions · trashed",
    );
    expect(parentLine({ name: undefined, trashed: true })).toBe("↳ child of a trashed session");
    expect(parentLine({ name: "refactor-permissions", trashed: false })).toBe(
      "↳ child of refactor-permissions · not loaded",
    );
    expect(parentLine({ name: undefined, trashed: false })).toBe("↳ child of a session not loaded");
  });

  it("lists trashed sessions after the live ones only while the trash shows", () => {
    const trash = [summary("t")];
    expect(shape(sessionsRows(listing({ trash })))).not.toContain("trashed t");
    expect(shape(sessionsRows(listing({ trash, showTrash: true }))).at(-1)).toBe("trashed t");
  });
});
