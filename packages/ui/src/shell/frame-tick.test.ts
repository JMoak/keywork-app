import { describe, expect, it } from "vitest";
import { openChild } from "../surfaces/runtime/testing.ts";
import { admitWindow } from "../surfaces/runtime/windows.ts";
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

  it("takes its frame from a pane's window that is showing while the console is covered", () => {
    const child = openChild();
    const dismiss = admitWindow(child);
    const asked: string[] = [];
    const frames = (name: string) => (callback: FrameRequestCallback) => {
      asked.push(name);
      callback(0);
      return 0;
    };
    const consoleFrames = window.requestAnimationFrame;
    window.requestAnimationFrame = frames("console");
    child.requestAnimationFrame = frames("outside");
    const tick = frameTick();
    tick(() => undefined);
    covered(document, true);
    tick(() => undefined);
    covered(document, false);
    dismiss();
    tick(() => undefined);
    window.requestAnimationFrame = consoleFrames;
    child.close();
    expect(asked).toEqual(["console", "outside", "console"]);
  });
});

function covered(page: Document, hidden: boolean): void {
  Object.defineProperty(page, "visibilityState", {
    value: hidden ? "hidden" : "visible",
    configurable: true,
  });
}
