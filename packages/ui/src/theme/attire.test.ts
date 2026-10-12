import type { ServerTheme } from "@keywork-app/protocol";
import { createEffect, createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import {
  type Attire,
  type AttireOptions,
  attireStorageKey,
  createAttire,
  type Outfit,
  systemRefusal,
} from "./attire.ts";
import { keyworkDay, keyworkNight } from "./themes.ts";
import { createWardrobe, type Wardrobe } from "./wardrobe.ts";

const storageKey = attireStorageKey("C:/src/pricing");
const houseKinds = new Set(["tree"]);

const mist: ServerTheme = {
  name: "closet-mist",
  appearance: "dark",
  tokens: { ...keyworkNight.tokens },
  density: { ...keyworkNight.density },
  gap: 0,
  chromeWeight: "regular",
  instruments: "cockpit",
};

interface Dressed {
  attire: Attire;
  wardrobe: Wardrobe;
  stored(): unknown;
  setArcs(arcs: Record<string, string>): void;
  setServed(themes: readonly ServerTheme[]): void;
  dispose(): void;
}

function dressed(options: Partial<AttireOptions> & { initial?: string } = {}): Dressed {
  const items: Record<string, string> =
    options.initial === undefined ? {} : { [storageKey]: options.initial };
  const storage = {
    getItem: (key: string) => items[key] ?? null,
    setItem: (key: string, value: string) => {
      items[key] = value;
    },
  };
  return createRoot((dispose) => {
    const [arcs, setArcs] = createSignal<Record<string, string>>({ a: "pricing", b: "pricing" });
    const [served, setServed] = createSignal<readonly ServerTheme[]>([mist]);
    const wardrobe = createWardrobe({
      serverThemes: served,
      apply: () => undefined,
      prefersDark: () => true,
      watchAppearance: () => () => undefined,
    });
    const attire = createAttire({
      wardrobe,
      arcOf: (paneId) => arcs()[paneId],
      dressable: (paneId) => !houseKinds.has(paneId),
      titleOf: (paneId) => `run ${paneId}`,
      storage,
      storageKey,
      ...options,
    });
    return {
      attire,
      wardrobe,
      stored: () => JSON.parse(items[storageKey] ?? "null"),
      setArcs,
      setServed,
      dispose,
    };
  });
}

const named = (outfit: Outfit) => ({
  theme: outfit.theme.name,
  source: outfit.source,
  arc: outfit.arc,
});

describe("resolving a pane's outfit", () => {
  it("wears the house theme until something is chosen, and always on admin panes", () => {
    const { attire, wardrobe, dispose } = dressed();
    expect(named(attire.outfit("a"))).toEqual({ theme: keyworkNight.name, source: "window" });
    attire.wear({ kind: "arc", slug: "pricing" }, "nord");
    expect(attire.outfit("tree").source).toBe("window");
    expect(attire.outfit("tree").theme).toBe(wardrobe.wearing());
    dispose();
  });

  it("prefers the pane's own choice, then its arc's, then the house's", () => {
    const { attire, dispose } = dressed();
    attire.wear({ kind: "arc", slug: "pricing" }, "nord");
    attire.wear({ kind: "pane", id: "b" }, "keywork-day");
    expect(named(attire.outfit("a"))).toEqual({ theme: "nord", source: "arc", arc: "pricing" });
    expect(named(attire.outfit("b"))).toEqual({ theme: "keywork-day", source: "pane" });
    expect(attire.outfit("c").source).toBe("window");
    attire.undress({ kind: "pane", id: "b" });
    expect(attire.outfit("b").source).toBe("arc");
    dispose();
  });

  it("falls through silently when a stored theme leaves the closet, but still reports it", () => {
    const { attire, setServed, dispose } = dressed();
    attire.wear({ kind: "pane", id: "a" }, "closet-mist");
    expect(attire.outfit("a").theme.name).toBe("closet-mist");
    setServed([]);
    expect(attire.outfit("a").source).toBe("window");
    expect(attire.worn({ kind: "pane", id: "a" })).toBe("closet-mist");
    setServed([mist]);
    expect(attire.outfit("a").source).toBe("pane");
    dispose();
  });

  it("repaints when the arc choice, the pane's arc, or the house theme changes", () => {
    const { attire, wardrobe, setArcs, dispose } = dressed();
    const seen: string[] = [];
    const stop = createRoot((stop) => {
      createEffect(() => {
        const outfit = attire.outfit("a");
        seen.push(`${outfit.source}:${outfit.theme.name}`);
      });
      return stop;
    });
    wardrobe.wear("keywork-day");
    attire.wear({ kind: "arc", slug: "pricing" }, "nord");
    attire.wear({ kind: "arc", slug: "billing" }, "rose-pine");
    setArcs({ a: "billing" });
    expect(seen).toEqual([
      "window:keywork-night",
      "window:keywork-day",
      "arc:nord",
      "arc:rose-pine",
    ]);
    stop();
    dispose();
  });
});

describe("choosing what to wear", () => {
  it("refuses system and unknown names below the window, without throwing", () => {
    const { attire, dispose } = dressed();
    expect(attire.wear({ kind: "arc", slug: "pricing" }, "system")).toBe(systemRefusal);
    expect(attire.wear({ kind: "pane", id: "a" }, "velvet")).toBe('no theme is named "velvet"');
    expect(attire.wear({ kind: "pane", id: "tree" }, "nord")).toBe(
      'pane "run tree" always wears the window\'s theme',
    );
    expect(attire.worn({ kind: "arc", slug: "pricing" })).toBeUndefined();
    dispose();
  });

  it("hands the window to the wardrobe", () => {
    const { attire, wardrobe, dispose } = dressed();
    expect(attire.wear({ kind: "window" }, "keywork-day")).toBeUndefined();
    expect(wardrobe.worn()).toBe("keywork-day");
    expect(attire.worn({ kind: "window" })).toBe("keywork-day");
    attire.undress({ kind: "window" });
    expect(wardrobe.worn()).toBe("keywork-day");
    dispose();
  });

  it("dresses a marked set pane by pane and reports their common choice", () => {
    const { attire, dispose } = dressed();
    const marked = { kind: "panes", ids: ["a", "b", "tree"] } as const;
    expect(attire.wear(marked, "nord")).toBeUndefined();
    expect(attire.worn({ kind: "panes", ids: ["a", "b"] })).toBe("nord");
    expect(attire.worn({ kind: "pane", id: "tree" })).toBeUndefined();
    attire.wear({ kind: "pane", id: "b" }, "keywork-day");
    expect(attire.worn({ kind: "panes", ids: ["a", "b"] })).toBeUndefined();
    attire.undress(marked);
    expect(attire.worn({ kind: "pane", id: "a" })).toBeUndefined();
    dispose();
  });

  it("names every target the way the themes pane says it", () => {
    const { attire, dispose } = dressed();
    expect(attire.describe({ kind: "window" })).toBe("the window");
    expect(attire.describe({ kind: "arc", slug: "pricing" })).toBe("arc pricing");
    expect(attire.describe({ kind: "pane", id: "echo" })).toBe('pane "run echo"');
    expect(attire.describe({ kind: "panes", ids: ["a", "b", "c"] })).toBe("3 marked panes");
    expect(attire.describe({ kind: "panes", ids: ["a"] })).toBe("1 marked pane");
    dispose();
  });
});

describe("remembering choices", () => {
  it("writes every change under the workspace's key and reads it back", () => {
    const first = dressed();
    first.attire.wear({ kind: "arc", slug: "pricing" }, "nord");
    first.attire.wear({ kind: "pane", id: "b" }, "keywork-day");
    const state = first.stored();
    expect(state).toEqual({ version: 1, arcs: { pricing: "nord" }, panes: { b: "keywork-day" } });
    first.dispose();
    const second = dressed({ initial: JSON.stringify(state) });
    expect(second.attire.outfit("a").theme.name).toBe("nord");
    expect(second.attire.outfit("b").theme).toBe(keyworkDay);
    second.dispose();
  });

  it("treats garbage in storage as nothing chosen", () => {
    for (const initial of ["{not json", '{"version":2,"arcs":{},"panes":{}}', '{"arcs":[]}']) {
      const { attire, dispose } = dressed({ initial });
      expect(attire.worn({ kind: "arc", slug: "pricing" })).toBeUndefined();
      expect(attire.outfit("a").source).toBe("window");
      dispose();
    }
  });
});

describe("previewing", () => {
  it("shows a pane or arc preview live without remembering it", () => {
    const { attire, stored, dispose } = dressed();
    expect(attire.preview({ kind: "arc", slug: "pricing" }, "nord")).toBeUndefined();
    expect(named(attire.outfit("a"))).toEqual({ theme: "nord", source: "arc", arc: "pricing" });
    expect(stored()).toBeNull();
    attire.preview({ kind: "panes", ids: ["b"] }, "keywork-day");
    expect(attire.outfit("a").source).toBe("window");
    expect(attire.outfit("b").theme).toBe(keyworkDay);
    attire.preview({ kind: "window" }, undefined);
    expect(attire.outfit("b").source).toBe("window");
    dispose();
  });

  it("lets wearing replace the preview on the same target", () => {
    const { attire, dispose } = dressed();
    attire.preview({ kind: "pane", id: "a" }, "nord");
    attire.wear({ kind: "pane", id: "a" }, "rose-pine");
    expect(attire.outfit("a").theme.name).toBe("rose-pine");
    dispose();
  });

  it("previews the window through the wardrobe and keeps one preview at a time", () => {
    const { attire, wardrobe, dispose } = dressed();
    attire.preview({ kind: "window" }, "keywork-day");
    expect(wardrobe.wearing()).toBe(keyworkDay);
    attire.preview({ kind: "pane", id: "a" }, "nord");
    expect(wardrobe.wearing()).toBe(keyworkNight);
    expect(attire.preview({ kind: "arc", slug: "pricing" }, "system")).toBe(systemRefusal);
    expect(attire.outfit("a").theme.name).toBe("nord");
    dispose();
  });
});
