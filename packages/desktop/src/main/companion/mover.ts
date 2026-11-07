import type { DragDelta, NudgeStep } from "./channels.ts";
import {
  type DisplayLike,
  displayOf,
  displayUnder,
  homeBounds,
  moved,
  nudgeStep,
  type Point,
  type Rect,
  resizedAtAnchor,
  restoreBounds,
  type Size,
  settled,
  storedFrom,
} from "./placement.ts";
import type { StoredPosition } from "./preferences.ts";
import { type CompanionWindowLike, placeWindow } from "./window.ts";

export interface MoverSeams {
  displays(): readonly DisplayLike[];
  cursor(): Point | undefined;
  positions(): Readonly<Record<string, StoredPosition>>;
  remember(position: StoredPosition): void;
  size(): Size;
}

export interface Mover {
  bounds(): Rect;
  dragging(): boolean;
  drag(delta: DragDelta): void;
  endDrag(): void;
  nudge(step: NudgeStep): void;
  home(): void;
  rehome(): void;
  fit(): void;
}

export function windowMover(window: CompanionWindowLike, seams: MoverSeams): Mover {
  let dragging = false;
  let bounds = window.getBounds();

  const place = (next: Rect): void => {
    bounds = next;
    placeWindow(window, next);
  };
  const remember = (): void => seams.remember(storedFrom(bounds, seams.displays()));
  const areaOf = (rect: Rect): Rect => displayOf(rect, seams.displays()).workArea;

  return {
    bounds: () => bounds,
    dragging: () => dragging,
    drag: (delta) => {
      dragging = true;
      const shifted = { ...bounds, x: bounds.x + delta.dx, y: bounds.y + delta.dy };
      bounds = moved(bounds, delta.dx, delta.dy, areaOf(shifted));
      window.setPosition(bounds.x, bounds.y);
    },
    endDrag: () => {
      if (!dragging) return;
      dragging = false;
      place(settled(bounds, areaOf(bounds)));
      remember();
    },
    nudge: (step) => {
      place(moved(bounds, step.dx * nudgeStep, step.dy * nudgeStep, areaOf(bounds)));
      remember();
    },
    home: () => {
      place(homeBounds(displayUnder(seams.cursor(), seams.displays()), seams.size()));
      remember();
    },
    rehome: () => {
      place(restoreBounds(seams.positions(), seams.displays(), seams.size(), seams.cursor()));
    },
    fit: () => {
      const size = seams.size();
      if (size.width === bounds.width && size.height === bounds.height) return;
      place(resizedAtAnchor(bounds, size, areaOf(bounds)));
    },
  };
}
