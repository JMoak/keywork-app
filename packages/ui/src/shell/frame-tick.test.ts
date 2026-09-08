import { describe, expect, it } from "vitest";
import { frameTick, hiddenBackstopMs } from "./frame-tick.ts";

interface FakeWindow {
  frames: Array<() => void>;
  timers: Array<{ at: number; run: () => void }>;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  setTimeout: (callback: () => void, ms?: number) => number;
}

function fakeWindow(): FakeWindow {
  const fake: FakeWindow = {
    frames: [],
    timers: [],
    requestAnimationFrame: (callback) => fake.frames.push(() => callback(0)),
    setTimeout: (callback, ms = 0) => fake.timers.push({ at: ms, run: callback }),
  };
  return fake;
}

describe("frameTick", () => {
  it("flushes on the next frame when the window paints", () => {
    const window = fakeWindow();
    let flushes = 0;
    frameTick(window)(() => (flushes += 1));
    window.frames[0]?.();
    window.timers[0]?.run();
    expect(flushes).toBe(1);
  });

  it("flushes on the backstop timer when no frame ever comes", () => {
    const window = fakeWindow();
    let flushes = 0;
    frameTick(window)(() => (flushes += 1));
    expect(window.timers[0]?.at).toBe(hiddenBackstopMs);
    window.timers[0]?.run();
    expect(flushes).toBe(1);
    window.frames[0]?.();
    expect(flushes).toBe(1);
  });
});
