import { afterEach, describe, expect, it } from "vitest";
import { openChild } from "../surfaces/runtime/testing.ts";
import { createKeyboardScope, paneIdOf } from "./keyboard-claim.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("the keyboard claim", () => {
  it("sends a self-focusing surface back to the claimant and its pane while the claim holds", () => {
    const keyboard = createKeyboardScope();
    const card = paneWith("stead", "aside");
    const composer = paneWith("thread", "textarea");
    const routed: Array<string | undefined> = [];
    const unroute = keyboard.routeToPanes((owner) => routed.push(paneIdOf(owner)));
    const release = keyboard.claim(card);
    composer.focus();
    expect(keyboard.yieldToClaim(composer)).toBe(true);
    expect(document.activeElement).toBe(card);
    expect(routed).toEqual(["stead"]);
    release();
    unroute();
    composer.focus();
    expect(keyboard.yieldToClaim(composer)).toBe(false);
    expect(document.activeElement).toBe(composer);
  });

  it("keeps independent workspace claims and focus returns", () => {
    const first = createKeyboardScope();
    const second = createKeyboardScope();
    const card = paneWith("stead", "aside");
    first.claim(card);
    first.returnHome();
    const composer = paneWith("thread", "textarea");
    composer.focus();
    expect(second.yieldToClaim(composer)).toBe(false);
    expect(second.homeVersion()).toBe(0);
    expect(document.activeElement).toBe(composer);
    expect(first.claimant()).toBe(card);
  });

  it("never yields what lives inside the claimant, and a detached claimant holds nothing", () => {
    const keyboard = createKeyboardScope();
    const card = paneWith("stead", "aside");
    const field = document.createElement("input");
    card.append(field);
    const release = keyboard.claim(card);
    field.focus();
    expect(keyboard.yieldToClaim(field)).toBe(false);
    expect(document.activeElement).toBe(field);
    card.remove();
    expect(keyboard.claimant()).toBeUndefined();
    expect(keyboard.restore()).toBe(false);
    release();
  });

  it("restores a claimant standing outside the window in its own page, and finds its home there", () => {
    const keyboard = createKeyboardScope();
    const child = openChild();
    const card = paneWith("stead", "aside");
    const composer = paneWith("thread", "textarea");
    child.document.body.append(card.parentElement as HTMLElement);
    const routed: Array<string | undefined> = [];
    keyboard.routeToPanes((owner) => routed.push(paneIdOf(owner)));
    keyboard.claim(card);
    keyboard.addHome({ element: () => card, homeward: () => true });
    composer.focus();
    expect(keyboard.claimant()).toBe(card);
    expect(keyboard.restore()).toBe(true);
    expect(child.document.activeElement).toBe(card);
    expect(document.activeElement).toBe(composer);
    expect(routed).toEqual(["stead"]);
    expect(keyboard.homeOf("stead")).toBe(card);
    child.close();
  });
});

function paneWith(paneId: string, tag: "aside" | "textarea"): HTMLElement {
  const slot = document.createElement("div");
  slot.setAttribute("data-pane-id", paneId);
  const element = document.createElement(tag);
  element.tabIndex = -1;
  slot.append(element);
  document.body.append(slot);
  return element;
}
