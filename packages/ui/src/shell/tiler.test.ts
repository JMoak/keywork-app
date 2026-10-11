import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { Screen } from "../layout/index.ts";
import { createTiler, type PaneSpec, parseTilerState } from "./tiler.ts";

const sessionsPaneId = "tree-1";
const sessions: PaneSpec = { kind: "tree" };
const conversation = (sessionId?: string): PaneSpec => ({ kind: "conversation", sessionId });

const screen: Screen = { width: 1600, height: 1000 };

function withTiler<T>(body: (tiler: ReturnType<typeof createTiler>) => T): T {
  return createRoot((dispose) => {
    const result = body(createTiler());
    dispose();
    return result;
  });
}

describe("createTiler", () => {
  it("docks the sessions pane left and opens conversations beside the focused conversation", () => {
    withTiler((tiler) => {
      expect(tiler.summon(sessions, screen).ok).toBe(true);
      expect(tiler.open(conversation("s1"), screen).ok).toBe(true);
      expect(tiler.open(conversation("s2"), screen).ok).toBe(true);
      const slots = tiler.slots(screen);
      expect(slots.map((slot) => slot.id)).toEqual([
        sessionsPaneId,
        "conversation-1",
        "conversation-2",
      ]);
      expect(tiler.layout.dockSideOf(sessionsPaneId)).toBe("left");
      expect(slots.find((slot) => slot.id === "conversation-2")?.focused).toBe(true);
      expect(tiler.focusedSpec()).toEqual({ kind: "conversation", sessionId: "s2" });
    });
  });

  it("opens the next conversation beside the last conversation even when the sessions pane is focused", () => {
    withTiler((tiler) => {
      tiler.summon(sessions, screen);
      tiler.open(conversation("s1"), screen);
      tiler.focus(sessionsPaneId);
      expect(tiler.open(conversation("s2"), screen).ok).toBe(true);
      expect(tiler.layout.dockSideOf("conversation-2")).toBeUndefined();
      const rects = tiler.layout.rects(screen);
      expect(rects.get("conversation-1")?.width).toBe(rects.get("conversation-2")?.width);
    });
  });

  it("rebinds a pane's spec within its kind and bumps its version so views re-render", () => {
    withTiler((tiler) => {
      tiler.open(conversation(undefined), screen);
      const before = tiler.version();
      tiler.bind("conversation-1", conversation("s9"));
      expect(tiler.version()).toBeGreaterThan(before);
      expect(tiler.spec("conversation-1")).toEqual({ kind: "conversation", sessionId: "s9" });
      tiler.bind(sessionsPaneId, conversation("s9"));
      expect(tiler.spec(sessionsPaneId)).toBeUndefined();
    });
  });

  it("revives a layout saved with the old sessions pane as the tree pane", () => {
    const saved = withTiler((tiler) => {
      tiler.summon(sessions, screen);
      tiler.open(conversation("s1"), screen);
      return JSON.stringify(tiler.snapshot()).replaceAll("tree-1", "sessions-1");
    });
    const legacy = JSON.parse(saved.replace('{"kind":"tree"}', '{"kind":"sessions"}'));
    createRoot((dispose) => {
      const revived = createTiler(parseTilerState(legacy));
      expect(revived.panes()).toEqual(["sessions-1", "conversation-1"]);
      expect(revived.spec("sessions-1")).toEqual({ kind: "tree" });
      expect(revived.summon(sessions, screen).ok).toBe(true);
      expect(revived.panes().filter((id) => id.endsWith("-1"))).toHaveLength(2);
      expect(revived.focused()).toBe("sessions-1");
      dispose();
    });
  });

  it("summons the sessions pane once and focuses it thereafter", () => {
    withTiler((tiler) => {
      tiler.open(conversation("s1"), screen);
      expect(tiler.summon(sessions, screen).ok).toBe(true);
      tiler.focus("conversation-1");
      expect(tiler.summon(sessions, screen).ok).toBe(true);
      expect(tiler.panes().filter((id) => id === sessionsPaneId)).toHaveLength(1);
      expect(tiler.focused()).toBe(sessionsPaneId);
    });
  });

  it("round-trips its snapshot and drops panes whose spec is missing", () => {
    const snapshot = withTiler((tiler) => {
      tiler.summon(sessions, screen);
      tiler.open(conversation("s1"), screen);
      tiler.open(conversation("s2"), screen);
      return JSON.parse(JSON.stringify(tiler.snapshot()));
    });
    const parsed = parseTilerState(snapshot);
    expect(parsed).toBeDefined();
    createRoot((dispose) => {
      const revived = createTiler(parsed);
      expect(revived.panes()).toEqual([sessionsPaneId, "conversation-1", "conversation-2"]);
      expect(revived.open(conversation("s3"), screen).ok).toBe(true);
      expect(revived.panes()).toContain("conversation-3");
      dispose();
    });
    const orphaned = { ...snapshot, specs: { [sessionsPaneId]: { kind: "sessions" } } };
    createRoot((dispose) => {
      const revived = createTiler(parseTilerState(orphaned));
      expect(revived.panes()).toEqual([sessionsPaneId]);
      dispose();
    });
    expect(
      parseTilerState({ layout: snapshot.layout, specs: { x: { kind: "nope" } } }),
    ).toBeUndefined();
    expect(parseTilerState("junk")).toBeUndefined();
  });

  it("resizes only a docked pane's dock and refuses otherwise", () => {
    withTiler((tiler) => {
      tiler.summon(sessions, screen);
      tiler.open(conversation("s1"), screen);
      expect(tiler.resizeDock(0.05, screen)).toEqual({ ok: false, refused: "nothing-to-do" });
      tiler.focus(sessionsPaneId);
      const before = tiler.layout.dockRatio("left");
      expect(tiler.resizeDock(0.05, screen).ok).toBe(true);
      expect(tiler.layout.dockRatio("left")).toBeCloseTo(before + 0.05);
    });
  });
});

describe("refusals in keywork's words", () => {
  const full = (tiler: ReturnType<typeof createTiler>): void => {
    tiler.summon(sessions, screen);
    while (tiler.open(conversation(), screen).ok);
  };

  it("names the full layout when a pane cannot be placed, and still closes on it", () => {
    withTiler((tiler) => {
      full(tiler);
      const crowded = tiler.panes().length;
      expect(tiler.open(conversation("one more"), screen)).toEqual({
        ok: false,
        refused: "no-room",
        notice: "no room for another pane · close or resize one",
      });
      expect(tiler.closeFocused()).toEqual({ ok: true });
      expect(tiler.panes()).toHaveLength(crowded - 1);
      expect(tiler.open(conversation("fits again"), screen).ok).toBe(true);
    });
  });

  it("says which home has no room when a pane cannot move there", () => {
    withTiler((tiler) => {
      const narrow = { width: 1000, height: 600 };
      tiler.summon(sessions, narrow);
      while (tiler.open(conversation(), narrow).ok);
      const refusal = tiler.dock("right", narrow);
      expect(refusal.ok || refusal.notice).toBe(
        "no room in the right dock · close or resize a pane",
      );
    });
  });

  it("says nothing is focused instead of refusing a close silently", () => {
    withTiler((tiler) => {
      expect(tiler.closeFocused()).toEqual({
        ok: false,
        refused: "no-focus",
        notice: "no pane is focused · nothing to close",
      });
    });
  });
});
