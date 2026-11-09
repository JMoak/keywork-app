import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { keepKeyboardHome } from "./keyboard-home.ts";

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
