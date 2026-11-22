import type { ScreenRect, SurfaceId } from "../port.ts";

export const surfacesPerfHookName = "__keyworkPanesOutsidePerf";
export const surfacesPerfRequest = "keywork:panes-outside-perf";

export interface SurfacesPerfHook {
  popOutside(): Promise<PoppedOutside>;
}

export interface PoppedOutside {
  readonly id: SurfaceId;
  readonly warm: boolean;
  readonly bounds: ScreenRect;
  readonly requestedAt: number;
  readonly shownAt: number;
  readonly paintedAt: number;
}

export type FrameSource = Pick<Window, "requestAnimationFrame">;

export function offerSurfacesPerfHook(
  host: EventTarget,
  build: () => SurfacesPerfHook,
): () => void {
  const install = (): void => {
    Reflect.set(host, surfacesPerfHookName, build());
  };
  host.addEventListener(surfacesPerfRequest, install, { once: true });
  return () => {
    host.removeEventListener(surfacesPerfRequest, install);
    Reflect.deleteProperty(host, surfacesPerfHookName);
  };
}

export function firstFramePaintedIn(
  view: FrameSource,
  now: () => number = () => performance.now(),
): Promise<number> {
  return new Promise((resolve) => {
    view.requestAnimationFrame(() => afterThisFramePaints(() => resolve(now())));
  });
}

function afterThisFramePaints(run: () => void): void {
  // A message posted from an animation frame callback arrives after that frame's style, layout and paint.
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = () => {
    port1.close();
    run();
  };
  port2.postMessage(undefined);
}
