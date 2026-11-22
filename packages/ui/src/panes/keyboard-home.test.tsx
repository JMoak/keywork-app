import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { openChild } from "../surfaces/runtime/testing.ts";
import { admitWindow } from "../surfaces/runtime/windows.ts";
import { holdKeysWherePressed, keepKeyboardHome, sendStrayKeysHome } from "./keyboard-home.ts";

afterEach(cleanup);

describe("a pane keeping the keyboard home", () => {
  it("takes focus when it becomes the focused pane", () => {
    const run = renderPane(false);
    expect(document.activeElement).not.toBe(run.root());
    run.setSlot({ focused: true, width: 400 });
    expect(document.activeElement).toBe(run.root());
  });

  it("never pulls focus back while it stays focused and only its slot moves", () => {
    const run = renderPane(true);
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();
    for (const width of [410, 420, 430]) run.setSlot({ focused: true, width });
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });
});

describe("stray keys in a pane outside the window", () => {
  it("takes a key that landed on the page of another window home, as it does in the console", () => {
    const child = openChild();
    const dismiss = admitWindow(child);
    const strays: Element[] = [];
    const stop = sendStrayKeysHome({
      takeHome: (target) => {
        strays.push(target);
        return undefined;
      },
    });
    type(document.body, "a");
    type(child.document.body, "b");
    const field = document.createElement("textarea");
    child.document.body.append(field);
    type(field, "c");
    stop();
    type(child.document.body, "d");
    dismiss();
    child.close();
    expect(strays).toEqual([document.body, child.document.body]);
  });

  it("repeats an escape on the home it found in the other window", () => {
    const child = openChild();
    const dismiss = admitWindow(child);
    const home = document.createElement("section");
    child.document.body.append(home);
    const escapes: string[] = [];
    home.addEventListener("keydown", (event) => escapes.push(event.key));
    const stop = sendStrayKeysHome({
      takeHome: (target) => (target === home ? undefined : home),
    });
    type(child.document.body, "Escape");
    stop();
    dismiss();
    child.close();
    expect(escapes).toEqual(["Escape"]);
  });
});

describe("a press on a pane, inside the workspace or outside the window", () => {
  it("gives the pressed pane something to hold focus, in whichever window it stands", () => {
    const child = openChild();
    const dismiss = admitWindow(child);
    const workspace = document.createElement("div");
    document.body.append(workspace);
    const inside = paneIn(workspace);
    const outside = paneIn(child.document.body);
    const elsewhere = paneIn(document.body);
    const stop = holdKeysWherePressed(workspace);
    for (const pane of [inside, outside, elsewhere]) pressOn(pane.prose);
    stop();
    const later = paneIn(child.document.body);
    pressOn(later.prose);
    const held = [inside, outside, elsewhere, later].map((pane) =>
      pane.root.getAttribute("tabindex"),
    );
    dismiss();
    child.close();
    expect(held).toEqual(["-1", "-1", null, null]);
    workspace.remove();
    elsewhere.root.remove();
  });
});

function paneIn(parent: Element) {
  const root = document.createElement("div");
  root.setAttribute("data-pane-id", "pressed");
  const prose = document.createElement("p");
  root.append(prose);
  parent.append(root);
  return { root, prose };
}

function pressOn(target: Element): void {
  target.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
}

function type(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

interface Slot {
  readonly focused: boolean;
  readonly width: number;
}

function renderPane(focused: boolean) {
  const [slot, setSlot] = createSignal<Slot>({ focused, width: 400 });
  let root: HTMLElement | undefined;
  function Pane() {
    keepKeyboardHome(
      () => root,
      () => slot().focused,
    );
    return (
      <section
        tabIndex={-1}
        ref={(element) => {
          root = element;
        }}
      />
    );
  }
  render(() => <Pane />);
  return { root: () => root, setSlot };
}
