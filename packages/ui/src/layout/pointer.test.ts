import { describe, expect, it } from "vitest";
import type { Screen } from "./geometry.ts";
import type { Scene } from "./hit.ts";
import { Layout } from "./layout.ts";
import {
  advancePointer,
  dragThreshold,
  idlePointer,
  type PointerInput,
  type PointerIntent,
  type PointerState,
} from "./pointer.ts";
import { minPaneSize } from "./tree.ts";

const screen: Screen = { width: 1600, height: 1000 };

function twoMainOneDocked(): Layout {
  const layout = new Layout();
  layout.open("a", screen);
  layout.open("b", screen);
  layout.openInDock("tree", "left", screen);
  return layout;
}

function run(
  scene: Scene,
  inputs: readonly PointerInput[],
  from: PointerState = idlePointer,
): { state: PointerState; intents: PointerIntent[] } {
  const intents: PointerIntent[] = [];
  let state = from;
  for (const input of inputs) {
    const step = advancePointer(state, input, scene);
    state = step.state;
    if (step.intent !== undefined) intents.push(step.intent);
  }
  return { state, intents };
}

const down = (x: number, y: number, grip: "title" | "body" = "body"): PointerInput => ({
  type: "down",
  x,
  y,
  grip,
});
const move = (x: number, y: number): PointerInput => ({ type: "move", x, y });
const up = (x: number, y: number): PointerInput => ({ type: "up", x, y });
const cancel: PointerInput = { type: "cancel" };

describe("the pointer machine", () => {
  it("focuses the pane under a press and settles back to idle on release", () => {
    const scene = twoMainOneDocked().scene(screen);
    const { state, intents } = run(scene, [down(1000, 500), up(1000, 500)]);
    expect(intents).toEqual([{ type: "focus", id: "b" }]);
    expect(state).toEqual(idlePointer);
  });

  it("ignores a press on nothing", () => {
    const scene = twoMainOneDocked().scene(screen);
    expect(run(scene, [down(-5, -5), move(10, 10), up(10, 10)]).intents).toEqual([]);
  });

  it("resizes along a seam with every move and never emits after release", () => {
    const scene = twoMainOneDocked().scene(screen);
    const seam = scene.seams.find((candidate) => candidate.handle.kind === "split");
    const at = seam?.at ?? 0;
    const { state, intents } = run(scene, [
      down(at, 500),
      move(at + 100, 500),
      up(at + 100, 500),
      move(0, 0),
    ]);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ type: "resize", handle: { kind: "split", path: [] } });
    expect(state).toEqual(idlePointer);
  });

  it("drags a pane by its title row only after the threshold and drops it on a dock", () => {
    const scene = twoMainOneDocked().scene(screen);
    const short = run(scene, [down(1000, 10, "title"), move(1000 + dragThreshold - 1, 10)]);
    expect(short.state.phase).toBe("pressed");
    const { state, intents } = run(scene, [
      down(1000, 10, "title"),
      move(1000 + dragThreshold, 10),
      move(10, 500),
      up(10, 500),
    ]);
    expect(intents).toEqual([
      { type: "focus", id: "b" },
      { type: "drop", id: "b", zone: "left" },
    ]);
    expect(state).toEqual(idlePointer);
  });

  it("reports the zone under the drag so the target can lift its ink", () => {
    const scene = twoMainOneDocked().scene(screen);
    const { state } = run(scene, [down(1000, 10, "title"), move(1500, 10), move(1599, 500)]);
    expect(state).toEqual({ phase: "dragging", id: "b", over: "right" });
  });

  it("never drags from the body of a pane", () => {
    const scene = twoMainOneDocked().scene(screen);
    const { state, intents } = run(scene, [down(1000, 500), move(10, 500), up(10, 500)]);
    expect(intents).toEqual([{ type: "focus", id: "b" }]);
    expect(state).toEqual(idlePointer);
  });

  it("treats a drop on the pane's own home as a no-op", () => {
    const scene = twoMainOneDocked().scene(screen);
    const { intents } = run(scene, [
      down(10, 10, "title"),
      move(10, 400),
      up(10, 400),
      down(1000, 10, "title"),
      move(1000, 400),
      up(1000, 400),
    ]);
    expect(intents.filter((intent) => intent.type === "drop")).toEqual([]);
  });

  it("cancels mid-drag and mid-resize without an intent, from escape or pointer loss", () => {
    const scene = twoMainOneDocked().scene(screen);
    const seam = scene.seams.find((candidate) => candidate.handle.kind === "split");
    const dragged = run(scene, [down(1000, 10, "title"), move(500, 500), cancel, up(10, 10)]);
    expect(dragged.state).toEqual(idlePointer);
    expect(dragged.intents).toEqual([{ type: "focus", id: "b" }]);
    const resized = run(scene, [down(seam?.at ?? 0, 500), cancel, move(100, 500), up(100, 500)]);
    expect(resized.intents).toEqual([]);
    expect(resized.state).toEqual(idlePointer);
  });
});

describe("the pointer machine against the layout", () => {
  it("snaps a seam drag to the stepped ratio and holds the minimum pane size exactly as the keyboard verb does", () => {
    const layout = twoMainOneDocked();
    const scene = layout.scene(screen);
    const seam = scene.seams.find((candidate) => candidate.handle.kind === "split");
    if (seam === undefined) throw new Error("expected a split seam");
    const apply = (x: number) => {
      const step = advancePointer({ phase: "resizing", seam }, move(x, 500), scene);
      if (step.intent?.type !== "resize") throw new Error("expected a resize");
      return layout.resizeSeam(step.intent.handle, step.intent.ratio, screen);
    };
    const widthOf = (id: string) => layout.rects(screen).get(id)?.width;
    const mainWidth = scene.regions.main.width;
    const mainX = scene.regions.main.x;
    expect(apply(mainX + mainWidth * 0.33).ok).toBe(true);
    expect(widthOf("a")).toBe(Math.round(mainWidth * 0.35));
    expect(apply(mainX + mainWidth * 0.35)).toEqual({ ok: false, refused: "nothing-to-do" });
    expect(apply(mainX + 1).ok).toBe(true);
    expect(widthOf("a")).toBe(minPaneSize.width);
    expect(widthOf("b")).toBe(mainWidth - minPaneSize.width);
    expect(apply(mainX + mainWidth - 1).ok).toBe(true);
    expect(widthOf("b")).toBe(minPaneSize.width);
    expect(layout.toJSON().tree).toMatchObject({ ratio: 0.9 });
  });

  it("drags a dock seam to a stepped dock ratio", () => {
    const layout = twoMainOneDocked();
    const scene = layout.scene(screen);
    const seam = scene.seams.find((candidate) => candidate.handle.kind === "dock");
    if (seam === undefined) throw new Error("expected a dock seam");
    const step = advancePointer({ phase: "resizing", seam }, move(480, 500), scene);
    if (step.intent?.type !== "resize") throw new Error("expected a resize");
    expect(layout.resizeSeam(step.intent.handle, step.intent.ratio, screen).ok).toBe(true);
    expect(layout.dockRatio("left")).toBeCloseTo(0.3);
  });

  it("sends a dropped pane to its new home through the same verbs the keyboard uses", () => {
    const layout = twoMainOneDocked();
    expect(layout.send("b", "right", screen).ok).toBe(true);
    expect(layout.dockSideOf("b")).toBe("right");
    expect(layout.send("b", "right", screen)).toEqual({ ok: false, refused: "nothing-to-do" });
    expect(layout.send("b", "main", screen).ok).toBe(true);
    expect(layout.dockSideOf("b")).toBeUndefined();
    expect(layout.send("ghost", "left", screen)).toEqual({ ok: false, refused: "unknown-pane" });
  });
});
