import { createEffect } from "solid-js";

export function keepKeyboardHome(
  root: () => HTMLElement | undefined,
  focused: () => boolean,
): void {
  createEffect(() => {
    const element = root();
    if (!focused() || element === undefined) return;
    if (element.contains(document.activeElement)) return;
    element.focus({ preventScroll: true });
  });
}
