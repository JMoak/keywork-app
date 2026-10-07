import { createSignal, onCleanup } from "solid-js";
import {
  advancePointer,
  type Grip,
  idlePointer,
  type Point,
  type PointerInput,
  type PointerIntent,
  type PointerState,
  type Scene,
} from "../layout/index.ts";

export interface PointerGestureOptions {
  readonly scene: () => Scene;
  readonly apply: (intent: PointerIntent) => void;
}

export interface PointerGestures {
  readonly state: () => PointerState;
  readonly dispose: () => void;
}

export const titleRowSelector = ".kw-frame-title";

export function bindPointerGestures(
  stage: HTMLElement,
  options: PointerGestureOptions,
): PointerGestures {
  const [state, setState] = createSignal<PointerState>(idlePointer);

  const feed = (input: PointerInput): void => {
    const step = advancePointer(state(), input, options.scene());
    setState(step.state);
    if (step.intent !== undefined) options.apply(step.intent);
    if (step.state.phase === "idle") release();
  };
  const localPoint = (event: PointerEvent): Point => {
    const bounds = stage.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const onMove = (event: PointerEvent): void => feed({ type: "move", ...localPoint(event) });
  const onUp = (event: PointerEvent): void => feed({ type: "up", ...localPoint(event) });
  const onCancel = (): void => feed({ type: "cancel" });
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || state().phase === "idle") return;
    event.preventDefault();
    event.stopPropagation();
    feed({ type: "cancel" });
  };
  const follow = (): void => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onCancel);
    window.addEventListener("keydown", onEscape, true);
  };
  const release = (): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("blur", onCancel);
    window.removeEventListener("keydown", onEscape, true);
  };

  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const grip = gripOf(event.target);
    feed({ type: "down", grip, ...localPoint(event) });
    if (state().phase === "idle") return;
    if (grip === "title" || state().phase === "resizing") event.preventDefault();
    follow();
  };
  stage.addEventListener("pointerdown", onDown);
  onCleanup(() => {
    stage.removeEventListener("pointerdown", onDown);
    release();
  });

  return { state, dispose: release };
}

function gripOf(target: EventTarget | null): Grip {
  return target instanceof Element && target.closest(titleRowSelector) !== null ? "title" : "body";
}
