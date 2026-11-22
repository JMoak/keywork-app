import { afterEach, describe, expect, it, vi } from "vitest";
import type { Realm } from "./realm.ts";
import { leavingWitness, lossyScroller, openChild } from "./testing.ts";
import { arrivalMs, placeOf, resettleWhileArriving, transplant } from "./transplant.ts";

const children: Realm[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const child of children.splice(0)) child.close();
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe("moving a pane body into another document and back", () => {
  it("moves the same nodes, and puts the body back where it stood among its siblings", () => {
    const child = secondWindow();
    const { slot, body, before, after } = paneBody();
    const field = body.querySelector("textarea");
    const home = placeOf(body);
    transplant(body, { parent: child.document.body, before: null });
    expect(body.ownerDocument).toBe(child.document);
    expect(body.querySelector("textarea")).toBe(field);
    expect([...slot.children]).toEqual([before, after]);
    transplant(body, home as NonNullable<typeof home>);
    expect(body.ownerDocument).toBe(document);
    expect([...slot.children]).toEqual([before, body, after]);
  });

  it("keeps the scroll offsets of every scrolled descendant, which the platform drops", () => {
    const child = secondWindow();
    const { body } = paneBody();
    const transcript = scroller(body, 240, 0);
    const code = scroller(transcript, 12, 96);
    const untouched = scroller(body, 0, 0);
    const home = placeOf(body) as NonNullable<ReturnType<typeof placeOf>>;
    transplant(body, { parent: child.document.body, before: null });
    expect(offsets(transcript, code, untouched)).toEqual([240, 0, 12, 96, 0, 0]);
    transcript.scrollTop = 310;
    transplant(body, home);
    expect(offsets(transcript, code, untouched)).toEqual([310, 0, 12, 96, 0, 0]);
  });

  it("keeps a scroller that rested at its end at the end of its new layout", () => {
    const child = secondWindow();
    const { body } = paneBody();
    const transcript = scroller(body, 800, 0);
    layout(transcript, {
      clientHeight: 200,
      scrollHeight: (page) => (page === document ? 1000 : 1400),
    });
    transplant(body, { parent: child.document.body, before: null });
    expect(transcript.scrollTop).toBe(1400);
  });

  it("returns keyboard focus to the element that held it, in whichever document it lands", () => {
    const child = secondWindow();
    const { body } = paneBody();
    const field = body.querySelector("textarea") as HTMLTextAreaElement;
    const home = placeOf(body) as NonNullable<ReturnType<typeof placeOf>>;
    field.focus();
    transplant(body, { parent: child.document.body, before: null });
    expect(child.document.activeElement).toBe(field);
    expect(document.activeElement).toBe(document.body);
    transplant(body, home);
    expect(document.activeElement).toBe(field);
  });

  it("leaves focus where the keeper is typing when the returning pane was not the one in use", () => {
    const child = secondWindow();
    const { body } = paneBody();
    const stale = body.querySelector("textarea") as HTMLTextAreaElement;
    const home = placeOf(body) as NonNullable<ReturnType<typeof placeOf>>;
    stale.focus();
    transplant(body, { parent: child.document.body, before: null });
    const inUse = document.createElement("textarea");
    document.body.append(inUse);
    inUse.focus();
    child.document.hasFocus = () => false;
    transplant(body, home);
    expect(document.activeElement).toBe(inUse);
  });

  it("carries a text selection that lies inside the body", () => {
    const child = secondWindow();
    const { body } = paneBody();
    const prose = document.createElement("p");
    prose.textContent = "the reply the keeper was reading";
    body.append(prose);
    const text = prose.firstChild as Text;
    window.getSelection()?.setBaseAndExtent(text, 4, text, 9);
    transplant(body, { parent: child.document.body, before: null });
    const carried = child.getSelection();
    expect(carried?.anchorNode).toBe(text);
    expect(carried?.anchorOffset).toBe(4);
    expect(carried?.focusOffset).toBe(9);
  });

  it("keeps the caret of every text field, which Chromium resets when a field changes page", () => {
    const child = secondWindow();
    const { body } = paneBody();
    const draft = body.querySelector("textarea") as HTMLTextAreaElement;
    const aside = document.createElement("input");
    const tick = document.createElement("input");
    tick.type = "checkbox";
    const resetsOnLeaving = leavingWitness(() => {
      draft.setSelectionRange(0, 0);
      aside.setSelectionRange(0, 0);
    });
    resetsOnLeaving.append(draft, aside, tick);
    body.append(resetsOnLeaving);
    draft.value = "a draft the keeper is typing";
    aside.value = "a name";
    draft.focus();
    draft.setSelectionRange(8, 14, "backward");
    aside.setSelectionRange(2, 2);
    const home = placeOf(body) as NonNullable<ReturnType<typeof placeOf>>;
    transplant(body, { parent: child.document.body, before: null });
    expect(caretOf(draft)).toEqual([8, 14, "backward"]);
    expect(caretOf(aside).slice(0, 2)).toEqual([2, 2]);
    expect(child.document.activeElement).toBe(draft);
    draft.setSelectionRange(3, 3);
    transplant(body, home);
    expect(caretOf(draft).slice(0, 2)).toEqual([3, 3]);
  });

  it("leaves a caret alone as a selection, so typing stays in the field it was in", () => {
    const child = secondWindow();
    const { body } = paneBody();
    const prose = document.createElement("p");
    prose.textContent = "the reply";
    body.append(prose);
    const text = prose.firstChild as Text;
    window.getSelection()?.setBaseAndExtent(text, 4, text, 4);
    transplant(body, { parent: child.document.body, before: null });
    expect(child.getSelection()?.anchorNode).not.toBe(text);
  });

  it("comes back from a window that was closed underneath it", () => {
    const child = secondWindow();
    const { slot, body } = paneBody();
    const home = placeOf(body) as NonNullable<ReturnType<typeof placeOf>>;
    transplant(body, { parent: child.document.body, before: null });
    child.close();
    transplant(body, home);
    expect(body.ownerDocument).toBe(document);
    expect(body.isConnected).toBe(true);
    expect(slot.contains(body)).toBe(true);
  });

  it("lands at the end when the sibling it stood before has gone", () => {
    const child = secondWindow();
    const { slot, body, before, after } = paneBody();
    const home = placeOf(body) as NonNullable<ReturnType<typeof placeOf>>;
    transplant(body, { parent: child.document.body, before: null });
    after.remove();
    transplant(body, home);
    expect([...slot.children]).toEqual([before, body]);
  });
});

describe("settling scroll while a pane arrives", () => {
  it("applies the offsets again when the window takes its size, until the keeper touches it", () => {
    vi.useFakeTimers();
    const child = secondWindow();
    let settles = 0;
    resettleWhileArriving(child, () => (settles += 1));
    child.dispatchEvent(new Event("resize"));
    child.dispatchEvent(new Event("resize"));
    child.document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    child.dispatchEvent(new Event("resize"));
    expect(settles).toBe(2);
  });

  it("stops by itself once the arrival is over", () => {
    vi.useFakeTimers();
    const child = secondWindow();
    let settles = 0;
    resettleWhileArriving(child, () => (settles += 1));
    vi.advanceTimersByTime(arrivalMs);
    child.dispatchEvent(new Event("resize"));
    expect(settles).toBe(0);
  });
});

function secondWindow(): Realm {
  const child = openChild();
  children.push(child);
  return child;
}

function paneBody() {
  const slot = document.createElement("div");
  const before = document.createElement("span");
  const body = document.createElement("section");
  const after = document.createElement("span");
  body.append(document.createElement("textarea"));
  slot.append(before, body, after);
  document.body.append(slot);
  return { slot, body, before, after };
}

function scroller(parent: Element, top: number, left: number): HTMLElement {
  const element = lossyScroller();
  parent.append(element);
  element.scrollTop = top;
  element.scrollLeft = left;
  return element;
}

function caretOf(field: HTMLInputElement | HTMLTextAreaElement): Array<number | string | null> {
  return [field.selectionStart, field.selectionEnd, field.selectionDirection];
}

function offsets(...scrollers: readonly HTMLElement[]): number[] {
  return scrollers.flatMap((element) => [element.scrollTop, element.scrollLeft]);
}

function layout(
  element: HTMLElement,
  box: { clientHeight: number; scrollHeight: (page: Document) => number },
): void {
  Object.defineProperty(element, "clientHeight", { value: box.clientHeight });
  Object.defineProperty(element, "scrollHeight", {
    get: () => box.scrollHeight(element.ownerDocument),
  });
}
