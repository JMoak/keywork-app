import { loadSkin } from "@keywork-app/habitat/skins";
import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forcedColorsQuery, reducedMotionQuery } from "../panes/stead/painter.ts";
import { Portrait } from "./portrait.tsx";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the live creature portrait", () => {
  it("repaints a new skin at frame zero under reduced motion and recovers from unavailable art", () => {
    const media = testMedia();
    media.set(reducedMotionQuery, true);
    const ink = canvasInk();
    const portrait = mount();
    const original = [...ink.fills];
    const before = ink.clears();
    portrait.setSkin("carter");
    expect(ink.clears()).toBeGreaterThan(before);
    expect(ink.fills).not.toEqual(original);
    expect(portrait.view.getByRole("img").dataset.skin).toBe("carter");
    portrait.setSkin("not-installed");
    expect(portrait.view.queryByRole("img")).toBeNull();
    expect(portrait.view.getByText("skin not-installed refused")).toBeTruthy();
    const refused = ink.clears();
    portrait.setSkin("kid");
    expect(ink.clears()).toBeGreaterThan(refused);
    expect(portrait.view.getByRole("img").dataset.skin).toBe("kid");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the previous skin's timer and gives the new idle frame its full declared hold", () => {
    testMedia();
    const ink = canvasInk();
    const portrait = mount();
    vi.advanceTimersByTime(holdOf("kid") / 2);
    portrait.setSkin("placeholder");
    const changed = ink.clears();
    vi.advanceTimersByTime(holdOf("placeholder") - 1);
    expect(ink.clears()).toBe(changed);
    vi.advanceTimersByTime(1);
    expect(ink.clears()).toBeGreaterThan(changed);
  });

  it("stops and resumes animation when motion preferences change, and cleans up every timer", () => {
    const media = testMedia();
    const ink = canvasInk();
    const portrait = mount();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(holdOf("kid"));
    media.set(reducedMotionQuery, true);
    expect(vi.getTimerCount()).toBe(0);
    const still = ink.clears();
    vi.advanceTimersByTime(10_000);
    expect(ink.clears()).toBe(still);
    media.set(reducedMotionQuery, false);
    expect(vi.getTimerCount()).toBe(1);
    portrait.setSkin("not-installed");
    expect(vi.getTimerCount()).toBe(0);
    portrait.setSkin("kid");
    expect(vi.getTimerCount()).toBe(1);
    portrait.view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(media.listeners()).toBe(0);
  });

  it("repaints forced colors and display density while still, then releases its display watchers", () => {
    const media = testMedia();
    media.set(reducedMotionQuery, true);
    vi.stubGlobal("devicePixelRatio", 1);
    const ink = canvasInk();
    const portrait = mount();
    const canvas = portrait.view.getByRole("img") as HTMLCanvasElement;
    const width = canvas.width;
    const before = ink.clears();
    media.set(forcedColorsQuery, true);
    expect(ink.clears()).toBeGreaterThan(before);
    expect(
      ink.fills.every(([color]) => ["Canvas", "CanvasText", "Highlight"].includes(color)),
    ).toBe(true);
    vi.stubGlobal("devicePixelRatio", 2);
    media.set("(resolution: 1dppx)", false);
    expect(canvas.width).toBe(width * 2);
    expect(media.watched("(resolution: 2dppx)")).toBe(true);
    portrait.view.unmount();
    const after = ink.clears();
    window.dispatchEvent(new Event("resize"));
    media.set(forcedColorsQuery, false);
    expect(ink.clears()).toBe(after);
    expect(media.listeners()).toBe(0);
  });
});

function mount() {
  const [skin, setSkin] = createSignal("kid");
  const view = render(() => <Portrait skin={skin()} hueStop={1} />);
  return { view, setSkin };
}

function holdOf(id: string): number {
  const loaded = loadSkin(id);
  if (!loaded.ok) throw new Error(loaded.faults.join("; "));
  return loaded.skin.rows.idle.ms[0] ?? 0;
}

function canvasInk() {
  let clears = 0;
  const fills: Array<[string, number, number, number, number]> = [];
  const context = {
    fillStyle: "",
    imageSmoothingEnabled: false,
    clearRect: () => {
      fills.length = 0;
      clears += 1;
    },
    fillRect: (x: number, y: number, width: number, height: number) => {
      fills.push([context.fillStyle, x, y, width, height]);
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return { fills, clears: () => clears };
}

function testMedia() {
  const lists = new Map<string, { matches: boolean; listeners: Set<() => void> }>();
  const get = (query: string) => {
    const held = lists.get(query) ?? { matches: false, listeners: new Set<() => void>() };
    lists.set(query, held);
    return held;
  };
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return get(query).matches;
    },
    media: query,
    addEventListener: (_event: string, listener: () => void) => get(query).listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) =>
      get(query).listeners.delete(listener),
  }));
  return {
    set: (query: string, matches: boolean) => {
      const held = get(query);
      held.matches = matches;
      for (const listener of [...held.listeners]) listener();
    },
    watched: (query: string) => get(query).listeners.size > 0,
    listeners: () => [...lists.values()].reduce((sum, list) => sum + list.listeners.size, 0),
  };
}
