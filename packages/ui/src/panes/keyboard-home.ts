import { createEffect, createSignal } from "solid-js";

const [returns, setReturns] = createSignal(0);

export function keepKeyboardHome(
  root: () => HTMLElement | undefined,
  focused: () => boolean,
): void {
  createEffect(() => {
    returns();
    const element = root();
    if (!focused() || element === undefined) return;
    if (element.contains(document.activeElement)) return;
    element.focus({ preventScroll: true });
  });
}

export function returnKeyboardHome(): void {
  setReturns((count) => count + 1);
}
