import { afterEach, describe, expect, it } from "vitest";
import { markKeyboardHome } from "../shell/keyboard-claim.ts";
import { openChild } from "../surfaces/runtime/testing.ts";
import { keepTabWithin } from "./tab-trap.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("tab through a pane and on to the next", () => {
  it("steps through a pane's controls in page order, from wherever focus rests inside it", () => {
    const [pane] = workspace([["link", "region", "button"]]);
    const [link, region, button] = pane?.stops ?? [];
    region?.focus();
    tab(region);
    expect(document.activeElement).toBe(button);
    tab(button, true);
    expect(document.activeElement).toBe(link);
  });

  it("moves past the last control to the next pane's keyboard home, and back the same way", () => {
    const [left, right] = workspace([
      ["button", "home"],
      ["button", "home"],
    ]);
    const leftHome = left?.stops[1];
    const rightHome = right?.stops[1];
    leftHome?.focus();
    tab(leftHome);
    expect(document.activeElement).toBe(rightHome);
    tab(right?.stops[0] as HTMLElement, true);
    expect(document.activeElement).toBe(leftHome);
  });

  it("wraps within a pane that has no neighbor", () => {
    const [only] = workspace([["button", "button"]]);
    const [first, last] = only?.stops ?? [];
    last?.focus();
    tab(last);
    expect(document.activeElement).toBe(first);
  });

  it("keeps tab inside a pane that stands outside the window, in its own page", () => {
    const child = openChild();
    const [inside, outside] = workspace([
      ["button", "home"],
      ["button", "button"],
    ]);
    child.document.body.append(outside?.body as HTMLElement);
    const [first, last] = outside?.stops ?? [];
    last?.focus();
    tab(last);
    expect(child.document.activeElement).toBe(first);
    inside?.stops[1]?.focus();
    tab(inside?.stops[1]);
    expect(document.activeElement).toBe(inside?.stops[0]);
    child.close();
  });
});

type Stop = "link" | "button" | "region" | "home";

interface Pane {
  readonly body: HTMLElement;
  readonly stops: HTMLElement[];
}

function workspace(panes: readonly (readonly Stop[])[]): Pane[] {
  const root = document.createElement("div");
  root.className = "kw-workspace";
  document.body.append(root);
  return panes.map((stops) => {
    const body = document.createElement("div");
    body.className = "kw-frame-body";
    const made = stops.map(stopOf);
    body.append(...made);
    root.append(body);
    keepTabWithin(body);
    return { body, stops: made };
  });
}

function stopOf(stop: Stop): HTMLElement {
  if (stop === "link") {
    const link = document.createElement("a");
    link.href = "#";
    return link;
  }
  if (stop === "button") return document.createElement("button");
  const element = document.createElement(stop === "home" ? "textarea" : "div");
  if (stop === "home") markKeyboardHome(element);
  else element.tabIndex = -1;
  return element;
}

function tab(from: Element | null | undefined, backward = false): void {
  from?.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: backward,
      bubbles: true,
      cancelable: true,
    }),
  );
}
