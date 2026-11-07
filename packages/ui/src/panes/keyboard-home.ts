import { createEffect } from "solid-js";
import { useKeyboardScope } from "../shell/keyboard-claim.ts";

export function keepKeyboardHome(
  root: () => HTMLElement | undefined,
  focused: () => boolean,
): void {
  const keyboard = useKeyboardScope();
  createEffect(() => {
    keyboard?.homeVersion();
    const element = root();
    if (!focused() || element === undefined) return;
    if (element.contains(element.ownerDocument.activeElement)) return;
    element.focus({ preventScroll: true });
  });
}
