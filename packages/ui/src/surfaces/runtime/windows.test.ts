import { afterEach, describe, expect, it } from "vitest";
import type { Realm } from "./realm.ts";
import { openChild } from "./testing.ts";
import {
  admitWindow,
  everyWindow,
  focusedWindow,
  listenInEveryDocument,
  listenInEveryWindow,
  openWindows,
  visibleWindow,
} from "./windows.ts";

const stops: Array<() => void> = [];
const children: Realm[] = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  for (const child of children.splice(0)) child.close();
  document.body.replaceChildren();
});

describe("every window", () => {
  it("attaches to the console, to each window as it appears, and detaches when one goes", () => {
    const log: string[] = [];
    const first = secondWindow();
    const dismissFirst = admit(first);
    stops.push(
      everyWindow((realm) => {
        log.push(`attach ${nameOf(realm)}`);
        return () => log.push(`detach ${nameOf(realm)}`);
      }),
    );
    const later = secondWindow();
    admit(later);
    dismissFirst();
    dismissFirst();
    expect(log).toEqual(["attach console", "attach child 1", "attach child 2", "detach child 1"]);
    expect(openWindows()).toEqual([window, later]);
  });

  it("detaches from every window when the listener is withdrawn", () => {
    const log: string[] = [];
    admit(secondWindow());
    const stop = everyWindow((realm) => {
      log.push(`attach ${nameOf(realm)}`);
      return () => log.push(`detach ${nameOf(realm)}`);
    });
    stop();
    admit(secondWindow());
    expect(log).toEqual(["attach console", "attach child 1", "detach console", "detach child 1"]);
  });

  it("hears a key pressed in any window, the window ahead of its document when capturing", () => {
    const child = secondWindow();
    admit(child);
    const heard: string[] = [];
    stops.push(
      listenInEveryDocument("keydown", (event) => heard.push(`document ${event.key}`), true),
      listenInEveryWindow("keydown", (event) => heard.push(`window ${event.key}`), true),
    );
    press(field(document), "a");
    press(field(child.document), "b");
    expect(heard).toEqual(["window a", "document a", "window b", "document b"]);
  });

  it("stops hearing a window that left, and hears one that arrives after the listener", () => {
    const early = secondWindow();
    const dismiss = admit(early);
    const heard: string[] = [];
    stops.push(listenInEveryWindow("keydown", (event) => void heard.push(event.key)));
    const late = secondWindow();
    admit(late);
    dismiss();
    press(field(early.document), "gone");
    press(field(late.document), "late");
    expect(heard).toEqual(["late"]);
  });

  it("names a window that is showing, the console first", () => {
    const child = secondWindow();
    admit(child);
    expect(visibleWindow()).toBe(window);
    showing(document, false);
    expect(visibleWindow()).toBe(child);
    showing(child.document, false);
    expect(visibleWindow()).toBe(window);
    showing(document, true);
  });

  it("names the window that holds the keeper's focus, the console when none does", () => {
    const child = secondWindow();
    admit(child);
    const consoleFocus = document.hasFocus;
    stops.push(() => {
      document.hasFocus = consoleFocus;
    });
    child.document.hasFocus = () => false;
    expect(focusedWindow()).toBe(window);
    document.hasFocus = () => false;
    child.document.hasFocus = () => true;
    expect(focusedWindow()).toBe(child);
    child.document.hasFocus = () => false;
    expect(focusedWindow()).toBe(window);
  });
});

function secondWindow(): Realm {
  const child = openChild(`kw-surface:${children.length + 1}`);
  children.push(child);
  return child;
}

function admit(realm: Realm): () => void {
  const dismiss = admitWindow(realm);
  stops.push(dismiss);
  return dismiss;
}

function nameOf(realm: Realm): string {
  return realm === window ? "console" : `child ${children.indexOf(realm) + 1}`;
}

function field(page: Document): HTMLTextAreaElement {
  const element = document.createElement("textarea");
  page.body.append(element);
  return element;
}

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

function showing(page: Document, shown: boolean): void {
  Object.defineProperty(page, "visibilityState", {
    value: shown ? "visible" : "hidden",
    configurable: true,
  });
}
