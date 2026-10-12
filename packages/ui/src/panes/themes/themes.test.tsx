import type { ServerTheme } from "@keywork-app/protocol";
import { cleanup } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Theme } from "../../theme/schema.ts";
import { keyworkNight } from "../../theme/themes.ts";
import { createWardrobe, type Wardrobe } from "../../theme/wardrobe.ts";
import { mountPane, overviewShell } from "../overview/rows.test.tsx";
import { rememberedNotice, swatchesOf, tasteWords, themesPane } from "./index.tsx";

const scrolled: Element[] = [];

beforeEach(() => {
  scrolled.length = 0;
  Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
    scrolled.push(this);
  });
});

afterEach(cleanup);

const washedOut: ServerTheme = {
  name: "washed-out",
  appearance: "dark",
  tokens: { ...keyworkNight.tokens, text: "#3a3f5c" },
  density: { ...keyworkNight.density },
  gap: 0,
  chromeWeight: "seams",
  instruments: "calm",
};

interface Fitted {
  wardrobe: Wardrobe;
  applied: Theme[];
  stored: Record<string, string>;
  dispose(): void;
}

function fitted(worn = "keywork-night"): Fitted {
  const applied: Theme[] = [];
  const stored: Record<string, string> = { "keywork.theme": worn };
  const [wardrobe, dispose] = createRoot((dispose) => [
    createWardrobe({
      serverThemes: () => [washedOut],
      storage: {
        getItem: (key) => stored[key] ?? null,
        setItem: (key, value) => {
          stored[key] = value;
        },
      },
      apply: (theme) => applied.push(theme),
      prefersDark: () => true,
      watchAppearance: () => () => undefined,
    }),
    dispose,
  ]);
  return { wardrobe, applied, stored, dispose };
}

function mount(wardrobe: Wardrobe | undefined) {
  const harness = overviewShell();
  const shell = wardrobe === undefined ? harness.shell : { ...harness.shell, wardrobe };
  return { ...mountPane(themesPane.component, { kind: "themes" }, shell), harness };
}

const nextFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 40));

function cursorName(container: HTMLElement): string | undefined {
  return (
    container.querySelector(".kw-themes-row[data-cursor]")?.getAttribute("data-theme-name") ??
    undefined
  );
}

describe("the themes pane", () => {
  it("lists the wardrobe with each theme's own swatches, taste words and pair", () => {
    const { wardrobe, dispose } = fitted();
    const { container } = mount(wardrobe);
    const names = [...container.querySelectorAll(".kw-themes-row")].map((row) =>
      row.getAttribute("data-theme-name"),
    );
    expect(names.slice(0, 3)).toEqual(["system", "keywork-night", "keywork-day"]);
    expect(names.at(-1)).toBe("washed-out");
    const night = container.querySelector("[data-theme-name='keywork-night']") as HTMLElement;
    const swatches = [...night.querySelectorAll<HTMLElement>(".kw-themes-swatch")];
    expect(swatches).toHaveLength(swatchesOf(keyworkNight).length);
    expect(swatches[0]?.style.background).toBe(keyworkNight.tokens.background);
    expect(night.querySelector(".kw-themes-taste")?.textContent).toBe("dark · seams · calm");
    expect(tasteWords(keyworkNight)).toBe("dark · seams · calm");
    expect(night.querySelector(".kw-themes-pair")?.textContent).toBe("pairs with keywork-day");
    expect(night.hasAttribute("data-worn")).toBe(true);
    expect(cursorName(container)).toBe("keywork-night");
    dispose();
  });

  it("previews on the frame tick as the cursor moves, wears on enter, restores on escape", async () => {
    const { wardrobe, applied, stored, dispose } = fitted();
    const { container, act } = mount(wardrobe);
    act("themes.down");
    act("themes.down");
    expect(applied.at(-1)?.name).toBe("keywork-night");
    await nextFrame();
    const previewed = cursorName(container);
    expect(applied.at(-1)?.name).toBe(previewed);
    expect(applied.filter((theme) => theme.name !== "keywork-night")).toHaveLength(1);
    expect(wardrobe.worn()).toBe("keywork-night");
    act("themes.restore");
    expect(applied.at(-1)?.name).toBe("keywork-night");
    act("themes.up");
    await nextFrame();
    act("themes.wear");
    expect(wardrobe.worn()).toBe("keywork-day");
    expect(stored["keywork.theme"]).toBe("keywork-day");
    expect(container.querySelector(".kw-ov-head")?.textContent).toContain("wearing keywork-day");
    expect(container.querySelector(".kw-ov-line")?.textContent).toBe(rememberedNotice);
    dispose();
  });

  it("opens on the theme system is wearing, so the first j moves somewhere visible", async () => {
    const { wardrobe, dispose } = fitted("system");
    const { container, act } = mount(wardrobe);
    expect(cursorName(container)).toBe("keywork-night");
    act("themes.down");
    await nextFrame();
    expect(cursorName(container)).toBe("keywork-day");
    act("themes.up");
    act("themes.up");
    expect(cursorName(container)).toBe("system");
    dispose();
  });

  it("scrolls the cursor row into view on open and on every move", () => {
    const { wardrobe, dispose } = fitted();
    const { container, act } = mount(wardrobe);
    const cursorRow = () => container.querySelector(".kw-themes-row[data-cursor]");
    expect(scrolled.at(-1)).toBe(cursorRow());
    act("themes.down");
    expect(cursorName(container)).toBe("keywork-day");
    expect(scrolled.at(-1)).toBe(cursorRow());
    act("themes.up");
    expect(scrolled.at(-1)).toBe(cursorRow());
    expect(scrolled).toHaveLength(3);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    dispose();
  });

  it("refuses a theme below the floor in keywork's words and keeps what is worn", async () => {
    const { wardrobe, dispose } = fitted();
    const { container, act } = mount(wardrobe);
    const refused = container.querySelector("[data-theme-name='washed-out']") as HTMLElement;
    expect(refused.hasAttribute("data-refused")).toBe(true);
    expect(refused.querySelector(".kw-themes-refusal")?.textContent).toMatch(
      /^theme "washed-out" fails the contrast floor:/,
    );
    while (cursorName(container) !== "washed-out") act("themes.down");
    await nextFrame();
    act("themes.wear");
    expect(wardrobe.worn()).toBe("keywork-night");
    expect(container.querySelector(".kw-ov-line")?.textContent).toMatch(/fails the contrast floor/);
    dispose();
  });

  it("toggles system with s and back to the theme system resolved", () => {
    const { wardrobe, dispose } = fitted("keywork-day");
    const { container, act } = mount(wardrobe);
    act("themes.system");
    expect(wardrobe.worn()).toBe("system");
    expect(wardrobe.wearing()?.name).toBe("keywork-night");
    expect(container.querySelector("[data-theme-name='system'] .kw-themes-pair")?.textContent).toBe(
      "follows the OS · wearing keywork-night",
    );
    act("themes.system");
    expect(wardrobe.worn()).toBe("keywork-night");
    dispose();
  });

  it("never shares a palette name with the per-theme theme-<name> commands", () => {
    const { wardrobe, dispose } = fitted();
    const perTheme = new Set(wardrobe.choices().map((choice) => `theme-${choice.name}`));
    const local = Object.values(themesPane.localActions ?? {}).map(
      (action) => action.command?.name,
    );
    expect(local).toContain("theme-follow");
    for (const name of [...local, themesPane.summon?.command.name]) {
      expect(perTheme.has(name ?? ""), name).toBe(false);
    }
    dispose();
  });

  it("teaches the palette when the window has no wardrobe", () => {
    const { container } = mount(undefined);
    expect(container.textContent).toBe(
      "no wardrobe in this window · ctrl+k palette.commands lists the theme commands",
    );
  });
});
