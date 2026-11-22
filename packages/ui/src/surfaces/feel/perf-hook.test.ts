import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type FrameSource,
  firstFramePaintedIn,
  offerSurfacesPerfHook,
  type PoppedOutside,
  type SurfacesPerfHook,
  surfacesPerfHookName,
  surfacesPerfRequest,
} from "./perf-hook.ts";

const popped: PoppedOutside = {
  id: "kw-surface:1",
  warm: true,
  bounds: { x: 10, y: 20, width: 480, height: 320 },
  requestedAt: 100,
  shownAt: 112,
  paintedAt: 121,
};
const hook: SurfacesPerfHook = { popOutside: async () => popped };

function aTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("the measuring hook", () => {
  it("is not on the window until the harness asks for it", () => {
    const host = new EventTarget();
    let built = 0;
    offerSurfacesPerfHook(host, () => {
      built += 1;
      return hook;
    });
    expect(Reflect.get(host, surfacesPerfHookName)).toBeUndefined();
    expect(built).toBe(0);
    host.dispatchEvent(new Event(surfacesPerfRequest));
    expect(Reflect.get(host, surfacesPerfHookName)).toBe(hook);
    host.dispatchEvent(new Event(surfacesPerfRequest));
    expect(built).toBe(1);
  });

  it("is withdrawn with the workspace that offered it", () => {
    const host = new EventTarget();
    const withdraw = offerSurfacesPerfHook(host, () => hook);
    host.dispatchEvent(new Event(surfacesPerfRequest));
    withdraw();
    expect(Reflect.get(host, surfacesPerfHookName)).toBeUndefined();
    const unasked = new EventTarget();
    offerSurfacesPerfHook(unasked, () => hook)();
    unasked.dispatchEvent(new Event(surfacesPerfRequest));
    expect(Reflect.get(unasked, surfacesPerfHookName)).toBeUndefined();
  });

  it("is the hook the harness asks for, by the same names", () => {
    const harness = readFileSync(
      join(process.cwd(), "packages/desktop/e2e/surfaces/perf.mjs"),
      "utf8",
    );
    expect(harness).toContain(`const hookName = "${surfacesPerfHookName}";`);
    expect(harness).toContain(`const hookRequest = "${surfacesPerfRequest}";`);
    for (const field of Object.keys(popped)) expect(harness).toContain(`.${field}`);
  });
});

describe("the first painted frame", () => {
  it("is timed once the view's next frame has painted, not before", async () => {
    const frames: FrameRequestCallback[] = [];
    const view: FrameSource = {
      requestAnimationFrame: (callback) => frames.push(callback),
    };
    let clock = 5;
    let painted: number | undefined;
    void firstFramePaintedIn(view, () => clock).then((at) => {
      painted = at;
    });
    await aTask();
    expect(frames).toHaveLength(1);
    expect(painted).toBeUndefined();
    clock = 21;
    frames[0]?.(0);
    expect(painted).toBeUndefined();
    clock = 24;
    await aTask();
    expect(painted).toBe(24);
  });
});
