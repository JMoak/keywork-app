import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { settleRealms } from "./realm.ts";
import { openChild } from "./testing.ts";
import { windowFocusOf } from "./window-focus.ts";

afterEach(cleanup);

describe("whether the window a pane stands in has focus", () => {
  it("follows the console while the pane is inside", () => {
    const pane = rendered();
    window.dispatchEvent(new Event("blur"));
    expect(pane.focused()).toBe(false);
    window.dispatchEvent(new Event("focus"));
    expect(pane.focused()).toBe(true);
  });

  it("follows the window the pane went out to, and no longer the console", () => {
    const pane = rendered();
    const child = openChild();
    child.document.hasFocus = () => false;
    child.document.body.append(pane.root);
    settleRealms();
    expect(pane.focused()).toBe(false);
    child.dispatchEvent(new Event("focus"));
    expect(pane.focused()).toBe(true);
    window.dispatchEvent(new Event("blur"));
    expect(pane.focused()).toBe(true);
    child.dispatchEvent(new Event("blur"));
    expect(pane.focused()).toBe(false);
    child.close();
  });
});

function rendered() {
  let root: HTMLElement | undefined;
  let focused: () => boolean = () => false;
  function Pane() {
    focused = windowFocusOf(() => root);
    return <section ref={root} />;
  }
  render(() => <Pane />);
  return { root: root as unknown as HTMLElement, focused: () => focused() };
}
