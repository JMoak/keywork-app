import { afterEach, describe, expect, it } from "vitest";
import {
  documentOf,
  focusedIn,
  followMedia,
  inWindowOf,
  isElement,
  isPageBody,
  mediaMatches,
  observeSize,
  pixelRatioOf,
  type Realm,
  requestFrame,
  restsOnPage,
  settleRealms,
  styleOf,
  whenWindowChanges,
  windowOf,
} from "./realm.ts";
import { openChild } from "./testing.ts";

const children: Realm[] = [];
const consoleObserver = window.ResizeObserver;
const consoleMedia = window.matchMedia;

afterEach(() => {
  for (const child of children.splice(0)) child.close();
  document.body.replaceChildren();
  window.ResizeObserver = consoleObserver;
  window.matchMedia = consoleMedia;
});

describe("a node's own window", () => {
  it("names the window and document a node lives in, wherever it was made", () => {
    const child = secondWindow();
    const node = document.createElement("div");
    document.body.append(node);
    expect(windowOf(node)).toBe(window);
    expect(documentOf(node)).toBe(document);
    child.document.body.append(node);
    expect(windowOf(node)).toBe(child);
    expect(documentOf(node)).toBe(child.document);
    expect(documentOf(child.document)).toBe(child.document);
  });

  it("reads focus from the node's own document", () => {
    const child = secondWindow();
    const inside = field(document);
    const outside = field(document);
    child.document.body.append(outside);
    inside.focus();
    outside.focus();
    expect(focusedIn(inside)).toBe(inside);
    expect(focusedIn(outside)).toBe(outside);
    outside.blur();
    expect(restsOnPage(outside)).toBe(true);
    expect(restsOnPage(inside)).toBe(false);
  });

  it("knows a page body and an element without asking which window made them", () => {
    const child = secondWindow();
    expect(isPageBody(child.document.body)).toBe(true);
    expect(isPageBody(document.body)).toBe(true);
    expect(isPageBody(field(document))).toBe(false);
    expect(isElement(child.document.body)).toBe(true);
    expect(isElement(child.document)).toBe(false);
    expect(isElement(null)).toBe(false);
  });

  it("asks the node's own window for media, computed style and pixel ratio", () => {
    const child = secondWindow();
    const node = field(document);
    child.document.body.append(node);
    const asked: string[] = [];
    child.matchMedia = (query) => {
      asked.push(query);
      return { matches: true } as MediaQueryList;
    };
    child.getComputedStyle = (element) => {
      asked.push(`style of ${(element as Element).localName}`);
      return {} as CSSStyleDeclaration;
    };
    Object.defineProperty(child, "devicePixelRatio", { value: 2.5, configurable: true });
    expect(mediaMatches(node, "(forced-colors: active)")).toBe(true);
    styleOf(node);
    expect(pixelRatioOf(node)).toBe(2.5);
    expect(asked).toEqual(["(forced-colors: active)", "style of textarea"]);
  });

  it("takes animation frames from the node's own window and cancels them there", () => {
    const child = secondWindow();
    const node = field(document);
    child.document.body.append(node);
    const frames: string[] = [];
    child.requestAnimationFrame = () => frames.push("requested outside");
    child.cancelAnimationFrame = (frame) => void frames.push(`cancelled ${frame}`);
    requestFrame(node, () => undefined)();
    expect(frames).toEqual(["requested outside", "cancelled 1"]);
  });
});

describe("following a node across windows", () => {
  it("attaches in the node's window and moves the attachment when the node moves", () => {
    const child = secondWindow();
    const node = field(document);
    const log: string[] = [];
    const stop = inWindowOf(node, (realm) => {
      log.push(`attach ${nameOf(realm, child)}`);
      return () => log.push(`detach ${nameOf(realm, child)}`);
    });
    settleRealms();
    child.document.body.append(node);
    settleRealms();
    document.body.append(node);
    settleRealms();
    stop();
    settleRealms();
    expect(log).toEqual([
      "attach console",
      "detach console",
      "attach outside",
      "detach outside",
      "attach console",
      "detach console",
    ]);
  });

  it("reports only the changes of window, never the first one", () => {
    const child = secondWindow();
    const node = field(document);
    const seen: string[] = [];
    const stop = whenWindowChanges(node, (realm) => seen.push(nameOf(realm, child)));
    child.document.body.append(node);
    settleRealms();
    stop();
    expect(seen).toEqual(["outside"]);
  });

  it("observes size with the observer of the node's window, and again after the node moves", () => {
    const child = secondWindow();
    const inside = recordingObserver("console");
    const outside = recordingObserver("outside");
    window.ResizeObserver = inside.observer;
    child.ResizeObserver = outside.observer;
    const node = field(document);
    const widths: number[] = [];
    const stop = observeSize(node, ([entry]) => widths.push(entry?.contentRect.width ?? 0));
    inside.resize(node, 320);
    child.document.body.append(node);
    settleRealms();
    inside.resize(node, 999);
    outside.resize(node, 480);
    stop();
    outside.resize(node, 999);
    expect(widths).toEqual([320, 480]);
    expect([...inside.log, ...outside.log]).toEqual([
      "console observes textarea",
      "console disconnects",
      "outside observes textarea",
      "outside disconnects",
    ]);
  });

  it("listens to a media query in the node's window and moves with the node", () => {
    const child = secondWindow();
    const inside = recordingMedia();
    const outside = recordingMedia();
    window.matchMedia = inside.matchMedia;
    child.matchMedia = outside.matchMedia;
    const node = field(document);
    let changes = 0;
    const stop = followMedia(node, "(resolution: 2dppx)", () => (changes += 1));
    inside.change();
    child.document.body.append(node);
    settleRealms();
    inside.change();
    outside.change();
    stop();
    outside.change();
    expect(changes).toBe(2);
  });
});

function secondWindow(): Realm {
  const child = openChild();
  children.push(child);
  return child;
}

function field(page: Document): HTMLTextAreaElement {
  const element = page.createElement("textarea");
  page.body.append(element);
  return element;
}

function nameOf(realm: Realm, child: Realm): string {
  return realm === child ? "outside" : "console";
}

function recordingObserver(name: string) {
  const log: string[] = [];
  const live = new Map<Element, ResizeObserverCallback>();
  class Recording {
    private readonly watched = new Set<Element>();
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(element: Element): void {
      log.push(`${name} observes ${element.localName}`);
      this.watched.add(element);
      live.set(element, this.callback);
    }
    unobserve(): void {}
    disconnect(): void {
      log.push(`${name} disconnects`);
      for (const element of this.watched) live.delete(element);
    }
  }
  return {
    log,
    observer: Recording as unknown as typeof ResizeObserver,
    resize: (element: Element, width: number): void => {
      const entry = { target: element, contentRect: { width } } as ResizeObserverEntry;
      live.get(element)?.([entry], {} as ResizeObserver);
    },
  };
}

function recordingMedia() {
  const listeners = new Set<() => void>();
  return {
    matchMedia: (() => ({
      matches: false,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })) as unknown as typeof window.matchMedia,
    change: (): void => {
      for (const listener of [...listeners]) listener();
    },
  };
}
