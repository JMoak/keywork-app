import {
  type Detach,
  documentOf,
  focusedIn,
  type Realm,
  restsOnPage,
  settleRealms,
  windowOf,
} from "./realm.ts";

export interface Place {
  readonly parent: Node;
  readonly before: Node | null;
}

export const arrivalMs = 1000;

export function placeOf(node: Node): Place | undefined {
  const parent = node.parentNode;
  return parent === null ? undefined : { parent, before: node.nextSibling };
}

export function transplant(body: HTMLElement, place: Place): () => void {
  const carriesFocus = documentOf(body).hasFocus() || restsOnPage(place.parent);
  const scrolls = scrollsWithin(body);
  const carets = caretsWithin(body);
  const chosen = selectionWithin(body);
  const focused = focusWithin(body);
  place.parent.insertBefore(body, standingBefore(place));
  settleRealms();
  const resettle = (): void => {
    for (const scroll of scrolls) restoreScroll(scroll);
  };
  resettle();
  if (carriesFocus) focused?.focus({ preventScroll: true });
  for (const caret of carets) restoreCaret(caret);
  if (carriesFocus && chosen !== undefined) select(chosen, body);
  return resettle;
}

export function resettleWhileArriving(realm: Realm, resettle: () => void): Detach {
  const stop = (): void => {
    clearTimeout(arrived);
    realm.removeEventListener("resize", resettle);
    for (const type of keeperInput) realm.removeEventListener(type, stop, true);
  };
  const arrived = setTimeout(stop, arrivalMs);
  realm.addEventListener("resize", resettle);
  for (const type of keeperInput) realm.addEventListener(type, stop, true);
  return stop;
}

interface Scrolled {
  readonly element: Element;
  readonly top: number;
  readonly left: number;
  readonly atEnd: boolean;
}

type TextField = HTMLInputElement | HTMLTextAreaElement;

interface Caret {
  readonly field: TextField;
  readonly start: number;
  readonly end: number;
  readonly direction: "forward" | "backward" | "none";
}

interface Chosen {
  readonly anchorNode: Node;
  readonly anchorOffset: number;
  readonly focusNode: Node;
  readonly focusOffset: number;
}

const keeperInput = ["wheel", "pointerdown", "keydown", "touchstart"] as const;

function standingBefore(place: Place): Node | null {
  return place.before?.parentNode === place.parent ? place.before : null;
}

function scrollsWithin(body: Element): Scrolled[] {
  return [body, ...body.querySelectorAll("*")].flatMap((element) => {
    const { scrollTop: top, scrollLeft: left } = element;
    if (top === 0 && left === 0) return [];
    return [{ element, top, left, atEnd: restsAtEnd(element) }];
  });
}

function restsAtEnd(element: Element): boolean {
  const reach = element.scrollHeight - element.clientHeight;
  return reach > 0 && element.scrollTop >= reach - 1;
}

function restoreScroll({ element, top, left, atEnd }: Scrolled): void {
  element.scrollTo({ top: atEnd ? element.scrollHeight : top, left, behavior: "instant" });
}

function caretsWithin(body: Element): Caret[] {
  return [...body.querySelectorAll<TextField>("textarea, input")].flatMap((field) => {
    const { selectionStart: start, selectionEnd: end } = field;
    if (start === null || end === null || (start === 0 && end === 0)) return [];
    return [{ field, start, end, direction: field.selectionDirection ?? "none" }];
  });
}

function restoreCaret({ field, start, end, direction }: Caret): void {
  field.setSelectionRange(start, end, direction);
}

function focusWithin(body: Element): HTMLElement | undefined {
  const focused = focusedIn(body);
  return focused !== null && body.contains(focused) && canFocus(focused) ? focused : undefined;
}

function canFocus(element: Element): element is HTMLElement {
  return "focus" in element && typeof element.focus === "function";
}

function selectionWithin(body: Node): Chosen | undefined {
  const selection = documentOf(body).getSelection();
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return undefined;
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  if (anchorNode === null || focusNode === null) return undefined;
  if (!body.contains(anchorNode) || !body.contains(focusNode)) return undefined;
  return { anchorNode, anchorOffset, focusNode, focusOffset };
}

function select(chosen: Chosen, body: Node): void {
  windowOf(body)
    .getSelection()
    ?.setBaseAndExtent(
      chosen.anchorNode,
      chosen.anchorOffset,
      chosen.focusNode,
      chosen.focusOffset,
    );
}
