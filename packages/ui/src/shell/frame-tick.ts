import type { TickScheduler } from "@keywork-app/client";
import { visibleWindow } from "../surfaces/runtime/windows.ts";

export const hiddenBackstopMs = 32;

export type FrameWindow = Pick<Window, "requestAnimationFrame" | "setTimeout">;

export function frameTick(only?: FrameWindow): TickScheduler {
  return (flush) => {
    const window = only ?? visibleWindow();
    let flushed = false;
    const once = (): void => {
      if (flushed) return;
      flushed = true;
      flush();
    };
    window.requestAnimationFrame(once);
    window.setTimeout(once, hiddenBackstopMs);
  };
}
