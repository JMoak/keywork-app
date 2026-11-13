import type { Rect } from "./geometry.ts";
import {
  type DropZone,
  dropZoneAt,
  floatingAt,
  type Hit,
  hitAt,
  type Point,
  ratioAlong,
  type Scene,
  type Seam,
  type SeamHandle,
} from "./hit.ts";
import type { PaneId } from "./tree.ts";

export type Grip = "title" | "body" | "corner";

export type PointerInput =
  | { readonly type: "down"; readonly x: number; readonly y: number; readonly grip: Grip }
  | { readonly type: "move"; readonly x: number; readonly y: number }
  | { readonly type: "up"; readonly x: number; readonly y: number }
  | { readonly type: "cancel" };

export type PointerState =
  | { readonly phase: "idle" }
  | { readonly phase: "pressed"; readonly hit: Hit; readonly origin: Point; readonly grip: Grip }
  | { readonly phase: "resizing"; readonly seam: Seam }
  | { readonly phase: "dragging"; readonly id: PaneId; readonly over: DropZone | undefined }
  | { readonly phase: "moving"; readonly id: PaneId; readonly grab: Point }
  | { readonly phase: "sizing"; readonly id: PaneId; readonly anchor: Point };

export type PointerIntent =
  | { readonly type: "focus"; readonly id: PaneId }
  | { readonly type: "resize"; readonly handle: SeamHandle; readonly ratio: number }
  | { readonly type: "drop"; readonly id: PaneId; readonly zone: DropZone }
  | { readonly type: "place"; readonly id: PaneId; readonly rect: Rect };

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
    case "moving":
      return input.type === "move"
        ? { state, intent: placeIntent(state.id, movedRect(state, input, scene)) }
        : { state: idlePointer };
    case "sizing":
      return input.type === "move"
        ? { state, intent: placeIntent(state.id, sizedRect(state, input)) }
        : { state: idlePointer };
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
  if (state.grip === "body" || !beyondThreshold(state.origin, input)) return { state };
  const afloat = floatingRect(scene, state.hit.id, state.origin);
  if (afloat === undefined) {
    if (state.grip !== "title") return { state };
    return { state: { phase: "dragging", id: state.hit.id, over: dropZoneAt(scene, input) } };
  }
  const held: PointerState =
    state.grip === "corner"
      ? { phase: "sizing", id: state.hit.id, anchor: { x: afloat.x, y: afloat.y } }
      : {
          phase: "moving",
          id: state.hit.id,
          grab: { x: state.origin.x - afloat.x, y: state.origin.y - afloat.y },
        };
  return advancePointer(held, { type: "move", ...input }, scene);
}

function floatingRect(scene: Scene, id: PaneId, at: Point): Rect | undefined {
  return floatingAt(scene, at) === id ? scene.rects.get(id) : undefined;
}

function movedRect(
  state: Extract<PointerState, { phase: "moving" }>,
  point: Point,
  scene: Scene,
): Rect | undefined {
  const held = scene.rects.get(state.id);
  if (held === undefined) return undefined;
  return { ...held, x: point.x - state.grab.x, y: point.y - state.grab.y };
}

function sizedRect(state: Extract<PointerState, { phase: "sizing" }>, point: Point): Rect {
  return {
    ...state.anchor,
    width: Math.max(0, point.x - state.anchor.x),
    height: Math.max(0, point.y - state.anchor.y),
  };
}

function placeIntent(id: PaneId, rect: Rect | undefined): PointerIntent | undefined {
  return rect === undefined ? undefined : { type: "place", id, rect };
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
