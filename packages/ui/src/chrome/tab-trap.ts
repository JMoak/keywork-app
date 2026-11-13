import { isKeyboardHome } from "../shell/keyboard-claim.ts";

export function keepTabWithin(root: HTMLElement): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || event.defaultPrevented || hasCommandModifier(event)) return;
    const step = event.shiftKey ? -1 : 1;
    const from = event.target instanceof Element ? event.target : document.activeElement;
    const next = stopBeside(tabStopsIn(root), from, step) ?? landingPast(root, step);
    if (next === undefined) return;
    event.preventDefault();
    next.focus();
  };
  root.addEventListener("keydown", onKeyDown);
  return () => root.removeEventListener("keydown", onKeyDown);
}

export function tabStopsIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(focusables)].filter(isTabStop);
}

type Step = 1 | -1;

const focusables = "a[href], button, input, select, textarea, [tabindex]";

const paneBodySelector = ".kw-frame-body";

function isTabStop(element: HTMLElement): boolean {
  return element.tabIndex >= 0 && !element.hasAttribute("disabled") && isShown(element);
}

function isShown(element: HTMLElement): boolean {
  return element.getClientRects().length > 0 && element.closest("[inert]") === null;
}

function stopBeside(
  stops: readonly HTMLElement[],
  current: Element | null,
  step: Step,
): HTMLElement | undefined {
  if (current === null) return undefined;
  const ahead = stops.filter((stop) => follows(stop, current) === step > 0 && stop !== current);
  return step > 0 ? ahead[0] : ahead.at(-1);
}

function follows(stop: Element, current: Element): boolean {
  return (current.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function landingPast(root: HTMLElement, step: Step): HTMLElement | undefined {
  const bodies = paneBodiesFrom(root);
  const onward = step > 0 ? bodies.slice(1) : bodies.slice(1).reverse();
  for (const body of onward) {
    const landing = landingIn(body, step);
    if (landing !== undefined) return landing;
  }
  const around = tabStopsIn(root);
  return step > 0 ? around[0] : around.at(-1);
}

function paneBodiesFrom(root: HTMLElement): HTMLElement[] {
  const scope = root.closest(".kw-workspace") ?? root.ownerDocument;
  const bodies = [...scope.querySelectorAll<HTMLElement>(paneBodySelector)]
    .filter(isShown)
    .sort(inReadingOrder);
  const at = bodies.indexOf(root);
  return at === -1 ? [root] : [...bodies.slice(at), ...bodies.slice(0, at)];
}

function landingIn(body: HTMLElement, step: Step): HTMLElement | undefined {
  const home = [...body.querySelectorAll<HTMLElement>(focusables)].find(isKeyboardHome);
  if (home !== undefined && isShown(home)) return home;
  const stops = tabStopsIn(body);
  return step > 0 ? stops[0] : stops.at(-1);
}

function inReadingOrder(a: HTMLElement, b: HTMLElement): number {
  const left = a.getBoundingClientRect();
  const right = b.getBoundingClientRect();
  return Math.round(left.left - right.left) || Math.round(left.top - right.top);
}

function hasCommandModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.metaKey;
}
