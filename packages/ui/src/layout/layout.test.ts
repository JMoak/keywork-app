import { describe, expect, it } from "vitest";
import type { Direction, Rect, Screen } from "./geometry.ts";
import { Layout } from "./layout.ts";
import { parseLayoutState } from "./state.ts";
import { minPaneSize } from "./tree.ts";

const screen: Screen = { width: 1600, height: 1000 };

function opened(ids: readonly string[]): Layout {
  const layout = new Layout();
  for (const id of ids) expect(layout.open(id, screen).ok).toBe(true);
  return layout;
}

function assertTiled(layout: Layout, at: Screen = screen): void {
  const emptyMain = layout.emptyMainRect(at);
  const rects = [...layout.rects(at).values(), ...(emptyMain === undefined ? [] : [emptyMain])];
  const total = rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
  expect(total).toBe(at.width * at.height);
  for (const rect of rects) {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(at.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(at.height);
  }
  for (let a = 0; a < rects.length; a += 1) {
    for (let b = a + 1; b < rects.length; b += 1) {
      expect(overlaps(rects[a] as Rect, rects[b] as Rect)).toBe(false);
    }
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function meetsMinimum(rect: Rect): boolean {
  return rect.width >= minPaneSize.width && rect.height >= minPaneSize.height;
}

describe("Layout verbs", () => {
  it("opens the first pane full-screen and splits the wide pane by rows", () => {
    const layout = opened(["a", "b"]);
    const rects = layout.rects(screen);
    expect(rects.get("a")).toEqual({ x: 0, y: 0, width: 800, height: 1000 });
    expect(rects.get("b")).toEqual({ x: 800, y: 0, width: 800, height: 1000 });
    expect(layout.focused()).toBe("b");
  });

  it("refuses a split that cannot meet minimum sizes and leaves the layout untouched", () => {
    const tiny: Screen = { width: minPaneSize.width + 10, height: minPaneSize.height + 10 };
    const layout = new Layout();
    expect(layout.open("a", tiny).ok).toBe(true);
    const verdict = layout.open("b", tiny);
    expect(verdict).toEqual({ ok: false, refused: "no-room" });
    expect(layout.panes()).toEqual(["a"]);
    expect(layout.focused()).toBe("a");
  });

  it("zooms the focused pane to the whole screen and restores on toggle", () => {
    const layout = opened(["a", "b", "c"]);
    expect(layout.zoomToggle().ok).toBe(true);
    expect([...layout.rects(screen).entries()]).toEqual([
      ["c", { x: 0, y: 0, width: 1600, height: 1000 }],
    ]);
    expect(layout.zoomToggle().ok).toBe(true);
    expect(layout.rects(screen).size).toBe(3);
  });

  it("hands focus to the most recently focused survivor on close", () => {
    const layout = opened(["a", "b", "c"]);
    layout.focus("a");
    layout.focus("c");
    expect(layout.close("c").ok).toBe(true);
    expect(layout.focused()).toBe("a");
    expect(layout.panes()).toEqual(["b", "a"].sort());
    assertTiled(layout);
  });

  it("moves focus directionally and by ordinal", () => {
    const layout = opened(["a", "b"]);
    expect(layout.moveFocus("left", screen).ok).toBe(true);
    expect(layout.focused()).toBe("a");
    expect(layout.moveFocus("left", screen)).toEqual({ ok: false, refused: "nothing-to-do" });
    expect(layout.focusOrdinal(2).ok).toBe(true);
    expect(layout.focused()).toBe("b");
    expect(layout.focusOrdinal(9).ok).toBe(false);
  });

  it("cycles a pane main → left → right → main and round-trips", () => {
    const layout = opened(["a", "b"]);
    const before = layout.toJSON();
    expect(layout.cycleFocused(screen).ok).toBe(true);
    expect(layout.dockSideOf("b")).toBe("left");
    expect(layout.cycleFocused(screen).ok).toBe(true);
    expect(layout.dockSideOf("b")).toBe("right");
    expect(layout.cycleFocused(screen).ok).toBe(true);
    expect(layout.dockSideOf("b")).toBeUndefined();
    expect(layout.panes().sort()).toEqual(["a", "b"]);
    expect(layout.toJSON().docks).toEqual(before.docks);
    assertTiled(layout);
  });

  it("rotates the split around the focused pane and resizes by stepped ratio", () => {
    const layout = opened(["a", "b"]);
    expect(layout.rotate().ok).toBe(true);
    expect(layout.rects(screen).get("b")).toEqual({ x: 0, y: 500, width: 1600, height: 500 });
    expect(layout.resizeFocused(0.1, screen).ok).toBe(true);
    expect(layout.rects(screen).get("b")?.height).toBe(600);
    assertTiled(layout);
  });

  it("swaps two panes and keeps every rect", () => {
    const layout = opened(["a", "b"]);
    const before = layout.rects(screen);
    expect(layout.swapWith("a").ok).toBe(true);
    const after = layout.rects(screen);
    expect(after.get("a")).toEqual(before.get("b"));
    expect(after.get("b")).toEqual(before.get("a"));
  });

  it("round-trips through JSON and refuses corrupt state", () => {
    const layout = opened(["a", "b", "c"]);
    layout.dockFocused("right", screen);
    const state = layout.toJSON();
    const revived = new Layout();
    revived.load(parseLayoutState(JSON.parse(JSON.stringify(state))) as never);
    expect(revived.toJSON()).toEqual(state);
    expect(revived.rects(screen)).toEqual(layout.rects(screen));
    expect(
      parseLayoutState({ version: 1, tree: { kind: "leaf", id: "a" }, focused: "zz" }),
    ).toBeUndefined();
    expect(parseLayoutState({ version: 2 })).toBeUndefined();
  });
});

describe("Layout invariants under random verb sequences", () => {
  const verbs = [
    "open",
    "close",
    "zoom",
    "focus",
    "move",
    "cycle",
    "dock",
    "rotate",
    "resize",
    "swap",
  ] as const;
  const directions: Direction[] = ["left", "right", "up", "down"];

  it("stays gapless and overlap-free with every pane at its minimum or the verb refused", () => {
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    for (let run = 0; run < 60; run += 1) {
      const layout = new Layout();
      let next = 0;
      for (let step = 0; step < 40; step += 1) {
        const panes = layout.panes();
        const target = panes.length === 0 ? undefined : pick(panes);
        const verb = pick(verbs);
        if (verb === "open") layout.open(`p${next++}`, screen);
        else if (target === undefined) continue;
        else if (verb === "close") layout.close(target);
        else if (verb === "zoom") layout.zoomToggle();
        else if (verb === "focus") layout.focus(target);
        else if (verb === "move") layout.move(pick(directions), screen);
        else if (verb === "cycle") layout.cycleFocused(screen);
        else if (verb === "dock") layout.dockFocused(pick(["left", "right"] as const), screen);
        else if (verb === "rotate") layout.rotate();
        else if (verb === "resize") layout.resizeFocused(pick([-0.2, -0.05, 0.05, 0.2]), screen);
        else layout.swapWith(target);
        if (layout.panes().length === 0) continue;
        assertTiled(layout);
        expect(layout.panes().sort()).toEqual([...new Set(layout.panes())].sort());
        expect(
          layout.focused() === undefined || layout.panes().includes(layout.focused() as string),
        ).toBe(true);
        if (layout.zoomed() === undefined) {
          for (const rect of layout.rects(screen).values()) expect(meetsMinimum(rect)).toBe(true);
        }
        const state = layout.toJSON();
        const revived = new Layout();
        revived.load(parseLayoutState(JSON.parse(JSON.stringify(state))) as never);
        expect(revived.toJSON()).toEqual(state);
      }
    }
  });
});
