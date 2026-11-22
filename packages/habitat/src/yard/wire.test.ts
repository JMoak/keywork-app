import type { Setting } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { minute } from "../clock/clock.ts";
import { coldStart } from "../world/cold-start.ts";
import { project, projectAll } from "../world/project.ts";
import { emptyHabitat, type HabitatState } from "../world/types.ts";
import { aSetting, isoAt, noon, proposed, settled } from "./testing.ts";
import { belongsTo, ownerOf, type YardSetting, yardOf } from "./types.ts";

const later = isoAt(noon + minute);

function showing(
  state: HabitatState,
  changes: Readonly<Record<string, Partial<YardSetting>>>,
): HabitatState {
  const yard = yardOf(state);
  const settings = Object.fromEntries(
    Object.entries(yard.settings).map(([id, held]) => [id, { ...held, ...changes[id] }]),
  );
  return { ...state, yard: { ...yard, settings } };
}

function shownIn(state: HabitatState): Record<string, string> {
  return Object.fromEntries(
    Object.values(yardOf(state).settings).map((setting) => [setting.id, setting.state]),
  );
}

describe("show settings in the habitat", () => {
  it("leaves the yard absent until something is set out, so no existing record widens", () => {
    expect(emptyHabitat().yard).toBeUndefined();
    const listed = project(emptyHabitat(), { type: "keeper.show", ts: later, settings: [] });
    expect(listed.yard).toBeUndefined();
  });

  it("raises and lowers a setting's signal in place, taking the reason and the hold it came with", () => {
    const decided = showing(
      project(emptyHabitat(), proposed(1, aSetting({ id: "a", until: "rests" }))),
      { a: { shown: "card", depth: 2 } },
    );
    const changed = (state: HabitatState, setting: Setting): HabitatState =>
      project(state, {
        id: 2,
        ts: later,
        sessionId: setting.sessionId,
        type: "show.changed",
        payload: { setting },
      });
    const reason = "the release is half applied";

    const raised = changed(
      decided,
      aSetting({ id: "a", signal: "critical", why: reason, until: "seen" }),
    );
    expect(yardOf(raised).settings.a).toMatchObject({
      shown: "card",
      depth: 2,
      signal: "critical",
      why: reason,
      until: "seen",
    });
    const lowered = changed(raised, aSetting({ id: "a", why: reason, until: "seen" }));
    expect(yardOf(lowered).settings.a).not.toHaveProperty("signal");
    expect(yardOf(lowered).settings.a).toMatchObject({ why: reason, until: "seen" });
  });

  it("attaches a setting with no creature to its thread, and keeps it apart from other threads", () => {
    const loose = (id: string, sessionId: string): Setting =>
      aSetting({ id, creature: null, sessionId, what: { kind: "file", ref: "a.ts" } });
    const state = projectAll(emptyHabitat(), [
      proposed(1, loose("a", "t1")),
      proposed(2, loose("b", "t2")),
    ]);
    expect(state.threads.t1).toMatchObject({ id: "t1", creature: undefined });
    expect(state.threads.t2).toBeDefined();
    expect(Object.keys(yardOf(state).settings).sort()).toEqual(["a", "b"]);
  });

  it("tells whose node a setting belongs to: its creature's, or its thread's when it has none", () => {
    const loose = aSetting({ creature: null, sessionId: "t1" });
    expect(ownerOf(aSetting())).toEqual({ kind: "creature", slug: "bea" });
    expect(ownerOf(loose)).toEqual({ kind: "thread", sessionId: "t1" });
    expect(belongsTo(loose, { kind: "thread", sessionId: "t1" })).toBe(true);
    expect(belongsTo(loose, { kind: "thread", sessionId: "t2" })).toBe(false);
    expect(belongsTo(aSetting({ sessionId: "t1" }), { kind: "thread", sessionId: "t1" })).toBe(
      false,
    );
    expect(belongsTo(loose, { kind: "creature", slug: "bea" })).toBe(false);
  });

  it("settles each outcome the way the server does: only a pinned setting stays out", () => {
    const note = (id: string): Setting =>
      aSetting({ id, until: "rests", what: { kind: "note", ref: `note ${id}` } });
    const start = projectAll(
      emptyHabitat(),
      ["s", "p", "d", "w"].map((id, index) => proposed(index + 1, note(id))),
    );
    const unfold = { shown: "unfold" } as const;
    const unfolded = showing(start, { s: unfold, p: unfold, d: unfold, w: unfold });
    const after = projectAll(unfolded, [
      settled(5, later, "s1", { id: "s", outcome: "seen", by: "keeper" }),
      settled(6, later, "s1", { id: "p", outcome: "pinned", by: "keeper" }),
      settled(7, later, "s1", { id: "d", outcome: "dismissed", by: "keeper" }),
      settled(8, later, "s1", { id: "w", outcome: "withdrawn", by: "time" }),
    ]);
    expect(shownIn(after)).toEqual({ p: "pinned" });
    expect(yardOf(after).settings.p).toMatchObject({
      shown: "unfold",
      pinnedAt: later,
      seenAt: later,
    });
    const unpinned = project(
      after,
      settled(9, isoAt(noon + 2 * minute), "s1", { id: "p", outcome: "unpinned", by: "keeper" }),
    );
    expect(shownIn(unpinned)).toEqual({});
  });
});

describe("keeper.show seats GET /show rows on cold start", () => {
  const rows: readonly Setting[] = [
    aSetting({ id: "a" }),
    aSetting({ id: "b", state: "pinned", what: { kind: "diff", ref: "cs-1" } }),
    aSetting({ id: "c", state: "seen", until: "rests", what: { kind: "report", ref: "r-1" } }),
    aSetting({ id: "d", state: "dismissed", what: { kind: "url", ref: "https://example.com" } }),
    aSetting({ id: "e", state: "seen", until: "seen", what: { kind: "note", ref: "done" } }),
  ];

  it("seats the live rows from a cold start and from the notice alike", () => {
    const cold = coldStart({ at: later, sessions: [], settings: rows });
    expect(shownIn(cold)).toEqual({ a: "live", b: "pinned" });
    expect(yardOf(cold).settings.b).toMatchObject({ shown: "glyph", pinnedAt: rows[1]?.at });
    const noticed = project(emptyHabitat(), { type: "keeper.show", ts: later, settings: rows });
    expect(noticed.yard).toEqual(cold.yard);
  });

  it("drops what the listing no longer has, unless it arrived after the listing", () => {
    const live = projectAll(emptyHabitat(), [
      proposed(1, aSetting({ id: "old", what: { kind: "file", ref: "x" } })),
      proposed(
        2,
        aSetting({ id: "new", at: isoAt(noon + 2 * minute), what: { kind: "file", ref: "y" } }),
      ),
    ]);
    const listed = project(live, {
      type: "keeper.show",
      ts: later,
      settings: [aSetting({ id: "a" })],
    });
    expect(Object.keys(yardOf(listed).settings).sort()).toEqual(["a", "new"]);
  });

  it("agrees with the live wire once the wire has had its say", () => {
    const stream = [
      proposed(1, aSetting({ id: "a" })),
      proposed(2, aSetting({ id: "b", what: { kind: "diff", ref: "cs-1" } })),
      proposed(3, aSetting({ id: "c", until: "rests", what: { kind: "report", ref: "r-1" } })),
      settled(4, later, "s1", { id: "b", outcome: "pinned", by: "keeper" }),
      settled(5, later, "s1", { id: "c", outcome: "seen", by: "keeper" }),
      settled(6, later, "s1", { id: "a", outcome: "seen", by: "keeper" }),
    ];
    const live = projectAll(emptyHabitat(), stream);
    const listing = Object.values(yardOf(live).settings).map(
      ({ shown: _shown, depth: _depth, seenAt: _seenAt, pinnedAt: _pinnedAt, ...row }) => row,
    );
    const cold = coldStart({ at: isoAt(noon + 5 * minute), sessions: [], settings: listing });
    expect(shownIn(cold)).toEqual(shownIn(live));
  });
});
