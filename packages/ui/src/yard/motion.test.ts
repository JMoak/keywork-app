import { batch, createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import type { Rect } from "../layout/index.ts";
import { createGlide } from "./motion.ts";

const from: Rect = { x: 0, y: 0, width: 100, height: 100 };
const to: Rect = { x: 400, y: 0, width: 600, height: 400 };

describe("the yard's glide", () => {
  it("springs a moved rect toward its target frame by frame and comes to rest on it", () => {
    const run = glideRun(false);
    run.setTarget(to);
    expect(run.shown()).toEqual(from);
    run.frame(30);
    const midway = run.shown();
    expect(midway.x).toBeGreaterThan(from.x);
    expect(midway.x).toBeLessThan(to.x);
    for (let at = 0; at < 60; at += 1) run.frame(16);
    expect(run.shown()).toEqual(to);
    expect(run.pending()).toBe(0);
    run.dispose();
  });

  it("snaps under reduced motion and schedules no frame", () => {
    const run = glideRun(true);
    run.setTarget(to);
    expect(run.shown()).toEqual(to);
    expect(run.pending()).toBe(0);
    run.dispose();
  });

  it("snaps when the field itself is resized, so the window never drags the yard behind it", () => {
    const run = glideRun(false);
    batch(() => {
      run.setSize("2x2");
      run.setTarget(to);
    });
    expect(run.shown()).toEqual(to);
    expect(run.pending()).toBe(0);
    run.dispose();
  });
});

function glideRun(reduced: boolean) {
  let now = 0;
  const queue: Array<() => void> = [];
  return createRoot((dispose) => {
    const [target, setTarget] = createSignal<Rect>(from);
    const [size, setSize] = createSignal("1x1");
    const glide = createGlide(() => new Map([["satellite", target()]]), {
      reducedMotion: () => reduced,
      tick: (flush) => void queue.push(flush),
      now: () => now,
      snapOn: size,
    });
    return {
      shown: (): Rect => glide().get("satellite") as Rect,
      setTarget: (rect: Rect) => setTarget(rect),
      setSize: (key: string) => setSize(key),
      pending: () => queue.length,
      frame: (ms: number) => {
        now += ms;
        queue.splice(0).forEach((flush) => {
          flush();
        });
      },
      dispose,
    };
  });
}
