import { resolvePalette } from "@keywork-app/habitat/render";
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceOfTheme } from "../panes/stead/theme-source.ts";
import { keyworkDay, keyworkNight, wornThemeKey } from "../theme/themes.ts";
import { browserPageHost, CompanionPage } from "./companion-page.tsx";
import {
  type CompanionConditions,
  type CompanionPort,
  type HitMask,
  restingConditions,
} from "./port.ts";
import type { Pose, Renderer } from "./renderer.ts";
import { companionRenderer } from "./skinned-renderer.ts";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the open companion's theme", () => {
  it("repaints a motionless native Folio in the remembered material pigments at its existing pose", () => {
    const media = systemAppearance();
    localStorage.setItem(wornThemeKey, keyworkNight.name);
    const page = mount({ ...restingConditions, motion: "reduce", wantsMask: true });
    const night = veinColor(keyworkNight);
    const day = veinColor(keyworkDay);
    expect(day).not.toBe(night);
    expect(page.colors()).toContain(night);
    const pose = page.poses.at(-1);
    const mask = page.masks.at(-1)?.bits;
    expect(mask?.some(Boolean)).toBe(true);
    const before = page.paints();
    media.setDark(false);
    announceStorage("unrelated");
    expect(page.paints()).toBe(before);

    localStorage.setItem(wornThemeKey, keyworkDay.name);
    announceStorage(wornThemeKey);
    expect(page.paints()).toBe(before + 1);
    expect(page.colors()).toContain(day);
    expect(page.colors()).not.toContain(night);
    expect(page.poses.at(-1)).toEqual(pose);
    expect(page.masks.at(-1)?.bits).toEqual(mask);
    expect(vi.getTimerCount()).toBe(0);
    page.view.unmount();
    expect(media.listeners()).toBe(0);
    localStorage.setItem(wornThemeKey, keyworkNight.name);
    announceStorage(wornThemeKey);
    expect(document.documentElement.dataset.theme).toBe(keyworkDay.name);
  });

  it("follows its system pair while still and paints the latest choice when untucked", () => {
    const media = systemAppearance();
    localStorage.setItem(wornThemeKey, "system");
    const still = { ...restingConditions, still: true };
    const page = mount(still);
    expect(page.colors()).toContain(veinColor(keyworkNight));
    media.setDark(false);
    expect(page.colors()).toContain(veinColor(keyworkDay));
    page.conditions({ ...still, ceiling: "hidden" });
    const hidden = page.paints();
    localStorage.setItem(wornThemeKey, keyworkDay.name);
    announceStorage(wornThemeKey);
    media.setDark(true);
    localStorage.clear();
    announceStorage(null);
    expect(page.paints()).toBe(hidden);
    expect(vi.getTimerCount()).toBe(0);
    page.conditions(still);
    expect(page.colors()).toContain(veinColor(keyworkNight));
    expect(page.paints()).toBe(hidden + 1);
  });

  it("keeps the native clip's elapsed hold across an active theme change", () => {
    systemAppearance();
    localStorage.setItem(wornThemeKey, keyworkNight.name);
    const start = Date.now();
    const control = mount({ ...restingConditions, motion: "full" });
    vi.advanceTimersByTime(2140);
    const initial = control.poses.at(-1);
    expect(initial?.frame).toBeGreaterThan(0);
    const intervals = [80, 100, 180, 250, 500];
    const expected = intervals.map((delay) => {
      vi.advanceTimersByTime(delay);
      return control.poses.at(-1);
    });
    expect(new Set(expected.map((pose) => pose?.frame)).size).toBeGreaterThan(1);
    control.view.unmount();
    vi.setSystemTime(start);
    const page = mount({ ...restingConditions, motion: "full" });
    vi.advanceTimersByTime(2140);
    expect(page.poses.at(-1)).toEqual(initial);
    localStorage.setItem(wornThemeKey, keyworkDay.name);
    announceStorage(wornThemeKey);
    expect(page.poses.at(-1)).toEqual(initial);
    expect(page.colors()).toContain(veinColor(keyworkDay));
    intervals.forEach((delay, index) => {
      vi.advanceTimersByTime(delay);
      expect(page.poses.at(-1)).toEqual(expected[index]);
    });
  });
});

function announceStorage(key: string | null): void {
  window.dispatchEvent(Object.assign(new Event("storage"), { key, storageArea: localStorage }));
}

function veinColor(theme: typeof keyworkDay): string {
  return resolvePalette(sourceOfTheme(theme), { material: "leaf", hueStop: 1 })[13] as string;
}

function systemAppearance() {
  let dark = true;
  const changes = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" && dark,
    addEventListener: (_: string, listener: () => void) => changes.add(listener),
    removeEventListener: (_: string, listener: () => void) => changes.delete(listener),
  }));
  return {
    listeners: () => changes.size,
    setDark(next: boolean) {
      dark = next;
      for (const listener of changes) listener();
    },
  };
}

function mount(initial: CompanionConditions) {
  let paints = 0;
  const colors = new Set<string>();
  const context = {
    fillStyle: "",
    fillRect() {
      colors.add(context.fillStyle);
    },
    clearRect() {
      paints += 1;
      colors.clear();
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  const poses: Pose[] = [];
  const masks: HitMask[] = [];
  const native = companionRenderer("folio");
  if (!native) throw new Error("Folio is unavailable");
  const artist: Renderer = Object.assign(
    (...args: Parameters<Renderer>) => {
      poses.push(args[0]);
      return native(...args);
    },
    { rows: native.rows },
  );
  let conditions: (next: CompanionConditions) => void = () => {};
  const port: CompanionPort = {
    onSnapshot(listener) {
      listener({
        creature: { name: "Fern", slug: "fern", skin: "folio", hueStop: 1 },
        state: "idle",
        stateLabel: "idle",
        activeThreads: 0,
        finishedUnseen: 0,
        threadId: undefined,
        tool: undefined,
        needsYou: undefined,
      });
      return () => {};
    },
    onConditions(listener) {
      conditions = listener;
      listener(initial);
      return () => {};
    },
    ready: vi.fn(),
    setInteractive: vi.fn(),
    sendMask: (mask) => masks.push(mask),
    drag: vi.fn(),
    dragEnd: vi.fn(),
    nudge: vi.fn(),
    home: vi.fn(),
    openMenu: vi.fn(),
    open: vi.fn(),
    answer: vi.fn(),
    reportWakeups: vi.fn(),
  };
  const host = {
    ...browserPageHost(),
    now: () => Date.now(),
    viewport: () => ({ width: 100, height: 110 }),
    setTimeout: (fn: () => void, delay: number) => setTimeout(fn, delay),
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const view = render(() => <CompanionPage port={port} host={host} renderer={artist} />);
  return {
    view,
    colors: () => [...colors],
    paints: () => paints,
    poses,
    masks,
    conditions: (next: CompanionConditions) => conditions(next),
  };
}
