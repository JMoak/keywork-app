import type { TickScheduler } from "@keywork-app/client";
import { type Spring, spring, stepSpring, tempos } from "@keywork-app/habitat";
import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";
import type { Rect } from "../layout/index.ts";

export const glideHalfLifeMs = tempos.settle.min / 4;

export interface GlideOptions {
  readonly reducedMotion: Accessor<boolean>;
  readonly tick: TickScheduler;
  readonly now: () => number;
  readonly from?: ((id: string, target: Rect) => Rect) | undefined;
  readonly snapOn?: Accessor<string> | undefined;
}

export function createGlide(
  targets: Accessor<ReadonlyMap<string, Rect>>,
  options: GlideOptions,
): Accessor<ReadonlyMap<string, Rect>> {
  const [shown, setShown] = createSignal<ReadonlyMap<string, Rect>>(new Map());
  let springs = new Map<string, RectSprings>();
  let steppedAt = options.now();
  let scheduled = false;
  let disposed = false;
  let snappedFor = options.snapOn?.();
  onCleanup(() => {
    disposed = true;
  });

  const frame = (): void => {
    scheduled = false;
    if (disposed) return;
    const now = options.now();
    const dt = Math.max(0, now - steppedAt);
    steppedAt = now;
    springs = new Map([...springs].map(([id, held]) => [id, stepRect(held, dt)]));
    setShown(rectsOf(springs));
    if (![...springs.values()].every(restingRect)) schedule();
  };
  const schedule = (): void => {
    if (scheduled || disposed) return;
    scheduled = true;
    steppedAt = options.now();
    options.tick(frame);
  };

  createEffect(() => {
    const wanted = targets();
    const snapKey = options.snapOn?.();
    const snap = options.reducedMotion() || snapKey !== snappedFor;
    snappedFor = snapKey;
    springs = new Map(
      [...wanted].map(([id, target]) => {
        const held = springs.get(id);
        const start = held ?? springsAt(options.from?.(id, target) ?? target);
        return [id, snap ? springsAt(target) : retargeted(start, target)];
      }),
    );
    setShown(rectsOf(springs));
    if (![...springs.values()].every(restingRect)) schedule();
  });

  return shown;
}

interface RectSprings {
  readonly x: Spring;
  readonly y: Spring;
  readonly width: Spring;
  readonly height: Spring;
}

const edges = ["x", "y", "width", "height"] as const;

function springsAt(rect: Rect): RectSprings {
  return {
    x: spring(rect.x, glideHalfLifeMs),
    y: spring(rect.y, glideHalfLifeMs),
    width: spring(rect.width, glideHalfLifeMs),
    height: spring(rect.height, glideHalfLifeMs),
  };
}

function retargeted(held: RectSprings, target: Rect): RectSprings {
  return mapEdges(held, (edge, current) => ({ ...current, target: target[edge] }));
}

function stepRect(held: RectSprings, dt: number): RectSprings {
  return mapEdges(held, (_edge, current) => {
    const stepped = stepSpring(current, dt);
    return restingSpring(stepped) ? { ...stepped, value: stepped.target, velocity: 0 } : stepped;
  });
}

function restingRect(held: RectSprings): boolean {
  return edges.every((edge) => restingSpring(held[edge]));
}

function restingSpring(current: Spring): boolean {
  return Math.abs(current.value - current.target) < 0.5 && Math.abs(current.velocity) < 0.01;
}

function rectsOf(held: ReadonlyMap<string, RectSprings>): ReadonlyMap<string, Rect> {
  return new Map(
    [...held].map(([id, rect]) => [
      id,
      {
        x: Math.round(rect.x.value),
        y: Math.round(rect.y.value),
        width: Math.round(rect.width.value),
        height: Math.round(rect.height.value),
      },
    ]),
  );
}

function mapEdges(
  held: RectSprings,
  change: (edge: (typeof edges)[number], current: Spring) => Spring,
): RectSprings {
  return {
    x: change("x", held.x),
    y: change("y", held.y),
    width: change("width", held.width),
    height: change("height", held.height),
  };
}
