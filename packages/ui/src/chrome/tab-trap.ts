export function keepTabWithin(root: HTMLElement): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || event.defaultPrevented || hasCommandModifier(event)) return;
    event.preventDefault();
    nextStop(tabStopsIn(root), document.activeElement, event.shiftKey ? -1 : 1)?.focus();
  };
  root.addEventListener("keydown", onKeyDown);
  return () => root.removeEventListener("keydown", onKeyDown);
}

export function tabStopsIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(focusables)].filter(isTabStop);
}

const focusables = "a[href], button, input, select, textarea, [tabindex]";

function isTabStop(element: HTMLElement): boolean {
  return (
    element.tabIndex >= 0 &&
    !element.hasAttribute("disabled") &&
    element.getClientRects().length > 0
  );
}

function nextStop(
  stops: readonly HTMLElement[],
  current: Element | null,
  step: 1 | -1,
): HTMLElement | undefined {
  if (stops.length === 0) return undefined;
  const at = stops.indexOf(current as HTMLElement);
  if (at === -1) return step > 0 ? stops[0] : stops.at(-1);
  return stops[(at + step + stops.length) % stops.length];
}

function hasCommandModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.metaKey;
}
