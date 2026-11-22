import { createEffect, createMemo, onCleanup, onMount } from "solid-js";
import { isTextField } from "../keys/typing.ts";
import { markKeyboardHome, useKeyboardScope } from "../shell/keyboard-claim.ts";
import { isElement, styleOf, windowOf } from "../surfaces/runtime/realm.ts";
import { everyWindow, listenInEveryWindow } from "../surfaces/runtime/windows.ts";

export function keepKeyboardHome(
  root: () => HTMLElement | undefined,
  focused: () => boolean,
): void {
  const keyboard = useKeyboardScope();
  onMount(() => {
    const homeward = createMemo(focused);
    const element = root();
    if (element !== undefined) markKeyboardHome(element);
    if (keyboard !== undefined) onCleanup(keyboard.addHome({ element: root, homeward }));
    createEffect(() => {
      keyboard?.homeVersion();
      const element = root();
      if (!homeward() || element === undefined) return;
      if (element.contains(element.ownerDocument.activeElement)) return;
      element.focus({ preventScroll: true });
    });
  });
}

export interface StrayKeys {
  takeHome(target: Element): HTMLElement | undefined;
}

export function sendStrayKeysHome(strays: StrayKeys): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (event.defaultPrevented || !isElement(target) || !isStray(event, target)) return;
    const home = strays.takeHome(target);
    if (home === undefined || event.key !== "Escape") return;
    event.preventDefault();
    home.dispatchEvent(new KeyboardEvent("keydown", escapeAgain));
  };
  return listenInEveryWindow("keydown", onKeyDown);
}

export function holdKeysWherePressed(root: HTMLElement): () => void {
  const onPointerDown = (event: PointerEvent): void => {
    const pressed = event.target;
    if (event.button !== 0 || !isElement(pressed)) return;
    const pane = pressed.closest<HTMLElement>("[data-pane-id]");
    if (pane === null || holdsFocusOfItsOwn(pressed, pane)) return;
    const holder = scrollerBetween(pressed, pane) ?? pane;
    if (!holder.hasAttribute("tabindex")) holder.tabIndex = -1;
  };
  const listener = onPointerDown as EventListener;
  return everyWindow((realm) => {
    const pressedIn = realm === windowOf(root) ? root : realm.document;
    pressedIn.addEventListener("pointerdown", listener, true);
    return () => pressedIn.removeEventListener("pointerdown", listener, true);
  });
}

const escapeAgain: KeyboardEventInit = {
  key: "Escape",
  code: "Escape",
  bubbles: true,
  cancelable: true,
};

const focusables = "a[href], button, input, select, textarea, [tabindex], [contenteditable]";

function isStray(event: KeyboardEvent, target: Element): boolean {
  if (isTextField(target) || event.isComposing || commandHeld(event)) return false;
  return event.key === "Escape" || isTypedCharacter(event.key);
}

function commandHeld(event: KeyboardEvent): boolean {
  const altGraph = event.getModifierState?.("AltGraph") ?? false;
  return (event.ctrlKey || event.altKey || event.metaKey) && !altGraph;
}

function isTypedCharacter(key: string): boolean {
  return [...key].length === 1 && key.trim() !== "";
}

function holdsFocusOfItsOwn(pressed: Element, pane: HTMLElement): boolean {
  const focusable = pressed.closest(focusables);
  return focusable !== null && focusable !== pane && pane.contains(focusable);
}

function scrollerBetween(from: Element, pane: HTMLElement): HTMLElement | undefined {
  for (let at: Element | null = from; at !== null && at !== pane; at = at.parentElement) {
    if (at instanceof HTMLElement && scrolls(at)) return at;
  }
  return undefined;
}

function scrolls(element: HTMLElement): boolean {
  const { overflowY } = styleOf(element);
  return overflowY === "auto" || overflowY === "scroll";
}
