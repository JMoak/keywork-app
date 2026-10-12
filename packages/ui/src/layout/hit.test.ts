import { describe, expect, it } from "vitest";
import type { Screen } from "./geometry.ts";
import {
  dropZoneAt,
  dropZoneRects,
  hitAt,
  ratioAlong,
  sameSeam,
  seamReach,
  seamZoneRect,
} from "./hit.ts";
import { Layout } from "./layout.ts";

const screen: Screen = { width: 1600, height: 1000 };

function layoutWith(main: readonly string[], docked: Partial<Record<"left" | "right", string>>) {
  const layout = new Layout();
  for (const id of main) expect(layout.open(id, screen).ok).toBe(true);
  for (const [side, id] of Object.entries(docked)) {
    expect(layout.openInDock(id, side as "left" | "right", screen).ok).toBe(true);
  }
  return layout;
}

describe("hitAt over the layout's rects", () => {
  it("finds the seam between two main panes within its reach and the pane beyond it", () => {
    const scene = layoutWith(["a", "b"], {}).scene(screen);
    const seam = scene.seams[0];
    expect(seam?.handle).toEqual({ kind: "split", path: [] });
    expect(seam?.axis).toBe("x");
    expect(seam?.at).toBe(800);
    expect(hitAt(scene, { x: 800 - seamReach, y: 500 })).toEqual({ kind: "seam", seam });
    expect(hitAt(scene, { x: 800 + seamReach - 1, y: 500 })).toEqual({ kind: "seam", seam });
    expect(hitAt(scene, { x: 800 + seamReach, y: 500 })).toEqual({ kind: "pane", id: "b" });
    expect(hitAt(scene, { x: 10, y: 10 })).toEqual({ kind: "pane", id: "a" });
    expect(hitAt(scene, { x: -1, y: 10 })).toBeUndefined();
  });

  it("lets a gapped scene widen the reach so the whole gap grabs the seam", () => {
    const scene = { ...layoutWith(["a", "b"], {}).scene(screen), seamReach: 14 };
    const seam = scene.seams[0];
    expect(hitAt(scene, { x: 800 - 14, y: 500 })).toEqual({ kind: "seam", seam });
    expect(hitAt(scene, { x: 800 + 13, y: 500 })).toEqual({ kind: "seam", seam });
    expect(hitAt(scene, { x: 800 + 14, y: 500 })).toEqual({ kind: "pane", id: "b" });
    expect(seam === undefined ? undefined : seamZoneRect(seam, 14).width).toBe(28);
  });

  it("gives every seam a zone that is the line plus the reach either side", () => {
    const scene = layoutWith(["a", "b", "c"], {}).scene(screen);
    for (const seam of scene.seams) {
      const zone = seamZoneRect(seam);
      if (seam.axis === "x") {
        expect(zone).toEqual({
          x: seam.at - seamReach,
          y: seam.start,
          width: seamReach * 2,
          height: seam.end - seam.start,
        });
      } else {
        expect(zone).toEqual({
          x: seam.start,
          y: seam.at - seamReach,
          width: seam.end - seam.start,
          height: seamReach * 2,
        });
      }
    }
  });

  it("surfaces a dock's seam against the main area and reads its ratio from the screen edge", () => {
    const scene = layoutWith(["a"], { left: "tree", right: "notes" }).scene(screen);
    const left = scene.seams.find(
      (seam) => seam.handle.kind === "dock" && seam.handle.side === "left",
    );
    const right = scene.seams.find(
      (seam) => seam.handle.kind === "dock" && seam.handle.side === "right",
    );
    expect(left?.at).toBe(scene.regions.left?.width);
    expect(right?.at).toBe(scene.regions.right?.x);
    expect(ratioAlong(left as NonNullable<typeof left>, { x: 400, y: 0 })).toBeCloseTo(0.25);
    expect(ratioAlong(right as NonNullable<typeof right>, { x: 1200, y: 0 })).toBeCloseTo(0.25);
  });

  it("reads a split's ratio along its own axis, clamped to the unit interval", () => {
    const scene = layoutWith(["a", "b"], {}).scene(screen);
    const seam = scene.seams[0] as NonNullable<(typeof scene.seams)[0]>;
    expect(ratioAlong(seam, { x: 400, y: 0 })).toBeCloseTo(0.25);
    expect(ratioAlong(seam, { x: -50, y: 0 })).toBe(0);
    expect(ratioAlong(seam, { x: 5000, y: 0 })).toBe(1);
  });

  it("hides every seam while a pane is zoomed", () => {
    const layout = layoutWith(["a", "b"], { left: "tree" });
    expect(layout.scene(screen).seams.length).toBe(2);
    layout.zoomToggle();
    expect(layout.scene(screen).seams).toEqual([]);
  });
});

describe("drop zones", () => {
  it("uses the dock rects as targets when docks exist and the rest as main", () => {
    const scene = layoutWith(["a"], { left: "tree" }).scene(screen);
    const zones = dropZoneRects(scene);
    expect(zones.left).toEqual(scene.regions.left);
    expect(zones.right.x + zones.right.width).toBe(screen.width);
    expect(zones.main.x).toBe(scene.regions.main.x);
    expect(zones.main.x + zones.main.width).toBe(zones.right.x);
    expect(dropZoneAt(scene, { x: 10, y: 10 })).toBe("left");
    expect(dropZoneAt(scene, { x: 800, y: 500 })).toBe("main");
    expect(dropZoneAt(scene, { x: screen.width - 1, y: 500 })).toBe("right");
  });

  it("offers an edge strip for an empty dock so a pane can be docked by dragging to the edge", () => {
    const scene = layoutWith(["a", "b"], {}).scene(screen);
    const zones = dropZoneRects(scene);
    expect(zones.left.x).toBe(0);
    expect(zones.left.width).toBeGreaterThan(0);
    expect(zones.main.x).toBe(zones.left.width);
    expect(dropZoneAt(scene, { x: 1, y: 1 })).toBe("left");
    expect(dropZoneAt(scene, { x: 5000, y: 1 })).toBeUndefined();
  });

  it("records every pane's home so a drop in the same place can be refused", () => {
    const scene = layoutWith(["a"], { left: "tree", right: "notes" }).scene(screen);
    expect(scene.homes.get("a")).toBe("main");
    expect(scene.homes.get("tree")).toBe("left");
    expect(scene.homes.get("notes")).toBe("right");
  });
});

describe("sameSeam", () => {
  it("matches seams by handle rather than identity, so a recomputed scene keeps the active one", () => {
    const layout = layoutWith(["a", "b"], { left: "tree" });
    const before = layout.scene(screen).seams;
    layout.resizeDock("left", 0.1, screen);
    const after = layout.scene(screen).seams;
    expect(sameSeam(before[0], after[0])).toBe(true);
    expect(sameSeam(before[1], after[1])).toBe(true);
    expect(sameSeam(before[0], after[1])).toBe(false);
    expect(sameSeam(before[1], after[0])).toBe(false);
    expect(sameSeam(undefined, after[0])).toBe(false);
  });
});
