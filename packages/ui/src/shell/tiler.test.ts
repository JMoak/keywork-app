import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { Screen } from "../layout/index.ts";
import { createTiler, parseTilerState, sessionsPaneId } from "./tiler.ts";

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
      expect(tiler.summonSessions(screen).ok).toBe(true);
      expect(tiler.openConversation("s1", screen).ok).toBe(true);
      expect(tiler.openConversation("s2", screen).ok).toBe(true);
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
      tiler.summonSessions(screen);
      tiler.openConversation("s1", screen);
      tiler.focus(sessionsPaneId);
      expect(tiler.openConversation("s2", screen).ok).toBe(true);
      expect(tiler.layout.dockSideOf("conversation-2")).toBeUndefined();
      const rects = tiler.layout.rects(screen);
      expect(rects.get("conversation-1")?.width).toBe(rects.get("conversation-2")?.width);
    });
  });

  it("binds a session into an unbound pane and bumps its version so views re-render", () => {
    withTiler((tiler) => {
      tiler.openConversation(undefined, screen);
      const before = tiler.version();
      tiler.bindSession("conversation-1", "s9");
      expect(tiler.version()).toBeGreaterThan(before);
      expect(tiler.spec("conversation-1")).toEqual({ kind: "conversation", sessionId: "s9" });
      tiler.bindSession(sessionsPaneId, "s9");
      expect(tiler.spec(sessionsPaneId)).toBeUndefined();
    });
  });

  it("summons the sessions pane once and focuses it thereafter", () => {
    withTiler((tiler) => {
      tiler.openConversation("s1", screen);
      expect(tiler.summonSessions(screen).ok).toBe(true);
      tiler.focus("conversation-1");
      expect(tiler.summonSessions(screen).ok).toBe(true);
      expect(tiler.panes().filter((id) => id === sessionsPaneId)).toHaveLength(1);
      expect(tiler.focused()).toBe(sessionsPaneId);
    });
  });

  it("round-trips its snapshot and drops panes whose spec is missing", () => {
    const snapshot = withTiler((tiler) => {
      tiler.summonSessions(screen);
      tiler.openConversation("s1", screen);
      tiler.openConversation("s2", screen);
      return JSON.parse(JSON.stringify(tiler.snapshot()));
    });
    const parsed = parseTilerState(snapshot);
    expect(parsed).toBeDefined();
    createRoot((dispose) => {
      const revived = createTiler(parsed);
      expect(revived.panes()).toEqual([sessionsPaneId, "conversation-1", "conversation-2"]);
      expect(revived.openConversation("s3", screen).ok).toBe(true);
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
      tiler.summonSessions(screen);
      tiler.openConversation("s1", screen);
      expect(tiler.resizeDock(0.05, screen)).toEqual({ ok: false, refused: "nothing-to-do" });
      tiler.focus(sessionsPaneId);
      const before = tiler.layout.dockRatio("left");
      expect(tiler.resizeDock(0.05, screen).ok).toBe(true);
      expect(tiler.layout.dockRatio("left")).toBeCloseTo(before + 0.05);
    });
  });
});
