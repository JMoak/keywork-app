import { describe, expect, it } from "vitest";
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

  it("returns every pane to its seat when the room comes back", () => {
    const layout = columns(["a", "b", "c"]);
    const before = layout.rects(screen);
    layout.rects(oneColumn);
    expect(layout.rects(screen)).toEqual(before);
    expect(layout.shelved(screen)).toEqual([]);
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

  it("says there is nothing to step to when no pane floats", () => {
    const layout = opened(["a", "b"]);
    expect(layout.focusAcrossLayers(screen)).toEqual({ ok: false, refused: "nothing-to-do" });
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

  it("leaves a press on the float's body to the pane", () => {
    const layout = floated();
    const state = drive(layout, [
      { type: "down", x: 900, y: 400, grip: "body" },
      { type: "move", x: 500, y: 110 },
    ]);
    expect(state.phase).toBe("pressed");
    expect(layout.rects(screen).get("b")).toEqual({ x: 800, y: 200, width: 800, height: 600 });
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
    "across",
  ] as const;

  it("keeps the tiling gapless under the floats and the focused pane on the stage", () => {
    let seed = 11;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    const screens: readonly Screen[] = [
      screen,
      twoColumns,
      oneColumn,
      { width: 1100, height: 700 },
    ];
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
        else layout.focusAcrossLayers(at);
        if (layout.panes().length === 0) continue;
        const focused = layout.focused();
        expect(focused).toBeDefined();
        const rects = layout.rects(at);
        expect(rects.has(focused as string)).toBe(true);
        if (layout.zoomed() === undefined) {
          const everywhere = [
            ...rects.keys(),
            ...layout.shelved(at).map((absent) => absent.id),
          ].sort();
          expect(everywhere).toEqual([...layout.panes()].sort());
          const empty = layout.emptyMainRect(at);
          const tiled = [...rects].filter(([id]) => !layout.isFloating(id)).map(([, rect]) => rect);
          expect(tiles([...tiled, ...(empty === undefined ? [] : [empty])], at)).toBe(true);
        }
        expect(revived(layout).toJSON()).toEqual(layout.toJSON());
      }
    }
  });
});
