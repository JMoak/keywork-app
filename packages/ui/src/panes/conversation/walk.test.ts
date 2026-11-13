import { afterEach, describe, expect, it } from "vitest";
import { walkAttribute, walkTranscript } from "./walk.ts";

afterEach(() => {
  document.body.replaceChildren();
});

describe("walking the transcript by keyboard", () => {
  it("enters at the newest row on shift+tab from the composer and leaves tab to the panes", () => {
    const { composer, rows } = transcript(3);
    composer.focus();
    expect(keyDown(composer, { key: "Tab" }).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(composer);
    expect(keyDown(composer, { key: "Tab", shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(rows[2]);
  });

  it("lets tab and shift+tab move on from a row in page order", () => {
    const { rows } = transcript(2);
    rows[1]?.focus();
    expect(keyDown(rows[1] as HTMLElement, { key: "Tab" }).defaultPrevented).toBe(false);
    expect(keyDown(rows[1] as HTMLElement, { key: "Tab", shiftKey: true }).defaultPrevented).toBe(
      false,
    );
  });

  it("walks rows with the arrows and j and k, and goes home on escape", () => {
    const { composer, rows } = transcript(3);
    rows[2]?.focus();
    keyDown(rows[2] as HTMLElement, { key: "k" });
    expect(document.activeElement).toBe(rows[1]);
    keyDown(rows[1] as HTMLElement, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[2]);
    keyDown(rows[2] as HTMLElement, { key: "Escape" });
    expect(document.activeElement).toBe(composer);
  });

  it("leaves shift+tab alone when the transcript has no rows to enter", () => {
    const { composer } = transcript(0);
    composer.focus();
    expect(keyDown(composer, { key: "Tab", shiftKey: true }).defaultPrevented).toBe(false);
  });
});

function transcript(count: number): { composer: HTMLTextAreaElement; rows: HTMLElement[] } {
  const root = document.createElement("div");
  const page = document.createElement("div");
  const rows = Array.from({ length: count }, () => {
    const row = document.createElement("button");
    row.setAttribute(walkAttribute, "");
    page.append(row);
    return row;
  });
  const composer = document.createElement("textarea");
  root.append(page, composer);
  document.body.append(root);
  walkTranscript(root, { page: () => page, composer: () => composer });
  return { composer, rows };
}

function keyDown(target: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}
