import type { TickScheduler } from "@keywork-app/client";

export const hiddenBackstopMs = 32;

export function frameTick(
  window: Pick<Window, "requestAnimationFrame" | "setTimeout"> = globalThis,
): TickScheduler {
  return (flush) => {
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
