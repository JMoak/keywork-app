import { type CreatureOnTheStead, emptyHabitat, type HabitatState } from "@keywork-app/habitat";
import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forcedColorsQuery } from "../painter.ts";
import { CourtyardOverview } from "./index.tsx";

const at = "2026-11-05T12:00:00.000Z";
const now = Date.parse(at);

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("courtyard workshop miniatures", () => {
  it("mounts at most one district's art from a thousand residents and preserves addresses", () => {
    const residents = Array.from({ length: 1000 }, (_, index) => creature(`resident-${index}`));
    const habitat = world(...residents);
    const order = residents.map((resident) => resident.slug);
    const [range, setRange] = createSignal({ start: 992, end: 1000 });
    const view = render(() => (
      <CourtyardOverview
        world={habitat}
        order={order}
        now={now}
        range={range()}
        alignment="compact"
        onOpen={() => undefined}
      />
    ));
    expect(view.getAllByRole("button")).toHaveLength(8);
    expect(view.getByRole("list").getAttribute("start")).toBe("993");
    expect(view.getAllByRole("button")[0]?.getAttribute("aria-label")).toContain("Court 993");
    setRange({ start: 496, end: 512 });
    expect(view.getAllByRole("button")).toHaveLength(16);
    expect(view.container.querySelectorAll(".kw-courtyard-portrait")).toHaveLength(16);
    expect(view.container.querySelectorAll(".kw-courtyard-workshop")).toHaveLength(16);
    expect(view.getAllByRole("button")[0]?.getAttribute("aria-label")).toContain("Court 497");
    expect(view.getAllByRole("button").at(-1)?.getAttribute("aria-label")).toContain("Court 512");
    expect(view.container.querySelector("[data-alignment=compact]")).not.toBeNull();
  });

  it("shares display watchers, repaints appearance and releases them without animation timers", () => {
    vi.useFakeTimers();
    vi.stubGlobal("devicePixelRatio", 1);
    const media = testMedia();
    const theme = themeWatcher();
    const ink = canvasInk();
    const view = render(() => (
      <CourtyardOverview
        world={world(creature("a"), creature("b"))}
        order={["a", "b"]}
        now={now}
        onOpen={() => undefined}
      />
    ));
    const canvas = view.container.querySelector<HTMLCanvasElement>(".kw-courtyard-workshop");
    if (canvas === null) throw new Error("Missing workshop");
    ink.take(canvas);
    expect(media.listeners()).toBe(2);
    expect(theme.observers()).toBe(1);
    theme.change();
    expect(ink.take(canvas).length).toBeGreaterThan(0);
    media.set(forcedColorsQuery, true);
    const forced = ink.take(canvas);
    expect(forced.length).toBeGreaterThan(0);
    expect(forced.every(([color]) => ["Canvas", "CanvasText", "Highlight"].includes(color))).toBe(
      true,
    );
    const width = canvas.width;
    vi.stubGlobal("devicePixelRatio", 2);
    window.dispatchEvent(new Event("resize"));
    expect(canvas.width).toBe(width * 2);
    expect(ink.take(canvas).length).toBeGreaterThan(0);
    expect(media.listeners()).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
    view.unmount();
    expect(theme.observers()).toBe(0);
    expect(media.listeners()).toBe(0);
    theme.change();
    media.set(forcedColorsQuery, false);
    window.dispatchEvent(new Event("resize"));
    expect(ink.take(canvas)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

function world(...creatures: CreatureOnTheStead[]): HabitatState {
  return {
    ...emptyHabitat(),
    creatures: Object.fromEntries(creatures.map((resident) => [resident.slug, resident])),
  };
}

function creature(slug: string): CreatureOnTheStead {
  return {
    slug,
    name: slug,
    skin: "kid",
    seed: 0,
    workshop: {
      raisedAt: at,
      parcel: undefined,
      substrate: undefined,
      health: "up",
      boardedAt: undefined,
    },
    conversation: undefined,
    chores: [],
  };
}

function canvasInk() {
  type Fill = readonly [string, number, number, number, number];
  const fills = new Map<HTMLCanvasElement, Fill[]>();
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    fills.set(this, []);
    const context = {
      fillStyle: "",
      imageSmoothingEnabled: false,
      clearRect: () => fills.set(this, []),
      fillRect: (x: number, y: number, width: number, height: number) => {
        const held = fills.get(this) ?? [];
        held.push([context.fillStyle, x, y, width, height]);
        fills.set(this, held);
      },
    };
    return context as unknown as CanvasRenderingContext2D;
  });
  return {
    take: (canvas: HTMLCanvasElement): readonly Fill[] => {
      const held = fills.get(canvas) ?? [];
      fills.set(canvas, []);
      return held;
    },
  };
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
    listeners: () => [...lists.values()].reduce((sum, list) => sum + list.listeners.size, 0),
  };
}

function themeWatcher() {
  const callbacks = new Set<MutationCallback>();
  vi.stubGlobal(
    "MutationObserver",
    class {
      readonly callback: MutationCallback;

      constructor(callback: MutationCallback) {
        this.callback = callback;
      }

      observe(): void {
        callbacks.add(this.callback);
      }

      disconnect(): void {
        callbacks.delete(this.callback);
      }
    },
  );
  return {
    change: () => {
      for (const callback of callbacks) callback([], {} as MutationObserver);
    },
    observers: () => callbacks.size,
  };
}
