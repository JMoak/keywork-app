import type { DenyReason } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { openChild } from "../surfaces/runtime/testing.ts";
import { admitWindow, listenInEveryDocument } from "../surfaces/runtime/windows.ts";
import { askWhy, readWhyKeys, stopAskingWhy } from "./ask-card-why.ts";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});

describe("the why keys of an ask standing in a pane outside the window", () => {
  it("reads the reason from the window the card stands in, ahead of the keymap there", () => {
    const child = openChild();
    cleanups.push(admitWindow(child), () => child.close());
    const card = document.createElement("fieldset");
    child.document.body.append(card);
    const answers: Array<[DenyReason, boolean]> = [];
    const reachedKeymap: string[] = [];
    cleanups.push(
      listenInEveryDocument("keydown", (event) => void reachedKeymap.push(event.key), true),
      createRoot((dispose) => {
        askWhy("call-1");
        readWhyKeys(
          () => card,
          () => "call-1",
          (reason, words) => answers.push([reason, words]),
        );
        return dispose;
      }),
      () => stopAskingWhy("call-1"),
    );
    press(card, "u");
    press(document.body, "n");
    expect(answers).toEqual([["unsafe", false]]);
    expect(reachedKeymap).toEqual(["n"]);
  });
});

function press(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}
