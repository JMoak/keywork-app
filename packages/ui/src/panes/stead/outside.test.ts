import { afterEach, describe, expect, it } from "vitest";
import { type Realm, settleRealms } from "../../surfaces/runtime/realm.ts";
import { openChild } from "../../surfaces/runtime/testing.ts";
import { browserFieldHost } from "./field.ts";
import { devicePixelRatioOf, forcedColorsActive, watchMedia, watchTheme } from "./painter.ts";

const children: Realm[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.close();
  document.body.replaceChildren();
  document.documentElement.removeAttribute("data-theme");
});

describe("the stead painter in a pane outside the window", () => {
  it("repaints when the theme changes on the page the stage stands in", async () => {
    const child = secondWindow();
    const stage = stageIn(document);
    let paints = 0;
    const stop = watchTheme(() => (paints += 1), stage);
    child.document.body.append(stage);
    settleRealms();
    document.documentElement.setAttribute("data-theme", "console only");
    await settled();
    expect(paints).toBe(0);
    child.document.documentElement.setAttribute("data-theme", "mirrored");
    await settled();
    expect(paints).toBe(1);
    stop();
    child.document.documentElement.setAttribute("data-theme", "after");
    await settled();
    expect(paints).toBe(1);
  });

  it("reads pixel ratio and forced colours from the window the canvas stands in", () => {
    const child = secondWindow();
    const canvas = stageIn(child.document);
    Object.defineProperty(child, "devicePixelRatio", { value: 2, configurable: true });
    child.matchMedia = (query) => ({ matches: query.includes("forced-colors") }) as MediaQueryList;
    expect(devicePixelRatioOf(canvas)).toBe(2);
    expect(devicePixelRatioOf()).toBe(window.devicePixelRatio);
    expect(forcedColorsActive(canvas)).toBe(true);
    expect(forcedColorsActive()).toBe(false);
  });

  it("listens for a media change in the window the stage stands in", () => {
    const child = secondWindow();
    const stage = stageIn(child.document);
    const listeners: Array<() => void> = [];
    child.matchMedia = () =>
      ({
        matches: false,
        addEventListener: (_: string, listener: () => void) => listeners.push(listener),
        removeEventListener: () => listeners.splice(0),
      }) as unknown as MediaQueryList;
    let changes = 0;
    const stop = watchMedia("(forced-colors: active)", () => (changes += 1), stage);
    for (const listener of listeners) listener();
    stop();
    expect(changes).toBe(1);
    expect(listeners).toEqual([]);
  });

  it("draws on the frames of the window the stage stands in", () => {
    const child = secondWindow();
    const stage = stageIn(child.document);
    const asked: string[] = [];
    child.requestAnimationFrame = () => asked.push("outside frame");
    child.cancelAnimationFrame = () => void asked.push("outside cancelled");
    const host = browserFieldHost(() => stage);
    host.cancelAnimationFrame(host.requestAnimationFrame(() => undefined));
    expect(asked).toEqual(["outside frame", "outside cancelled"]);
  });
});

function secondWindow(): Realm {
  const child = openChild();
  children.push(child);
  return child;
}

function stageIn(page: Document): HTMLElement {
  const stage = document.createElement("div");
  page.body.append(stage);
  return stage;
}

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
