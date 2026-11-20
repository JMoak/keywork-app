import {
  type CreatureOnTheStead,
  emptyHabitat,
  type HabitatState,
  type Thread,
  type WorkshopFamily,
} from "@keywork-app/habitat";
import type { GardenKind } from "@keywork-app/habitat/render";
import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keyworkDay, keyworkNight, themeVariables } from "../../../theme/index.ts";
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
  it("does not repaint unchanged artwork for a semantic clock tick, rename, or same-density resize", () => {
    const ink = canvasInk();
    const [habitat, setHabitat] = createSignal(world(creature("a")));
    const [time, setTime] = createSignal(now);
    const view = render(() => (
      <CourtyardOverview world={habitat()} order={["a"]} now={time()} onOpen={() => {}} />
    ));
    const canvases = [...view.container.querySelectorAll("canvas")];
    for (const canvas of canvases) ink.take(canvas);
    setTime(now + 60_000);
    setHabitat(world({ ...creature("a"), name: "A new name" }));
    window.dispatchEvent(new Event("resize"));
    expect(view.getByRole("button").getAttribute("aria-label")).toContain("A new name");
    for (const canvas of canvases) expect(ink.take(canvas)).toEqual([]);
  });

  it("updates the building and chosen garden without remounting its focused court", () => {
    const ink = canvasInk();
    const [families, setFamilies] = createSignal<Readonly<Record<string, WorkshopFamily>>>({});
    const [gardens, setGardens] = createSignal<Readonly<Record<string, GardenKind>>>({});
    const view = render(() => (
      <CourtyardOverview
        world={world(creature("a"))}
        order={["a"]}
        now={now}
        families={families()}
        gardens={gardens()}
        onOpen={() => undefined}
      />
    ));
    const button = view.getByRole("button");
    const canvas = view.container.querySelector<HTMLCanvasElement>(".kw-courtyard-workshop");
    if (canvas === null) throw new Error("Missing workshop");
    button.focus();
    expect(canvas.dataset.workshop).toBe("gable");
    expect(canvas.dataset.garden).toBeUndefined();
    const original = ink.take(canvas);
    setFamilies({ a: "canopy" });
    expect(canvas.dataset.workshop).toBe("canopy");
    const bare = ink.take(canvas);
    expect(bare).not.toEqual(original);
    const beforeGarden = canvas.width;
    setGardens({ a: "flowers" });
    expect(canvas.dataset.garden).toBe("flowers");
    expect(canvas.width).toBe(beforeGarden);
    expect(ink.take(canvas)).not.toEqual(bare);
    expect(view.getByRole("button")).toBe(button);
    expect(document.activeElement).toBe(button);
  });

  it("reads live workshop activity and boards from the whole world's facts", () => {
    const ink = canvasInk();
    const [habitat, setHabitat] = createSignal(world(creature("a")));
    const view = render(() => (
      <CourtyardOverview world={habitat()} order={["a"]} now={now} onOpen={() => undefined} />
    ));
    const canvas = view.container.querySelector<HTMLCanvasElement>(".kw-courtyard-workshop");
    if (canvas === null) throw new Error("Missing workshop");
    const idle = ink.take(canvas);
    setHabitat({ ...habitat(), threads: { running: thread("a") } });
    expect(ink.take(canvas)).not.toEqual(idle);
    expect(view.getByRole("button").getAttribute("data-state")).toBe("working");
    const resident = creature("a");
    setHabitat(world({ ...resident, workshop: { ...resident.workshop, boardedAt: at } }));
    expect(canvas.hasAttribute("data-boarded")).toBe(true);
    expect(ink.take(canvas)).not.toEqual(idle);
  });

  it("keeps a building and its court reachable when the creature's artwork is unavailable", () => {
    const view = render(() => (
      <CourtyardOverview
        world={world({ ...creature("a"), skin: "unavailable-miniature-skin" })}
        order={["a"]}
        now={now}
        onOpen={() => undefined}
      />
    ));
    expect(view.getByText("Artwork unavailable")).toBeTruthy();
    expect(view.container.querySelector(".kw-courtyard-portrait")).toBeNull();
    expect(view.container.querySelector(".kw-courtyard-workshop")).not.toBeNull();
    expect(view.getByRole("button").getAttribute("aria-label")).toContain("Court 1");
  });

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
    expect(
      forced.every(([color]) => ["Canvas", "CanvasText", "Highlight", "GrayText"].includes(color)),
    ).toBe(true);
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

function thread(creature: string): Thread {
  return {
    id: "running",
    creature,
    kind: "conversation",
    parent: undefined,
    title: "Working",
    restingSince: undefined,
    turn: { startedAt: at, lastProgressAt: at, tool: undefined, stumbledAt: undefined },
    asks: {},
    answered: {},
    back: undefined,
    failure: undefined,
    failures: 0,
    changes: [],
    queued: 2,
    children: [],
    outcome: undefined,
    lastActivityAt: at,
    viewedAt: undefined,
    waiting: undefined,
    removed: false,
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
  let variables = themeVariables(keyworkNight);
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) => variables[name] ?? "",
      }) as CSSStyleDeclaration,
  );
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
      variables = themeVariables(keyworkDay);
      for (const callback of callbacks) callback([], {} as MutationObserver);
    },
    observers: () => callbacks.size,
  };
}
