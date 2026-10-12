import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ServerTheme, ThemesView } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { Theme } from "./schema.ts";
import { gallery, keyworkDay, keyworkNight } from "./themes.ts";
import {
  choicesOf,
  closetOf,
  createWardrobe,
  formerWornThemeKey,
  resolveTheme,
  systemBasisKey,
  type Wardrobe,
  type WardrobeOptions,
  wearRememberedTheme,
  wornThemeKey,
} from "./wardrobe.ts";

const served = (
  JSON.parse(
    readFileSync(join(process.cwd(), "packages/client/src/fixtures/themes.json"), "utf8"),
  ) as ThemesView
).themes;

const dusk: ServerTheme = {
  name: "dusk",
  appearance: "dark",
  tokens: { ...keyworkNight.tokens },
  density: { ...keyworkNight.density },
  gap: 1,
  chromeWeight: "borderless",
  instruments: "calm",
  pair: "dawn",
};
const dawn: ServerTheme = {
  ...dusk,
  name: "dawn",
  appearance: "light",
  tokens: { ...keyworkDay.tokens },
  pair: "dusk",
};

function memoryStorage(
  initial: Record<string, string> = {},
): Pick<Storage, "getItem" | "setItem"> & { items: Record<string, string> } {
  const items = { ...initial };
  return {
    items,
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => {
      items[key] = value;
    },
  };
}

interface Fitted {
  wardrobe: Wardrobe;
  applied: Theme[];
  flip(dark: boolean): void;
  dispose(): void;
}

function fitted(options: Partial<WardrobeOptions> = {}, startDark = true): Fitted {
  const applied: Theme[] = [];
  let dark = startDark;
  let listener: () => void = () => undefined;
  const [wardrobe, dispose] = createRoot((dispose) => [
    createWardrobe({
      serverThemes: () => served,
      storage: memoryStorage(),
      apply: (theme) => applied.push(theme),
      prefersDark: () => dark,
      watchAppearance: (next) => {
        listener = next;
        return () => undefined;
      },
      ...options,
    }),
    dispose,
  ]);
  return {
    wardrobe,
    applied,
    flip: (next) => {
      dark = next;
      listener();
    },
    dispose,
  };
}

describe("the wardrobe's choices", () => {
  it("lists system first, then the gallery, then server themes not already shipped", () => {
    expect(choicesOf(closetOf(served))).toEqual([
      { name: "system", source: "system" },
      ...gallery.map((theme) => ({ name: theme.name, source: "gallery" })),
      { name: "closet-mist", source: "server" },
    ]);
  });

  it("lets the server's closet override a gallery theme by name", () => {
    const closet = closetOf([{ ...dusk, name: "keywork-night", gap: 3 }]);
    expect(resolveTheme("keywork-night", closet, true).gap).toBe(3);
    expect(closet.get("keywork-night")?.source).toBe("gallery");
  });
});

describe("resolveTheme", () => {
  it("fills system from the OS appearance between the default pair", () => {
    expect(resolveTheme("system", closetOf(served), true)).toBe(keyworkNight);
    expect(resolveTheme("system", closetOf(served), false)).toBe(keyworkDay);
  });

  it("follows a theme's pair across appearance when system is based on it", () => {
    const closet = closetOf([dusk, dawn]);
    expect(resolveTheme("system", closet, true, "dawn").name).toBe("dusk");
    expect(resolveTheme("system", closet, false, "dawn").name).toBe("dawn");
    expect(resolveTheme("system", closet, false, "missing")).toBe(keyworkDay);
  });

  it("validates a server theme through the same floor and refuses with keywork's words", () => {
    expect(() => resolveTheme("closet-mist", closetOf(served), true)).toThrow(
      /^theme "closet-mist" fails the contrast floor:\n {2}text on background measures Lc \d+\.\d, needs at least 60/,
    );
    expect(() => resolveTheme("nope", closetOf(served), true)).toThrow('no theme is named "nope"');
  });

  it("wears a theme the server serves but the gallery lacks", () => {
    expect(resolveTheme("dusk", closetOf([dusk]), true).chromeWeight).toBe("borderless");
  });
});

describe("createWardrobe", () => {
  it("wears system by default, follows the OS appearance, and remembers a choice", () => {
    const storage = memoryStorage();
    const { wardrobe, applied, flip, dispose } = fitted({ storage });
    expect(wardrobe.worn()).toBe("system");
    expect(applied.at(-1)).toBe(keyworkNight);
    flip(false);
    expect(applied.at(-1)).toBe(keyworkDay);
    expect(wardrobe.wear("keywork-night")).toBeUndefined();
    expect(applied.at(-1)?.name).toBe("keywork-night");
    expect(storage.items[wornThemeKey]).toBe("keywork-night");
    dispose();
  });

  it("reads the former flavor key once when no theme is remembered", () => {
    const storage = memoryStorage({ [formerWornThemeKey]: "keywork-day" });
    const { wardrobe, dispose } = fitted({ storage });
    expect(wardrobe.worn()).toBe("keywork-day");
    wardrobe.wear("keywork-night");
    expect(storage.items[wornThemeKey]).toBe("keywork-night");
    dispose();
  });

  it("refuses a failing server theme with the exact message and keeps what is worn", () => {
    const { wardrobe, applied, dispose } = fitted({
      storage: memoryStorage({ [wornThemeKey]: "keywork-day" }),
    });
    expect(wardrobe.worn()).toBe("keywork-day");
    expect(wardrobe.wear("closet-mist")).toMatch(/^theme "closet-mist" fails the contrast floor:/);
    expect(wardrobe.preview("closet-mist")).toMatch(/fails the contrast floor/);
    expect(wardrobe.worn()).toBe("keywork-day");
    expect(applied).toEqual([keyworkDay]);
    const fitting = wardrobe.fittings().find((entry) => entry.name === "closet-mist");
    expect(fitting && "refusal" in fitting).toBe(true);
    dispose();
  });

  it("previews without remembering and restores what is worn", () => {
    const storage = memoryStorage({ [wornThemeKey]: "keywork-night" });
    const { wardrobe, applied, dispose } = fitted({ storage });
    expect(wardrobe.preview("keywork-day")).toBeUndefined();
    expect(applied.at(-1)).toBe(keyworkDay);
    expect(wardrobe.wearing()).toBe(keyworkDay);
    expect(wardrobe.worn()).toBe("keywork-night");
    wardrobe.preview(undefined);
    expect(applied.at(-1)?.name).toBe("keywork-night");
    expect(storage.items[wornThemeKey]).toBe("keywork-night");
    dispose();
  });

  it("toggles system on from the worn theme's pair and off to what system resolved", () => {
    const storage = memoryStorage({ [wornThemeKey]: "dawn" });
    const { wardrobe, applied, flip, dispose } = fitted(
      { storage, serverThemes: () => [dusk, dawn] },
      false,
    );
    expect(wardrobe.toggleSystem()).toBeUndefined();
    expect(wardrobe.worn()).toBe("system");
    expect(storage.items[systemBasisKey]).toBe("dawn");
    flip(true);
    expect(applied.at(-1)?.name).toBe("dusk");
    expect(wardrobe.toggleSystem()).toBeUndefined();
    expect(wardrobe.worn()).toBe("dusk");
    dispose();
  });
});

describe("wearRememberedTheme", () => {
  it("dresses the root at boot in the remembered gallery theme", () => {
    const root = document.createElement("div");
    const theme = wearRememberedTheme({
      storage: memoryStorage({ [wornThemeKey]: "keywork-day" }),
      apply: (chosen) => {
        root.dataset.theme = chosen.name;
      },
      prefersDark: () => true,
    });
    expect(theme).toBe(keyworkDay);
    expect(root.dataset.theme).toBe("keywork-day");
  });

  it("reads the former key, and falls to system for a server-only or missing choice", () => {
    const boot = (items: Record<string, string>, dark: boolean) =>
      wearRememberedTheme({
        storage: memoryStorage(items),
        apply: () => undefined,
        prefersDark: () => dark,
      });
    expect(boot({ [formerWornThemeKey]: "keywork-day" }, true)).toBe(keyworkDay);
    expect(boot({ [wornThemeKey]: "closet-mist" }, true)).toBe(keyworkNight);
    expect(boot({}, false)).toBe(keyworkDay);
  });

  it("marks the document root when no apply is given", () => {
    wearRememberedTheme({ storage: memoryStorage({ [wornThemeKey]: "keywork-night" }) });
    expect(document.documentElement.dataset.theme).toBe("keywork-night");
    expect(document.documentElement.dataset.appearance).toBe("dark");
  });
});
