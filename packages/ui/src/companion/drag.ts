export interface Point {
  x: number;
  y: number;
}

export type Facing = "left" | "right";

export type DragState =
  | { kind: "idle" }
  | { kind: "pressed"; origin: Point; at: number }
  | { kind: "held" }
  | { kind: "dragging"; last: Point; facing: Facing };

export type DragInput =
  | { type: "down"; x: number; y: number; t: number }
  | { type: "move"; x: number; y: number; t: number }
  | { type: "up"; t: number }
  | { type: "tick"; t: number }
  | { type: "cancel" };

export type DragEffect =
  | { kind: "drag"; dx: number; dy: number }
  | { kind: "face"; facing: Facing }
  | { kind: "dragEnd" }
  | { kind: "click" }
  | { kind: "hold" };

export interface DragStep {
  state: DragState;
  effects: readonly DragEffect[];
}

export const dragThreshold = 4;
export const holdMs = 600;

export const idleDrag: DragState = { kind: "idle" };

export function advanceDrag(state: DragState, input: DragInput): DragStep {
  switch (input.type) {
    case "down":
      return {
        state: { kind: "pressed", origin: { x: input.x, y: input.y }, at: input.t },
        effects: [],
      };
    case "move":
      return moved(state, input);
    case "up":
      return released(state, input.t);
    case "tick":
      if (state.kind === "pressed" && input.t - state.at >= holdMs) {
        return { state: { kind: "held" }, effects: [{ kind: "hold" }] };
      }
      return { state, effects: [] };
    case "cancel":
      return { state: idleDrag, effects: state.kind === "dragging" ? [{ kind: "dragEnd" }] : [] };
  }
}

function moved(state: DragState, input: { x: number; y: number }): DragStep {
  if (state.kind === "pressed") {
    const dx = input.x - state.origin.x;
    const dy = input.y - state.origin.y;
    if (Math.hypot(dx, dy) < dragThreshold) return { state, effects: [] };
    const facing = facingOf(dx, "right");
    return {
      state: { kind: "dragging", last: { x: input.x, y: input.y }, facing },
      effects: [
        { kind: "face", facing },
        { kind: "drag", dx, dy },
      ],
    };
  }
  if (state.kind === "dragging") {
    const dx = input.x - state.last.x;
    const dy = input.y - state.last.y;
    const facing = facingOf(dx, state.facing);
    const turned = facing !== state.facing;
    return {
      state: { kind: "dragging", last: { x: input.x, y: input.y }, facing },
      effects: [...(turned ? [{ kind: "face", facing } as const] : []), { kind: "drag", dx, dy }],
    };
  }
  return { state, effects: [] };
}

function released(state: DragState, t: number): DragStep {
  switch (state.kind) {
    case "pressed":
      return { state: idleDrag, effects: t - state.at < holdMs ? [{ kind: "click" }] : [] };
    case "dragging":
      return { state: idleDrag, effects: [{ kind: "dragEnd" }] };
    default:
      return { state: idleDrag, effects: [] };
  }
}

function facingOf(dx: number, previous: Facing): Facing {
  if (dx > 0) return "right";
  if (dx < 0) return "left";
  return previous;
}
