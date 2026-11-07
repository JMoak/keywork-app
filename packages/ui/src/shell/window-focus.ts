import { createSignal, onCleanup } from "solid-js";

export interface FocusableWindow {
  hasFocus(): boolean;
  addEventListener(type: "focus" | "blur", listener: () => void): void;
  removeEventListener(type: "focus" | "blur", listener: () => void): void;
}

export function windowFocus(target: FocusableWindow | undefined = browserWindow()): () => boolean {
  const [focused, setFocused] = createSignal(target?.hasFocus() ?? true);
  if (target === undefined) return focused;
  const gained = (): void => void setFocused(true);
  const lost = (): void => void setFocused(false);
  target.addEventListener("focus", gained);
  target.addEventListener("blur", lost);
  onCleanup(() => {
    target.removeEventListener("focus", gained);
    target.removeEventListener("blur", lost);
  });
  return focused;
}

function browserWindow(): FocusableWindow | undefined {
  if (typeof window === "undefined" || typeof document === "undefined") return undefined;
  return {
    hasFocus: () => document.hasFocus(),
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener),
  };
}
