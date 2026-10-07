export interface KeyboardOwnership {
  ownsKeyboard(scope: string | undefined): boolean;
}

export function scopeWhileTyping(
  focusedKind: string | undefined,
  target: EventTarget | null,
  keymap: KeyboardOwnership,
): string | undefined {
  const typing = isTextField(target) && !keymap.ownsKeyboard(focusedKind);
  return typing ? undefined : focusedKind;
}

export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}
