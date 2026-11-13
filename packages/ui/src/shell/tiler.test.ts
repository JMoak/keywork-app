import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { Screen } from "../layout/index.ts";
import { definitionOf, type PaneDefinition, type PaneKind } from "../panes/index.ts";
import {
  createTiler,
  type PaneDefinitions,
  type PaneSpec,
  parseTilerState,
  shelfNotices,
} from "./tiler.ts";

const sessionsPaneId = "tree-1";
const sessions: PaneSpec = { kind: "tree" };
const conversation = (sessionId?: string): PaneSpec => ({ kind: "conversation", sessionId });

const screen: Screen = { width: 1600, height: 1000 };

function withTiler<T>(
  body: (tiler: ReturnType<typeof createTiler>) => T,
  definitions: PaneDefinitions = definitionOf,
): T {
  return createRoot((dispose) => {
    const result = body(createTiler(undefined, definitions));
    dispose();
    return result;
  });
}

type Revision = (definition: PaneDefinition<PaneSpec>) => PaneDefinition<PaneSpec>;

function withDefinitions(revisions: Partial<Record<PaneKind, Revision>>): PaneDefinitions {
  return (kind) => {
    const revise = revisions[kind];
    return revise === undefined ? definitionOf(kind) : revise(definitionOf(kind));
  };
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

  it("summons a main pane once per spec and focuses it thereafter, opening another only for a different spec", () => {
    withTiler((tiler) => {
      tiler.open(conversation("s1"), screen);
      expect(tiler.summon({ kind: "stead" }, screen).ok).toBe(true);
      tiler.focus("conversation-1");
      expect(tiler.summon({ kind: "stead" }, screen).ok).toBe(true);
      expect(tiler.panes().filter((id) => id.startsWith("stead"))).toHaveLength(1);
      expect(tiler.focused()).toBe("stead-1");
      expect(tiler.summon(conversation("s1"), screen).ok).toBe(true);
      expect(tiler.focused()).toBe("conversation-1");
      expect(tiler.summon(conversation("s2"), screen).ok).toBe(true);
      expect(tiler.panes().filter((id) => id.startsWith("conversation"))).toHaveLength(2);
    });
  });

  it("opens another pane when a summon that asks for it comes from a pane of its own kind", () => {
    const shells = withDefinitions({
      terminal: (definition) =>
        definition.summon === undefined
          ? definition
          : { ...definition, summon: { ...definition.summon, again: "opens-another" } },
    });
    withTiler((tiler) => {
      const shell: PaneSpec = { kind: "terminal", mode: "shell" };
      tiler.open(conversation("s1"), screen);
      expect(tiler.summon(shell, screen).ok).toBe(true);
      tiler.focus("conversation-1");
      expect(tiler.summon(shell, screen).ok).toBe(true);
      expect(tiler.panes().filter((id) => id.startsWith("terminal"))).toEqual(["terminal-1"]);
      expect(tiler.summon(shell, screen).ok).toBe(true);
      expect(tiler.panes().filter((id) => id.startsWith("terminal"))).toEqual([
        "terminal-1",
        "terminal-2",
      ]);
      expect(tiler.focused()).toBe("terminal-2");
    }, shells);
  });

  it("finds the pane already showing a summon's subject and moves it to the new view", () => {
    const byPath = withDefinitions({
      file: (definition) => ({
        ...definition,
        subject: (spec) => (spec.kind === "file" ? [spec.path, spec.spill] : spec),
      }),
    });
    withTiler((tiler) => {
      tiler.open(conversation("s1"), screen);
      tiler.summon({ kind: "file", path: "src/long.ts", from: 100, to: 160 }, screen);
      tiler.focus("conversation-1");
      expect(tiler.summon({ kind: "file", path: "src/long.ts" }, screen).ok).toBe(true);
      expect(tiler.panes().filter((id) => id.startsWith("file"))).toEqual(["file-1"]);
      expect(tiler.spec("file-1")).toEqual({ kind: "file", path: "src/long.ts" });
      expect(tiler.focused()).toBe("file-1");
      tiler.summon({ kind: "file", path: "src/math.ts" }, screen);
      expect(tiler.panes().filter((id) => id.startsWith("file"))).toHaveLength(2);
    }, byPath);
  });

  it("knows the last focused pane of a kind, and moves focus by the rects another view shows", () => {
    withTiler((tiler) => {
      tiler.summon(sessions, screen);
      tiler.open(conversation("s1"), screen);
      tiler.open(conversation("s2"), screen);
      tiler.focus("conversation-1");
      tiler.focus(sessionsPaneId);
      expect(tiler.lastFocusedOf("conversation")).toBe("conversation-1");
      const mirrored = new Map([
        [sessionsPaneId, { x: 1200, y: 0, width: 400, height: 1000 }],
        ["conversation-1", { x: 0, y: 0, width: 1200, height: 1000 }],
      ]);
      expect(tiler.focusShownToward("left", screen, mirrored).ok).toBe(true);
      expect(tiler.focused()).toBe("conversation-1");
      expect(tiler.focusShownToward("left", screen, mirrored)).toEqual({
        ok: false,
        refused: "nothing-to-do",
      });
      const conversationAlone = new Map([
        ["conversation-1", { x: 0, y: 0, width: 1600, height: 1000 }],
      ]);
      expect(tiler.focusShownToward("left", screen, conversationAlone).ok).toBe(true);
      expect(tiler.focused()).toBe(sessionsPaneId);
    });
  });

  it("retargets an open pane with summon variants and leaves the others' specs alone", () => {
    withTiler((tiler) => {
      tiler.open(conversation("s1"), screen);
      tiler.summon({ kind: "themes" }, screen);
      tiler.summon({ kind: "tree", sessionId: "s1" }, screen);
      tiler.focus("conversation-1");
      const dressPane: PaneSpec = {
        kind: "themes",
        target: { kind: "pane", id: "conversation-1" },
      };
      expect(tiler.summon(dressPane, screen).ok).toBe(true);
      expect(tiler.summon(sessions, screen).ok).toBe(true);
      expect(tiler.spec("themes-1")).toEqual(dressPane);
      expect(tiler.spec(sessionsPaneId)).toEqual({ kind: "tree", sessionId: "s1" });
      expect(tiler.panes().filter((id) => id.startsWith("themes"))).toHaveLength(1);
      expect(tiler.focused()).toBe(sessionsPaneId);
    });
  });

  it("retargets the open pane of the kind when a summon names its target", () => {
    withTiler((tiler) => {
      tiler.open(conversation("s1"), screen);
      tiler.summon({ kind: "workshop" }, screen);
      tiler.bind("workshop-1", { kind: "workshop", creature: "bea" });
      tiler.focus("conversation-1");
      expect(tiler.summon({ kind: "workshop", creature: "osk" }, screen, "osk").ok).toBe(true);
      expect(tiler.panes().filter((id) => id.startsWith("workshop"))).toEqual(["workshop-1"]);
      expect(tiler.spec("workshop-1")).toEqual({ kind: "workshop", creature: "osk" });
      expect(tiler.focused()).toBe("workshop-1");
      expect(tiler.summon(conversation("s2"), screen, "s2").ok).toBe(true);
      expect(tiler.panes().filter((id) => id.startsWith("conversation"))).toEqual([
        "conversation-1",
      ]);
      expect(tiler.spec("conversation-1")).toEqual(conversation("s2"));
      expect(tiler.focused()).toBe("conversation-1");
    });
  });

  it("focuses a pane already showing the named target and retargets the newest of the kind otherwise", () => {
    withTiler((tiler) => {
      tiler.open(conversation("s1"), screen);
      tiler.open(conversation("s2"), screen);
      expect(tiler.summon(conversation("s1"), screen, "s1").ok).toBe(true);
      expect(tiler.focused()).toBe("conversation-1");
      expect(tiler.spec("conversation-2")).toEqual(conversation("s2"));
      expect(tiler.summon(conversation("s3"), screen, "s3").ok).toBe(true);
      expect(tiler.spec("conversation-1")).toEqual(conversation("s3"));
      expect(tiler.spec("conversation-2")).toEqual(conversation("s2"));
      expect(tiler.summon(conversation("s4"), screen, " ").ok).toBe(true);
      expect(tiler.summon(conversation("s5"), screen).ok).toBe(true);
      expect(tiler.panes().filter((id) => id.startsWith("conversation"))).toHaveLength(4);
    });
  });

  it("hands a screen pane every named summon, so an ended pane hears the request again", () => {
    withTiler((tiler) => {
      const view: PaneSpec = { kind: "screen", peer: "moak-main" };
      const control: PaneSpec = { kind: "screen", peer: "moak-main", control: true };
      tiler.summon(view, screen, "moak-main");
      expect(tiler.summon(control, screen, "moak-main control").ok).toBe(true);
      expect(tiler.panes().filter((id) => id.startsWith("screen"))).toEqual(["screen-1"]);
      expect(tiler.spec("screen-1")).toBe(control);
      const again: PaneSpec = { kind: "screen", peer: "moak-main", control: true };
      tiler.summon(again, screen, "moak-main control");
      expect(tiler.spec("screen-1")).toBe(again);
    });
  });

  it("turns a docked pane that follows a session to the session it is summoned from", () => {
    withTiler((tiler) => {
      tiler.open(conversation("s1"), screen);
      tiler.summon({ kind: "diff", sessionId: undefined }, screen);
      expect(tiler.spec("diff-1")).toEqual({ kind: "diff", sessionId: undefined });
      tiler.focus("conversation-1");
      expect(tiler.summon({ kind: "diff", sessionId: "s1" }, screen).ok).toBe(true);
      expect(tiler.panes().filter((id) => id.startsWith("diff"))).toEqual(["diff-1"]);
      expect(tiler.spec("diff-1")).toEqual({ kind: "diff", sessionId: "s1" });
      expect(tiler.focused()).toBe("diff-1");
      tiler.bind("diff-1", { kind: "diff", sessionId: "s1", path: "notes/largest.md" });
      tiler.summon({ kind: "diff", sessionId: "s1" }, screen);
      expect(tiler.spec("diff-1")).toEqual({
        kind: "diff",
        sessionId: "s1",
        path: "notes/largest.md",
      });
      tiler.summon({ kind: "diff", sessionId: undefined }, screen);
      expect(tiler.spec("diff-1")).toEqual({
        kind: "diff",
        sessionId: "s1",
        path: "notes/largest.md",
      });
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
  const filled = (tiler: ReturnType<typeof createTiler>, room: Screen): void => {
    tiler.summon(sessions, room);
    while (tiler.open(conversation(), room).notice === undefined);
    tiler.closeFocused();
  };

  it("seats one pane more than the stage shows and says one waits on the shelf", () => {
    withTiler((tiler) => {
      filled(tiler, screen);
      const showing = tiler.slots(screen).length;
      expect(tiler.shelf(screen)).toEqual([]);
      expect(tiler.open(conversation("one more"), screen)).toEqual({
        ok: true,
        notice: shelfNotices.tucked(1),
      });
      expect(tiler.slots(screen)).toHaveLength(showing);
      expect(tiler.shelf(screen).map((entry) => entry.why)).toEqual(["tucked"]);
      expect(tiler.closeFocused()).toEqual({ ok: true });
      expect(tiler.shelf(screen)).toEqual([]);
      expect(tiler.slots(screen)).toHaveLength(showing);
    });
  });

  it("docks a pane the stage cannot show beside the rest and says what waits", () => {
    withTiler((tiler) => {
      const narrow = { width: 1000, height: 600 };
      filled(tiler, narrow);
      const docked = tiler.dock("right", narrow);
      expect(docked).toEqual({ ok: true, notice: shelfNotices.tucked(1) });
      expect(tiler.layout.dockSideOf(tiler.focused() as string)).toBe("right");
      expect(tiler.slots(narrow).some((slot) => slot.focused)).toBe(true);
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

describe("floats, the shelf and pins", () => {
  const three = (tiler: ReturnType<typeof createTiler>): void => {
    tiler.open(conversation("s1"), screen);
    tiler.open(conversation("s2"), screen);
    tiler.open(conversation("s3"), screen);
  };

  it("marks a floating slot with its place in the stack and lets the tiling close under it", () => {
    withTiler((tiler) => {
      three(tiler);
      expect(tiler.float(screen)).toEqual({ ok: true });
      const slots = tiler.slots(screen);
      expect(slots.find((slot) => slot.id === "conversation-3")?.floating).toEqual({ z: 1 });
      expect(slots.filter((slot) => slot.floating === undefined).map((slot) => slot.id)).toEqual([
        "conversation-1",
        "conversation-2",
      ]);
      expect(tiler.float(screen)).toEqual({ ok: true });
      expect(tiler.slots(screen).every((slot) => slot.floating === undefined)).toBe(true);
    });
  });

  it("shelves the focused pane, lists it with its spec, and brings it back on summon", () => {
    withTiler((tiler) => {
      three(tiler);
      expect(tiler.shelve()).toEqual({ ok: true });
      expect(tiler.focused()).toBe("conversation-2");
      expect(tiler.slots(screen).map((slot) => slot.id)).toEqual([
        "conversation-1",
        "conversation-2",
      ]);
      expect(tiler.shelf(screen)).toEqual([
        {
          id: "conversation-3",
          spec: conversation("s3"),
          why: "shelved",
          pinned: false,
          spawnRank: 2,
        },
      ]);
      expect(tiler.summon(conversation("s3"), screen).ok).toBe(true);
      expect(tiler.focused()).toBe("conversation-3");
      expect(tiler.shelf(screen)).toEqual([]);
    });
  });

  it("says why a verb did nothing: the last pane stays, the shelf is empty, nothing floats", () => {
    withTiler((tiler) => {
      tiler.open(conversation("s1"), screen);
      expect(tiler.shelve()).toMatchObject({ ok: false, notice: shelfNotices.lastPaneStays });
      expect(tiler.returnFromShelf(screen)).toMatchObject({
        ok: false,
        notice: shelfNotices.empty,
      });
      expect(tiler.focusAcrossLayers(screen)).toMatchObject({
        ok: false,
        notice: shelfNotices.nothingFloats,
      });
    });
  });

  it("pins and unpins the focused pane, says which, and carries the pin on its slot", () => {
    withTiler((tiler) => {
      three(tiler);
      expect(tiler.pin()).toEqual({ ok: true, notice: shelfNotices.pinned });
      expect(tiler.slots(screen).find((slot) => slot.focused)?.pinned).toBe(true);
      expect(tiler.pin()).toEqual({ ok: true, notice: shelfNotices.unpinned });
      expect(tiler.slots(screen).find((slot) => slot.focused)?.pinned).toBeUndefined();
    });
  });

  it("restores floats, the shelf and pins from a snapshot", () => {
    const snapshot = withTiler((tiler) => {
      three(tiler);
      tiler.pin();
      tiler.float(screen);
      tiler.focus("conversation-1");
      tiler.shelve();
      return JSON.parse(JSON.stringify(tiler.snapshot()));
    });
    createRoot((dispose) => {
      const restored = createTiler(parseTilerState(snapshot));
      expect(restored.shelf(screen).map((entry) => entry.id)).toEqual(["conversation-1"]);
      const floating = restored.slots(screen).find((slot) => slot.floating !== undefined);
      expect(floating).toMatchObject({ id: "conversation-3", pinned: true });
      dispose();
    });
  });
});

describe("a full stage", () => {
  const filledAroundAKnownSession = (tiler: ReturnType<typeof createTiler>): void => {
    tiler.summon(sessions, screen);
    tiler.open(conversation("known"), screen);
    let filler = 0;
    while (tiler.open(conversation(`filler-${filler}`), screen).notice === undefined) filler += 1;
    tiler.closeFocused();
    tiler.focus(sessionsPaneId);
  };

  it("says a pane that would send another to the shelf crowds the stage", () => {
    withTiler((tiler) => {
      filledAroundAKnownSession(tiler);
      expect(tiler.shelf(screen)).toEqual([]);
      expect(tiler.crowds(conversation("one more"), screen)).toBe(true);
      expect(tiler.shelf(screen)).toEqual([]);
    });
  });

  it("does not count a summon that only focuses a pane already open", () => {
    withTiler((tiler) => {
      filledAroundAKnownSession(tiler);
      expect(tiler.crowds(conversation("known"), screen)).toBe(false);
      expect(tiler.crowds(sessions, screen)).toBe(false);
    });
  });

  it("stops crowding once a pane closes", () => {
    withTiler((tiler) => {
      filledAroundAKnownSession(tiler);
      const closing = tiler.findPane((spec) => spec.kind === "conversation");
      expect(tiler.close(closing as string).ok).toBe(true);
      expect(tiler.crowds(conversation("one more"), screen)).toBe(false);
    });
  });
});
