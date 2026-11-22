import { describe, expect, it } from "vitest";
import type { ScreenRect } from "../surfaces/port.ts";
import type { Rect, Screen } from "./geometry.ts";
import { hitAt, type Seam } from "./hit.ts";
import { Layout } from "./layout.ts";
import { advancePointer, idlePointer, type PointerInput, type PointerState } from "./pointer.ts";
import { floatStep } from "./standing.ts";
import { parseLayoutState } from "./state.ts";
import { minPaneSize } from "./tree.ts";

const screen: Screen = { width: 1600, height: 1000 };
const twoColumns: Screen = { width: minPaneSize.width * 2 + 40, height: 600 };
const oneColumn: Screen = { width: minPaneSize.width + 40, height: 600 };

function opened(ids: readonly string[], at: Screen = screen): Layout {
  const layout = new Layout();
  for (const id of ids) expect(layout.open(id, at).ok).toBe(true);
  return layout;
}

function columns(ids: readonly string[]): Layout {
  return opened(ids, { width: minPaneSize.width * 20, height: minPaneSize.height });
}

function shown(layout: Layout, at: Screen): string[] {
  return [...layout.rects(at).keys()].sort();
}

function tiles(rects: Iterable<Rect>, at: Screen): boolean {
  const area = [...rects].reduce((sum, rect) => sum + rect.width * rect.height, 0);
  return area === at.width * at.height;
}

function revived(layout: Layout): Layout {
  const copy = new Layout();
  copy.load(parseLayoutState(JSON.parse(JSON.stringify(layout.toJSON()))) as never);
  return copy;
}

describe("the fit", () => {
  it("shows what the screen holds and tucks the rest by standing, least recent first", () => {
    const layout = columns(["a", "b", "c"]);
    expect(shown(layout, screen)).toEqual(["a", "b", "c"]);
    expect(shown(layout, twoColumns)).toEqual(["b", "c"]);
    expect(layout.shelved(twoColumns)).toEqual([{ id: "a", why: "tucked" }]);
    expect(shown(layout, oneColumn)).toEqual(["c"]);
    expect(layout.shelved(oneColumn)).toEqual([
      { id: "b", why: "tucked" },
      { id: "a", why: "tucked" },
    ]);
  });

  it("is a projection: the seats, ratios and saved state never change with the screen", () => {
    const layout = columns(["a", "b", "c"]);
    const before = layout.rects(screen);
    const saved = JSON.stringify(layout.toJSON());
    layout.rects(oneColumn);
    layout.shelved(oneColumn);
    expect(JSON.stringify(layout.toJSON())).toBe(saved);
    expect(layout.rects(screen)).toEqual(before);
  });

  it("keeps the shown panes gapless and at their minimum on a screen too small for all", () => {
    const layout = opened(["a", "b", "c", "d", "e"]);
    for (const at of [twoColumns, oneColumn, { width: 700, height: 420 }]) {
      const rects = [...layout.rects(at).values()];
      expect(tiles(rects, at)).toBe(true);
      for (const rect of rects) {
        expect(rect.width).toBeGreaterThanOrEqual(minPaneSize.width);
        expect(rect.height).toBeGreaterThanOrEqual(minPaneSize.height);
      }
    }
  });

  it("brings a tucked pane to the stage when it is focused, tucking the next in line", () => {
    const layout = columns(["a", "b", "c"]);
    expect(layout.focus("a").ok).toBe(true);
    expect(shown(layout, twoColumns)).toEqual(["a", "c"]);
    expect(layout.shelved(twoColumns)).toEqual([{ id: "b", why: "tucked" }]);
  });

  it("holds a pinned pane on the stage ahead of more recent ones", () => {
    const layout = columns(["a", "b", "c"]);
    layout.focus("a");
    expect(layout.pinToggle().ok).toBe(true);
    layout.focus("b");
    layout.focus("c");
    expect(shown(layout, twoColumns)).toEqual(["a", "c"]);
    expect(layout.isPinned("a")).toBe(true);
    layout.focus("a");
    layout.pinToggle();
    layout.focus("b");
    layout.focus("c");
    expect(shown(layout, twoColumns)).toEqual(["b", "c"]);
  });

  it("tucks only what frees the room it lacks, whatever stands lower", () => {
    const layout = opened(["a", "b", "c"]);
    expect(layout.rects(screen).get("b")).toEqual({ x: 800, y: 0, width: 800, height: 500 });
    const short: Screen = { width: 1600, height: minPaneSize.height + 20 };
    expect(shown(layout, short)).toEqual(["a", "c"]);
    expect(layout.shelved(short)).toEqual([{ id: "b", why: "tucked" }]);
  });

  it("resizes the seam between two shown panes when a pane between them is tucked", () => {
    const layout = columns(["a", "b", "c"]);
    layout.focus("a");
    layout.focus("c");
    const roomy: Screen = { width: minPaneSize.width * 2 + 300, height: 600 };
    expect(shown(layout, roomy)).toEqual(["a", "c"]);
    const seams = layout.seams(roomy);
    expect(seams).toHaveLength(1);
    const even = layout.rects(roomy).get("a")?.width;
    expect(layout.resizeSeam((seams[0] as Seam).handle, 0.6, roomy).ok).toBe(true);
    expect(layout.rects(roomy).get("a")?.width).toBeGreaterThan(even as number);
  });

  it("grows the focused pane against its shown neighbour, past a tucked one between", () => {
    const layout = columns(["a", "b", "c"]);
    layout.focus("a");
    layout.focus("c");
    const roomy: Screen = { width: minPaneSize.width * 2 + 300, height: 600 };
    const before = layout.rects(roomy).get("c")?.width as number;
    expect(layout.resizeFocused(0.1, roomy).ok).toBe(true);
    expect(layout.rects(roomy).get("c")?.width).toBeGreaterThan(before);
  });
});

describe("the shelf", () => {
  it("takes a pane off the stage by hand and hands focus to the most recent pane left", () => {
    const layout = opened(["a", "b", "c"]);
    layout.focus("a");
    layout.focus("c");
    expect(layout.shelveFocused().ok).toBe(true);
    expect(layout.focused()).toBe("a");
    expect(shown(layout, screen)).toEqual(["a", "b"]);
    expect(layout.shelved(screen)).toEqual([{ id: "c", why: "shelved" }]);
    expect(tiles(layout.rects(screen).values(), screen)).toBe(true);
  });

  it("returns a shelved pane to the exact seat and ratio it left", () => {
    const layout = opened(["a", "b", "c"]);
    layout.resizeFocused(0.1, screen);
    const before = layout.rects(screen);
    layout.shelveFocused();
    expect(layout.returnFromShelf(screen).ok).toBe(true);
    expect(layout.focused()).toBe("c");
    expect(layout.rects(screen)).toEqual(before);
  });

  it("returns the last pane shelved first, then the best of the tucked", () => {
    const layout = opened(["a", "b", "c", "d"]);
    layout.shelve("a");
    layout.shelve("b");
    expect(layout.returnFromShelf(screen).ok).toBe(true);
    expect(layout.focused()).toBe("b");
    layout.shelve("a");
    layout.focus("d");
    layout.returnFromShelf(oneColumn);
    expect(layout.focused()).toBe("a");
    layout.focus("d");
    expect(layout.returnFromShelf(oneColumn).ok).toBe(true);
    expect(layout.focused()).toBe("a");
  });

  it("keeps the last pane on the stage and refuses an empty shelf", () => {
    const layout = opened(["a", "b"]);
    expect(layout.shelve("a").ok).toBe(true);
    expect(layout.shelve("b")).toEqual({ ok: false, refused: "nothing-to-do" });
    expect(layout.shelve("a")).toEqual({ ok: false, refused: "nothing-to-do" });
    layout.focus("a");
    expect(layout.returnFromShelf(screen)).toEqual({ ok: false, refused: "nothing-to-do" });
  });

  it("brings the last shelved pane back when the only pane on the stage closes", () => {
    const layout = opened(["a", "b"]);
    layout.shelve("a");
    expect(layout.close("b").ok).toBe(true);
    expect(layout.focused()).toBe("a");
    expect(layout.shelved(screen)).toEqual([]);
    expect(shown(layout, screen)).toEqual(["a"]);
  });

  it("reaches a shelved pane by its ordinal, which never changes while it waits", () => {
    const layout = opened(["a", "b", "c"]);
    const ordinal = layout.spawnRank("b") + 1;
    layout.shelve("b");
    expect(layout.spawnRank("b") + 1).toBe(ordinal);
    expect(layout.focusOrdinal(ordinal).ok).toBe(true);
    expect(layout.focused()).toBe("b");
    expect(layout.isShelved("b")).toBe(false);
  });

  it("opens the next pane beside a pane that is showing, never beside one on the shelf", () => {
    const layout = opened(["a", "b"]);
    layout.shelve("b");
    expect(layout.open("c", screen, "b").ok).toBe(true);
    expect(shown(layout, screen)).toEqual(["a", "c"]);
    expect(tiles(layout.rects(screen).values(), screen)).toBe(true);
  });

  it("round-trips the shelf, the pins and the floats through saved state", () => {
    const layout = opened(["a", "b", "c", "d"]);
    layout.pinToggle();
    layout.focus("c");
    layout.floatToggle(screen);
    layout.shelve("a");
    const copy = revived(layout);
    expect(copy.toJSON()).toEqual(layout.toJSON());
    expect(copy.rects(screen)).toEqual(layout.rects(screen));
    expect(copy.shelved(screen)).toEqual(layout.shelved(screen));
    expect(copy.isPinned("d")).toBe(true);
  });

  it("drops standing that names panes the saved state no longer holds", () => {
    const state = parseLayoutState({
      version: 1,
      tree: { kind: "leaf", id: "a" },
      focused: "a",
      floats: { gone: { x: 0, y: 0, width: 0.5, height: 0.5 } },
      shelved: ["a", "gone"],
      pinned: ["gone"],
    });
    expect(state).toEqual({ version: 1, tree: { kind: "leaf", id: "a" }, focused: "a" });
  });
});

describe("floating panes", () => {
  it("lifts a pane in place, at most half the stage wide, and lets the tiling close under it", () => {
    const layout = opened(["a", "b"]);
    expect(layout.floatToggle(screen).ok).toBe(true);
    expect(layout.isFloating("b")).toBe(true);
    const rects = layout.rects(screen);
    expect(rects.get("a")).toEqual({ x: 0, y: 0, ...screen });
    expect(rects.get("b")).toEqual({ x: 800, y: 200, width: 800, height: 600 });
    expect(layout.floating(screen)).toEqual([{ id: "b", rect: rects.get("b"), z: 1 }]);
  });

  it("settles a floating pane back into the seat it lifted from", () => {
    const layout = opened(["a", "b", "c"]);
    const before = layout.rects(screen);
    layout.focus("b");
    layout.floatToggle(screen);
    expect(layout.floatToggle(screen).ok).toBe(true);
    expect(layout.isFloating("b")).toBe(false);
    expect(layout.rects(screen)).toEqual(before);
  });

  it("nudges and scales the focused float by one step and stops at the stage's edges", () => {
    const layout = opened(["a", "b"]);
    layout.floatToggle(screen);
    const at = (): Rect => layout.rects(screen).get("b") as Rect;
    expect(layout.move("left", screen).ok).toBe(true);
    expect(at().x).toBe(800 - screen.width * floatStep);
    expect(layout.move("right", screen).ok).toBe(true);
    expect(layout.move("right", screen)).toEqual({ ok: false, refused: "nothing-to-do" });
    expect(layout.resizeFocused(-floatStep, screen).ok).toBe(true);
    expect(at().width).toBe(720);
    expect(at().height).toBe(550);
    for (let step = 0; step < 30; step += 1) layout.resizeFocused(floatStep, screen);
    expect(at()).toEqual({ x: 0, y: 0, ...screen });
  });

  it("keeps a float inside a smaller stage and no smaller than a pane can be", () => {
    const layout = opened(["a", "b"]);
    layout.floatToggle(screen);
    const small: Screen = { width: 500, height: 300 };
    const rect = layout.rects(small).get("b") as Rect;
    expect(rect.width).toBeGreaterThanOrEqual(minPaneSize.width);
    expect(rect.height).toBeGreaterThanOrEqual(minPaneSize.height);
    expect(rect.x + rect.width).toBeLessThanOrEqual(small.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(small.height);
  });

  it("stacks floats by recency, the focused one on top", () => {
    const layout = opened(["a", "b", "c"]);
    layout.floatToggle(screen);
    layout.focus("b");
    layout.floatToggle(screen);
    expect(layout.floating(screen).map((float) => float.id)).toEqual(["c", "b"]);
    layout.focus("c");
    expect(layout.floating(screen).map((float) => float.id)).toEqual(["b", "c"]);
  });

  it("keeps a float over a zoomed pane and leaves the zoom alone when the float is focused", () => {
    const layout = opened(["a", "b", "c"]);
    layout.floatToggle(screen);
    layout.focus("a");
    layout.zoomToggle();
    expect(shown(layout, screen)).toEqual(["a", "c"]);
    expect(layout.rects(screen).get("a")).toEqual({ x: 0, y: 0, ...screen });
    layout.focus("c");
    expect(layout.zoomed()).toBe("a");
    layout.focus("b");
    expect(layout.zoomed()).toBeUndefined();
  });

  it("walks the tiling with the arrows and steps to what floats with one verb", () => {
    const layout = opened(["a", "b", "c"]);
    layout.floatToggle(screen);
    layout.focus("a");
    expect(layout.moveFocus("right", screen).ok).toBe(true);
    expect(layout.focused()).toBe("b");
    expect(layout.moveFocus("right", screen)).toEqual({ ok: false, refused: "nothing-to-do" });
    expect(layout.focusAcrossLayers(screen).ok).toBe(true);
    expect(layout.focused()).toBe("c");
    expect(layout.focusAcrossLayers(screen).ok).toBe(true);
    expect(layout.focused()).toBe("b");
    layout.focus("c");
    expect(layout.moveFocus("left", screen).ok).toBe(true);
    expect(layout.isFloating(layout.focused() as string)).toBe(false);
  });

  it("lands a float in a dock when it is docked, and in the tiling when it is sent to main", () => {
    const layout = opened(["a", "b"]);
    layout.floatToggle(screen);
    expect(layout.dockFocused("left").ok).toBe(true);
    expect(layout.isFloating("b")).toBe(false);
    expect(layout.dockSideOf("b")).toBe("left");
    layout.floatToggle(screen);
    expect(layout.send("b", "main", screen).ok).toBe(true);
    expect(layout.isFloating("b")).toBe(false);
    expect(layout.dockSideOf("b")).toBeUndefined();
    expect(tiles(layout.rects(screen).values(), screen)).toBe(true);
  });

  it("hits the topmost float before a seam or a tile beneath it", () => {
    const layout = opened(["a", "b", "c"]);
    layout.floatToggle(screen);
    layout.placeFloat("c", { x: 600, y: 300, width: 400, height: 400 }, screen);
    const scene = layout.scene(screen);
    expect(hitAt(scene, { x: 800, y: 500 })).toEqual({ kind: "pane", id: "c" });
    expect(hitAt(scene, { x: 800, y: 100 })).toMatchObject({ kind: "seam" });
    expect(hitAt(scene, { x: 100, y: 100 })).toEqual({ kind: "pane", id: "a" });
  });
});

describe("pointer gestures on a float", () => {
  const floated = (): Layout => {
    const layout = opened(["a", "b"]);
    layout.floatToggle(screen);
    return layout;
  };

  const drive = (layout: Layout, inputs: readonly PointerInput[]): PointerState => {
    let state: PointerState = idlePointer;
    for (const input of inputs) {
      const step = advancePointer(state, input, layout.scene(screen));
      state = step.state;
      const intent = step.intent;
      if (intent?.type === "place") layout.placeFloat(intent.id, intent.rect, screen);
      if (intent?.type === "focus") layout.focus(intent.id);
    }
    return state;
  };

  it("moves the float with its title row, keeping the grab point under the pointer", () => {
    const layout = floated();
    const state = drive(layout, [
      { type: "down", x: 900, y: 210, grip: "title" },
      { type: "move", x: 500, y: 110 },
    ]);
    expect(state.phase).toBe("moving");
    expect(layout.rects(screen).get("b")).toEqual({ x: 400, y: 100, width: 800, height: 600 });
    expect(drive(layout, [{ type: "up", x: 500, y: 110 }]).phase).toBe("idle");
  });

  it("sizes the float from its corner grip and never offers a drop zone", () => {
    const layout = floated();
    const state = drive(layout, [
      { type: "down", x: 1595, y: 795, grip: "corner" },
      { type: "move", x: 1280, y: 700 },
    ]);
    expect(state.phase).toBe("sizing");
    expect(layout.rects(screen).get("b")).toEqual({ x: 800, y: 200, width: 480, height: 500 });
  });
});

describe("panes outside the window", () => {
  const onTheDesktop: ScreenRect = { x: 1720, y: 60, width: 640, height: 480 };
  const onAnotherDisplay: ScreenRect = { x: -900, y: 140, width: 520, height: 700 };
  const outsideIds = (layout: Layout): string[] => layout.outside().map((pane) => pane.id);

  it("closes the tiling over the seat a pane left, exactly as it does for a shelved pane", () => {
    const layout = opened(["a", "b", "c"]);
    const shelving = opened(["a", "b", "c"]);
    shelving.shelve("b");
    expect(layout.sendOutside("b").ok).toBe(true);
    expect(layout.isOutside("b")).toBe(true);
    expect(layout.rects(screen)).toEqual(shelving.rects(screen));
    expect(tiles(layout.rects(screen).values(), screen)).toBe(true);
    expect(layout.scene(screen).rects.has("b")).toBe(false);
    expect(layout.shelved(screen)).toEqual([]);
    expect(layout.panes()).toContain("b");
    expect(layout.outside()).toEqual([{ id: "b", rect: undefined, follows: true }]);
  });

  it("keeps a pane's ordinal and its place in the opening order while it stands outside", () => {
    const layout = opened(["a", "b", "c"]);
    layout.sendOutside("b");
    expect(layout.openingOrder()).toEqual(["a", "b", "c"]);
    expect(layout.spawnRank("b")).toBe(1);
    expect(layout.focusOrdinal(2).ok).toBe(true);
    expect(layout.focused()).toBe("b");
    expect(layout.isOutside("b")).toBe(true);
  });

  it("brings a pane inside to the exact seat and ratio it left, and focuses it", () => {
    const layout = opened(["a", "b", "c"]);
    layout.resizeFocused(0.1, screen);
    const before = layout.rects(screen);
    layout.focus("a");
    layout.sendOutside("b");
    expect(layout.focused()).toBe("a");
    expect(layout.bringInside("b").ok).toBe(true);
    expect(layout.focused()).toBe("b");
    expect(layout.isOutside("b")).toBe(false);
    expect(layout.rects(screen)).toEqual(before);
    expect(layout.bringInside("b")).toEqual({ ok: false, refused: "nothing-to-do" });
    expect(layout.bringInside("nobody")).toEqual({ ok: false, refused: "unknown-pane" });
  });

  it("holds no pin while a pane is outside and remembers it for the pane's return", () => {
    const layout = columns(["a", "b", "c"]);
    layout.focus("a");
    layout.pinToggle();
    layout.sendOutside("a");
    expect(layout.isPinned("a")).toBe(false);
    expect(layout.pinToggle()).toEqual({ ok: false, refused: "outside" });
    expect(revived(layout).toJSON().pinned).toEqual(["a"]);
    layout.bringInside("a");
    expect(layout.isPinned("a")).toBe(true);
    layout.focus("b");
    layout.focus("c");
    expect(shown(layout, twoColumns)).toEqual(["a", "c"]);
  });

  it("remembers where a pane stands on the desktop, and stops it following once the keeper drags it", () => {
    const layout = opened(["a", "b"]);
    layout.sendOutside("b");
    expect(layout.placeOutside("b", onTheDesktop, "host").ok).toBe(true);
    expect(layout.outside()).toEqual([{ id: "b", rect: onTheDesktop, follows: true }]);
    expect(layout.placeOutside("b", onTheDesktop, "host")).toEqual({
      ok: false,
      refused: "nothing-to-do",
    });
    expect(layout.placeOutside("b", onAnotherDisplay, "keeper").ok).toBe(true);
    expect(layout.outside()).toEqual([{ id: "b", rect: onAnotherDisplay, follows: false }]);
    expect(layout.placeOutside("b", onTheDesktop, "host").ok).toBe(true);
    expect(layout.outside()).toEqual([{ id: "b", rect: onTheDesktop, follows: false }]);
    expect(layout.placeOutside("a", onTheDesktop, "keeper")).toEqual({
      ok: false,
      refused: "unknown-pane",
    });
  });

  it("keeps the last rectangle when the host reports one no window could have", () => {
    const layout = opened(["a", "b"]);
    layout.sendOutside("b");
    layout.placeOutside("b", onTheDesktop, "host");
    for (const broken of [
      { ...onTheDesktop, width: 0 },
      { ...onTheDesktop, height: -40 },
      { ...onTheDesktop, x: Number.NaN },
    ]) {
      expect(layout.placeOutside("b", broken, "keeper")).toEqual({
        ok: false,
        refused: "nothing-to-do",
      });
    }
    expect(layout.outside()).toEqual([{ id: "b", rect: onTheDesktop, follows: true }]);
    expect(revived(layout).outside()).toEqual(layout.outside());
  });

  it("brings every pane inside in the order they went out, and leaves the focus where it was", () => {
    const layout = opened(["a", "b", "c", "d"]);
    const before = layout.rects(screen);
    for (const id of ["c", "a", "d"]) layout.sendOutside(id);
    layout.focus("a");
    expect(layout.bringAllInside().ok).toBe(true);
    expect(layout.outside()).toEqual([]);
    expect(layout.focused()).toBe("a");
    expect(layout.recentlyFocused()).toEqual(["a", "d", "c", "b"]);
    expect(layout.rects(screen)).toEqual(before);
    expect(layout.bringAllInside()).toEqual({ ok: false, refused: "nothing-to-do" });
  });

  it("lets a pane outside hold the focus while the arrows stay inside the window", () => {
    const layout = opened(["a", "b", "c"]);
    layout.sendOutside("c");
    expect(layout.focused()).toBe("c");
    expect(layout.moveFocus("left", screen)).toEqual({ ok: false, refused: "nothing-to-do" });
    layout.focus("a");
    expect(layout.moveFocus("right", screen).ok).toBe(true);
    expect(layout.focused()).toBe("b");
    expect(layout.moveFocus("down", screen)).toEqual({ ok: false, refused: "nothing-to-do" });
    const drawnByAnotherView = new Map([
      ["b", { x: 0, y: 0, width: 800, height: 1000 }],
      ["c", { x: 800, y: 0, width: 800, height: 1000 }],
    ]);
    expect(layout.neighborToward("right", drawnByAnotherView)).toBeUndefined();
  });

  it("steps from the tiling through what floats and then through the panes outside", () => {
    const layout = opened(["a", "b", "c", "d"]);
    layout.floatToggle(screen);
    layout.sendOutside("c");
    layout.sendOutside("b");
    layout.focus("a");
    const visited: string[] = [];
    for (let step = 0; step < 5; step += 1) {
      expect(layout.focusAcrossLayers(screen).ok).toBe(true);
      visited.push(layout.focused() as string);
    }
    expect(visited).toEqual(["d", "c", "b", "a", "d"]);
    expect(outsideIds(layout)).toEqual(["c", "b"]);
  });

  it("steps between the tiling and one pane outside, and says so when there is nowhere to step", () => {
    const layout = opened(["a", "b"]);
    layout.sendOutside("b");
    expect(layout.focusAcrossLayers(screen).ok).toBe(true);
    expect(layout.focused()).toBe("a");
    expect(layout.focusAcrossLayers(screen).ok).toBe(true);
    expect(layout.focused()).toBe("b");
    const alone = opened(["a"]);
    alone.sendOutside("a");
    expect(alone.focusAcrossLayers(screen)).toEqual({ ok: false, refused: "nothing-to-do" });
  });

  it("zooms only inside: a zoomed pane that leaves ends the zoom, and focus outside leaves one alone", () => {
    const layout = opened(["a", "b", "c"]);
    layout.zoomToggle();
    layout.sendOutside("c");
    expect(layout.zoomed()).toBeUndefined();
    expect(layout.zoomToggle()).toEqual({ ok: false, refused: "outside" });
    layout.focus("a");
    layout.zoomToggle();
    layout.focus("c");
    expect(layout.zoomed()).toBe("a");
    expect([...layout.rects(screen)]).toEqual([["a", { x: 0, y: 0, ...screen }]]);
  });

  it("refuses the verbs that shape a pane's place in the window while the pane is outside", () => {
    const layout = opened(["a", "b", "c"]);
    layout.sendOutside("c");
    const saved = JSON.stringify(layout.toJSON());
    const verdicts = {
      float: layout.floatToggle(screen),
      shelve: layout.shelveFocused(),
      pin: layout.pinToggle(),
      move: layout.move("left", screen),
      rotate: layout.rotate(screen),
      swap: layout.swapWith("a"),
      dock: layout.dockFocused("left"),
      undock: layout.undockFocused(screen),
      cycle: layout.cycleFocused(screen),
      resize: layout.resizeFocused(0.1, screen),
      drop: layout.send("c", "left", screen),
    };
    for (const [verb, verdict] of Object.entries(verdicts)) {
      expect(verdict, verb).toEqual({ ok: false, refused: "outside" });
    }
    layout.focus("a");
    expect(layout.swapWith("c")).toEqual({ ok: false, refused: "outside" });
    layout.focus("c");
    expect(JSON.stringify(layout.toJSON())).toBe(saved);
  });

  it("hands the focus to the shelf before a pane outside when the last pane inside closes", () => {
    const shelved = opened(["a", "b", "c"]);
    shelved.shelve("a");
    shelved.sendOutside("b");
    shelved.close("c");
    expect(shelved.focused()).toBe("a");
    expect(shelved.isShelved("a")).toBe(false);
    expect(shelved.isOutside("b")).toBe(true);
    const outside = opened(["a", "b", "c"]);
    outside.sendOutside("a");
    outside.sendOutside("b");
    outside.close("c");
    expect(outside.focused()).toBe("b");
    expect(outsideIds(outside)).toEqual(["a", "b"]);
  });

  it("lets the last pane inside leave and reports the main area empty, as when nothing is seated", () => {
    const nothingSeated = opened(["a"]);
    nothingSeated.floatToggle(screen);
    const layout = opened(["a"]);
    expect(layout.sendOutside("a").ok).toBe(true);
    expect(layout.rects(screen).size).toBe(0);
    expect(layout.seams(screen)).toEqual([]);
    expect(layout.emptyMainRect(screen)).toEqual(nothingSeated.emptyMainRect(screen));
    expect(layout.emptyMainRect(screen)).toEqual({ x: 0, y: 0, ...screen });
    expect(layout.focused()).toBe("a");
    expect(layout.open("b", screen).ok).toBe(true);
    expect([...layout.rects(screen)]).toEqual([["b", { x: 0, y: 0, ...screen }]]);
    expect(layout.emptyMainRect(screen)).toBeUndefined();
  });

  it("still keeps the last pane on the stage off the shelf when the others are outside", () => {
    const layout = opened(["a", "b"]);
    layout.sendOutside("b");
    expect(layout.shelve("a")).toEqual({ ok: false, refused: "nothing-to-do" });
    expect(layout.shelve("b")).toEqual({ ok: false, refused: "outside" });
  });

  it("leaves the fit alone: a pane outside takes no room and is never tucked", () => {
    const layout = columns(["a", "b", "c"]);
    layout.sendOutside("c");
    expect(shown(layout, twoColumns)).toEqual(["a", "b"]);
    expect(layout.shelved(twoColumns)).toEqual([]);
    expect(shown(layout, oneColumn)).toEqual(["b"]);
    expect(layout.shelved(oneColumn)).toEqual([{ id: "a", why: "tucked" }]);
  });

  it("round-trips the panes outside, their rectangles and whether they follow through saved state", () => {
    const layout = opened(["a", "b", "c", "d"]);
    layout.pinToggle();
    for (const id of ["d", "b", "a"]) layout.sendOutside(id);
    layout.placeOutside("d", onTheDesktop, "host");
    layout.placeOutside("b", onAnotherDisplay, "keeper");
    const copy = revived(layout);
    expect(copy.toJSON()).toEqual(layout.toJSON());
    expect(copy.outside()).toEqual([
      { id: "d", rect: onTheDesktop, follows: true },
      { id: "b", rect: onAnotherDisplay, follows: false },
      { id: "a", rect: undefined, follows: true },
    ]);
    expect(copy.rects(screen)).toEqual(layout.rects(screen));
    expect(copy.focused()).toBe("d");
    copy.bringInside("d");
    expect(copy.isPinned("d")).toBe(true);
  });

  it("loads a state saved before a pane could leave the window, unchanged", () => {
    const layout = opened(["a", "b", "c"]);
    layout.shelve("a");
    const saved = JSON.parse(JSON.stringify(layout.toJSON()));
    expect(saved).not.toHaveProperty("outside");
    expect(parseLayoutState(saved)).toEqual(saved);
    expect(revived(layout).outside()).toEqual([]);
  });

  it("drops outside standing for panes the saved state no longer holds, and lets outside win over a stale float or shelf", () => {
    const tree = {
      kind: "split",
      orientation: "row",
      ratio: 0.5,
      first: { kind: "leaf", id: "a" },
      second: { kind: "leaf", id: "b" },
    };
    const state = parseLayoutState({
      version: 1,
      tree,
      focused: "a",
      floats: { b: { x: 0, y: 0, width: 0.5, height: 0.5 } },
      shelved: ["b"],
      pinned: ["b"],
      outside: [
        { id: "gone", follows: true },
        { id: "b", rect: onTheDesktop, follows: false },
        { id: "b", follows: true },
      ],
    });
    expect(state).toEqual({
      version: 1,
      tree,
      focused: "a",
      pinned: ["b"],
      outside: [{ id: "b", rect: onTheDesktop, follows: false }],
    });
  });

  it("refuses a saved state whose outside rectangle no window could have", () => {
    const withRect = (rect: unknown): unknown => ({
      version: 1,
      tree: { kind: "leaf", id: "a" },
      outside: [{ id: "a", rect, follows: true }],
    });
    expect(parseLayoutState(withRect(onTheDesktop))).toBeDefined();
    expect(parseLayoutState(withRect({ ...onTheDesktop, width: 0 }))).toBeUndefined();
    expect(parseLayoutState(withRect({ x: 0, y: 0 }))).toBeUndefined();
  });

  it("focuses a pane outside when a saved state names no focus and seats nothing inside", () => {
    const layout = new Layout();
    layout.load(
      parseLayoutState({
        version: 1,
        tree: { kind: "leaf", id: "a" },
        outside: [{ id: "a", follows: true }],
      }) as never,
    );
    expect(layout.focused()).toBe("a");
    expect(layout.isOutside("a")).toBe(true);
  });

  it("opens a pane already outside: no seated pane moves, and focus and zoom stay where they were", () => {
    const layout = opened(["a", "b"]);
    layout.focus("a");
    layout.zoomToggle();
    const before = [...layout.rects(screen)];
    expect(layout.openOutside("c", screen, "main", "b").ok).toBe(true);
    expect(layout.outside()).toEqual([{ id: "c", rect: undefined, follows: true }]);
    expect(layout.focused()).toBe("a");
    expect(layout.zoomed()).toBe("a");
    expect([...layout.rects(screen)]).toEqual(before);
    expect(layout.openingOrder()).toEqual(["a", "b", "c"]);
    expect(layout.openOutside("c", screen, "main")).toEqual({ ok: false, refused: "already-open" });
  });

  it("gives a pane opened outside the seat it would have opened in, for the day it comes inside", () => {
    const beside = opened(["a", "b"]);
    const outside = opened(["a", "b"]);
    beside.open("c", screen, "b");
    outside.openOutside("c", screen, "main", "b");
    outside.bringInside("c");
    expect(outside.rects(screen)).toEqual(beside.rects(screen));
    const docked = opened(["a"]);
    docked.openOutside("tree", screen, "left");
    expect(docked.dockSideOf("tree")).toBe("left");
    expect(shown(docked, screen)).toEqual(["a"]);
    const alone = new Layout();
    expect(alone.openOutside("only", screen, "main").ok).toBe(true);
    expect(shown(alone, screen)).toEqual([]);
    expect(alone.focused()).toBeUndefined();
  });

  it("tucks nothing when a pane opens outside a window with no room left", () => {
    const layout = opened(["a", "b"], twoColumns);
    expect(layout.shelved(twoColumns)).toEqual([]);
    layout.openOutside("c", twoColumns, "main", "b");
    expect(layout.shelved(twoColumns)).toEqual([]);
    expect(shown(layout, twoColumns)).toEqual(["a", "b"]);
  });
});

describe("every verb together", () => {
  const verbs = [
    "open",
    "close",
    "focus",
    "zoom",
    "float",
    "shelve",
    "return",
    "pin",
    "move",
    "dock",
    "resize",
    "send outside",
    "toggle outside",
    "place outside",
    "bring inside",
    "bring all inside",
    "across",
  ] as const;

  it("keeps the tiling gapless, the focused pane within reach and every pane in exactly one standing", () => {
    let seed = 11;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    const somewhereOnTheDesktop = (): ScreenRect => ({
      x: Math.round(random() * 6000) - 3000,
      y: Math.round(random() * 3000) - 1000,
      width: 320 + Math.round(random() * 900),
      height: 200 + Math.round(random() * 700),
    });
    const screens: readonly Screen[] = [
      screen,
      twoColumns,
      oneColumn,
      { width: 1100, height: 700 },
    ];
    const met = new Set<string>();
    for (let run = 0; run < 60; run += 1) {
      const layout = new Layout();
      let next = 0;
      for (let step = 0; step < 50; step += 1) {
        const at = pick(screens);
        const panes = layout.panes();
        const target = panes.length === 0 ? undefined : pick(panes);
        const verb = pick(verbs);
        if (verb === "open") layout.open(`p${next++}`, at);
        else if (target === undefined) continue;
        else if (verb === "close") layout.close(target);
        else if (verb === "focus") layout.focus(target);
        else if (verb === "zoom") layout.zoomToggle();
        else if (verb === "float") layout.floatToggle(at);
        else if (verb === "shelve") layout.shelve(target);
        else if (verb === "return") layout.returnFromShelf(at);
        else if (verb === "pin") layout.pinToggle();
        else if (verb === "move") layout.move(pick(["left", "right", "up", "down"] as const), at);
        else if (verb === "dock") layout.dockFocused(pick(["left", "right"] as const));
        else if (verb === "resize") layout.resizeFocused(pick([-0.1, 0.05]), at);
        else if (verb === "send outside") layout.sendOutside(target);
        else if (verb === "toggle outside") layout.outsideToggle();
        else if (verb === "place outside")
          layout.placeOutside(target, somewhereOnTheDesktop(), pick(["keeper", "host"] as const));
        else if (verb === "bring inside") layout.bringInside(target);
        else if (verb === "bring all inside") layout.bringAllInside();
        else layout.focusAcrossLayers(at);
        if (layout.panes().length === 0) continue;
        const focused = layout.focused() as string;
        expect(focused).toBeDefined();
        const rects = layout.rects(at);
        const outside = layout.outside().map((pane) => pane.id);
        expect(rects.has(focused)).toBe(!layout.isOutside(focused));
        expect(outside).not.toContain(layout.zoomed());
        for (const id of outside) {
          expect(rects.has(id)).toBe(false);
          expect(layout.isFloating(id) || layout.isShelved(id) || layout.isPinned(id)).toBe(false);
        }
        if (layout.zoomed() === undefined) {
          const everywhere = [
            ...rects.keys(),
            ...layout.shelved(at).map((absent) => absent.id),
            ...outside,
          ].sort();
          expect(everywhere).toEqual([...layout.panes()].sort());
          const empty = layout.emptyMainRect(at);
          const tiled = [...rects].filter(([id]) => !layout.isFloating(id)).map(([, rect]) => rect);
          expect(tiles([...tiled, ...(empty === undefined ? [] : [empty])], at)).toBe(true);
        }
        expect(revived(layout).toJSON()).toEqual(layout.toJSON());
        if (outside.length > 0) met.add("a pane outside");
        if (layout.isOutside(focused)) met.add("the focus outside");
        if (outside.length === layout.panes().length) met.add("every pane outside");
        if (outside.length > 0 && layout.floating(at).length > 0) met.add("outside beside a float");
        if (outside.length > 0 && layout.shelved(at).length > 0)
          met.add("outside beside the shelf");
        if (outside.length > 0 && layout.zoomed() !== undefined) met.add("outside beside a zoom");
        if (layout.outside().some((pane) => pane.rect !== undefined && !pane.follows))
          met.add("a pane the keeper dragged");
      }
    }
    expect([...met].sort()).toEqual([
      "a pane outside",
      "a pane the keeper dragged",
      "every pane outside",
      "outside beside a float",
      "outside beside a zoom",
      "outside beside the shelf",
      "the focus outside",
    ]);
  });
});

describe("room for a newcomer", () => {
  const exactlyTwo: Screen = {
    width: minPaneSize.width * 2 + 40,
    height: minPaneSize.height + 100,
  };

  it("says whether one more pane would show without another leaving the stage", () => {
    const layout = columns(["a", "b"]);
    expect(layout.hasRoomBeside(screen)).toBe(true);
    expect(layout.hasRoomInMain(screen)).toBe(true);
    expect(layout.hasRoomInDock("left", screen)).toBe(true);
    expect(layout.hasRoomBeside(exactlyTwo)).toBe(false);
    expect(layout.hasRoomInMain(exactlyTwo)).toBe(false);
    expect(layout.hasRoomInDock("left", exactlyTwo)).toBe(false);
  });

  it("agrees with what opening then shows", () => {
    for (const at of [screen, exactlyTwo, twoColumns, oneColumn]) {
      const layout = columns(["a", "b"]);
      const roomy = layout.hasRoomBeside(at);
      const waiting = layout.shelved(at).length;
      layout.open("c", at);
      expect(layout.shelved(at).length <= waiting, JSON.stringify(at)).toBe(roomy);
    }
  });

  it("counts a pane outside the window as taking no room", () => {
    const layout = columns(["a", "b"]);
    layout.sendOutside("a");
    expect(layout.hasRoomBeside(exactlyTwo)).toBe(true);
    expect(layout.hasRoomInMain(exactlyTwo)).toBe(true);
    layout.bringInside("a");
    expect(layout.hasRoomBeside(exactlyTwo)).toBe(false);
  });
});
