import {
  type DropZone,
  dropZoneAt,
  type Hit,
  hitAt,
  type Point,
  ratioAlong,
  type Scene,
  type Seam,
  type SeamHandle,
} from "./hit.ts";
import type { PaneId } from "./tree.ts";

export type Grip = "title" | "body";

export type PointerInput =
  | { readonly type: "down"; readonly x: number; readonly y: number; readonly grip: Grip }
  | { readonly type: "move"; readonly x: number; readonly y: number }
  | { readonly type: "up"; readonly x: number; readonly y: number }
  | { readonly type: "cancel" };

export type PointerState =
  | { readonly phase: "idle" }
  | { readonly phase: "pressed"; readonly hit: Hit; readonly origin: Point; readonly grip: Grip }
  | { readonly phase: "resizing"; readonly seam: Seam }
  | { readonly phase: "dragging"; readonly id: PaneId; readonly over: DropZone | undefined };

export type PointerIntent =
  | { readonly type: "focus"; readonly id: PaneId }
  | { readonly type: "resize"; readonly handle: SeamHandle; readonly ratio: number }
  | { readonly type: "drop"; readonly id: PaneId; readonly zone: DropZone };

export interface PointerStep {
  readonly state: PointerState;
  readonly intent?: PointerIntent | undefined;
}

export const idlePointer: PointerState = { phase: "idle" };
export const dragThreshold = 4;

export function advancePointer(
  state: PointerState,
  input: PointerInput,
  scene: Scene,
): PointerStep {
  if (input.type === "cancel") return { state: idlePointer };
  switch (state.phase) {
    case "idle":
      return input.type === "down" ? press(input, scene) : { state };
    case "pressed":
      return input.type === "move" ? lift(state, input, scene) : { state: idlePointer };
    case "resizing":
      return input.type === "move"
        ? {
            state,
            intent: {
              type: "resize",
              handle: state.seam.handle,
              ratio: ratioAlong(state.seam, input),
            },
          }
        : { state: idlePointer };
    case "dragging":
      if (input.type === "move") return { state: { ...state, over: dropZoneAt(scene, input) } };
      return { state: idlePointer, intent: dropIntent(state, scene) };
  }
}

function press(input: Extract<PointerInput, { type: "down" }>, scene: Scene): PointerStep {
  const hit = hitAt(scene, input);
  if (hit === undefined) return { state: idlePointer };
  const state: PointerState = { phase: "pressed", hit, origin: input, grip: input.grip };
  return hit.kind === "pane" ? { state, intent: { type: "focus", id: hit.id } } : { state };
}

function lift(
  state: Extract<PointerState, { phase: "pressed" }>,
  input: Point,
  scene: Scene,
): PointerStep {
  if (state.hit.kind === "seam") {
    return advancePointer(
      { phase: "resizing", seam: state.hit.seam },
      { type: "move", ...input },
      scene,
    );
  }
  if (state.grip !== "title" || !beyondThreshold(state.origin, input)) return { state };
  return { state: { phase: "dragging", id: state.hit.id, over: dropZoneAt(scene, input) } };
}

function dropIntent(
  state: Extract<PointerState, { phase: "dragging" }>,
  scene: Scene,
): PointerIntent | undefined {
  if (state.over === undefined || scene.homes.get(state.id) === state.over) return undefined;
  return { type: "drop", id: state.id, zone: state.over };
}

function beyondThreshold(origin: Point, point: Point): boolean {
  return (
    Math.abs(point.x - origin.x) >= dragThreshold || Math.abs(point.y - origin.y) >= dragThreshold
  );
}
