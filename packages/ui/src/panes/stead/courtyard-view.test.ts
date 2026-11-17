import {
  courtyardCapacity,
  emptyHabitat,
  type HabitatState,
  withCreatures,
} from "@keywork-app/habitat";
import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { type CourtyardPreference, createCourtyardView } from "./courtyard-view.ts";

describe("a saved courtyard view", () => {
  it("leaves an existing stead continuous until asked, then remembers stable addresses", () => {
    const held = harness();
    expect(held.view.overview()).toBe(false);
    expect(held.saved).toEqual([]);
    held.view.choose("courtyards");
    expect(held.view.overview()).toBe(true);
    expect(held.saved.at(-1)).toEqual({ view: "courtyards", courtOrder: ["bea", "pip"] });
    held.setWorld(world("ari", "pip", "bea"));
    expect(held.view.order()).toEqual(["bea", "pip", "ari"]);
    held.setWorld(world("ari", "bea"));
    expect(held.view.order()).toEqual(["bea", "pip", "ari"]);
    held.view.choose("scene");
    expect(held.saved.at(-1)?.courtOrder).toEqual(["bea", "pip", "ari"]);
    held.dispose();
  });

  it("unfolds transiently, restores saved preferences, and folds a removed resident", () => {
    const held = harness({ view: "courtyards", courtOrder: ["pip", "bea"] });
    held.view.open("pip");
    expect(held.view.overview()).toBe(false);
    expect(held.view.selected()).toBe("pip");
    expect(held.saved).toEqual([]);
    held.view.fold();
    expect(held.view.overview()).toBe(true);
    held.view.open("unknown");
    expect(held.view.selected()).toBeUndefined();
    held.view.open("pip");
    held.setWorld(world("bea"));
    expect(held.view.overview()).toBe(true);
    held.setPreference({ view: "scene", courtOrder: ["bea", "pip"] });
    expect(held.view.configured()).toBe(false);
    expect(held.view.order()).toEqual(["bea", "pip"]);
    held.dispose();
  });

  it("falls back to the full scene before mounting an oversized overview", () => {
    const held = harness({
      view: "courtyards",
      courtOrder: Array.from({ length: courtyardCapacity }, (_, n) => `old-${n}`),
    });
    expect(held.view.overview()).toBe(false);
    expect(held.view.error()).toContain("all available on the stead");
    expect(held.view.order()).toHaveLength(courtyardCapacity);
    expect(held.saved).toEqual([]);
    held.dispose();
  });
});

function harness(preference: CourtyardPreference = {}) {
  return createRoot((dispose) => {
    const [current, setWorld] = createSignal<HabitatState>(world("bea", "pip"));
    const [held, setPreference] = createSignal(preference);
    const saved: CourtyardPreference[] = [];
    const view = createCourtyardView({
      world: current,
      preference: held,
      save: (next) => saved.push(next),
    });
    return { view, setWorld, setPreference, saved, dispose };
  });
}

function world(...slugs: string[]): HabitatState {
  return withCreatures(
    emptyHabitat(),
    slugs.map((slug) => ({ slug, name: slug })),
    "2026-11-17T12:00:00.000Z",
  );
}
