export interface KeyboardOwnership {
  ownsKeyboard(scope: string | undefined): boolean;
}

export interface KeyFocus {
  readonly scope: string | undefined;
  readonly typing: boolean;
}

export function keyFocusOf(
  focusedKind: string | undefined,
  target: EventTarget | null,
  keymap: KeyboardOwnership,
  focusInside = true,
): KeyFocus {
  const owned = keymap.ownsKeyboard(focusedKind);
  if (owned && !focusInside) return { scope: undefined, typing: isTextField(target) };
  return { scope: focusedKind, typing: isTextField(target) && !owned };
}

export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}
