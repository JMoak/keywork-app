import type { ServerTheme } from "@keywork-app/protocol";
import { cleanup } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaneId } from "../../layout/index.ts";
import type { Attire, AttireTarget } from "../../theme/attire.ts";
import type { Theme } from "../../theme/schema.ts";
import { keyworkNight } from "../../theme/themes.ts";
import { createWardrobe, type Wardrobe } from "../../theme/wardrobe.ts";
import { paneActions } from "../index.ts";
import { mountPane, overviewShell } from "../overview/rows.test.tsx";
import type { PaneMarks, ShellSeams } from "../registry.ts";
import {
  onlyWindowFollowsNotice,
  rememberedNotice,
  summonNotices,
  swatchesOf,
  type ThemesSpec,
  targetRememberedNotice,
  tasteWords,
  themesPane,
  windowAlwaysDressedNotice,
} from "./index.tsx";
import { markedChoices } from "./targets.ts";

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
    expect(container.querySelector(".kw-ov-head")?.textContent).toContain(
      "keywork-day · the window",
    );
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

interface Closet {
  arcs: Record<string, string>;
  panes: Record<PaneId, string>;
}

interface FakeAttire extends Attire {
  readonly closet: Closet;
  readonly previews: Array<[string, string | undefined]>;
}

const titles: Record<PaneId, string> = {
  w1: "run echo served",
  w2: "pricing notes",
  w3: "scratch",
};
const arcsOfPanes: Record<PaneId, string> = { w1: "pricing", w2: "pricing" };
const housePanes = new Set<PaneId>(["p1", "arcs"]);

function fakeAttire(): FakeAttire {
  const [closet, setCloset] = createStore<Closet>({ arcs: {}, panes: {} });
  const previews: Array<[string, string | undefined]> = [];
  const dress = (target: AttireTarget, name: string | undefined): void =>
    setCloset(
      produce((draft) => {
        const shelf = target.kind === "arc" ? draft.arcs : draft.panes;
        for (const key of shelfKeys(target)) {
          if (name === undefined) delete shelf[key];
          else shelf[key] = name;
        }
      }),
    );
  return {
    closet,
    previews,
    outfit: () => ({ theme: keyworkNight, source: "window" }),
    worn: (target) => sharedOwn(shelfKeys(target).map((key) => shelfOf(closet, target)[key])),
    wear: (target, name) => {
      if (name === "washed-out") return `theme "${name}" fails the contrast floor`;
      dress(target, name);
      return undefined;
    },
    undress: (target) => dress(target, undefined),
    preview: (target, name) => {
      previews.push([fakeDescribe(target), name]);
      return undefined;
    },
    arcOf: (paneId) => arcsOfPanes[paneId],
    dressable: (paneId) => !housePanes.has(paneId),
    describe: fakeDescribe,
  };
}

function shelfKeys(target: AttireTarget): readonly string[] {
  switch (target.kind) {
    case "window":
      return [];
    case "arc":
      return [target.slug];
    case "pane":
      return [target.id];
    case "panes":
      return target.ids;
  }
}

function shelfOf(closet: Closet, target: AttireTarget): Record<string, string> {
  return target.kind === "arc" ? closet.arcs : closet.panes;
}

function sharedOwn(names: readonly (string | undefined)[]): string | undefined {
  const distinct = new Set(names);
  return distinct.size === 1 ? names[0] : undefined;
}

function fakeDescribe(target: AttireTarget): string {
  switch (target.kind) {
    case "window":
      return "the window";
    case "arc":
      return `arc ${target.slug}`;
    case "pane":
      return `pane "${titles[target.id] ?? target.id}"`;
    case "panes":
      return `${target.ids.length} marked panes`;
  }
}

function fakeMarks(ids: PaneId[]): PaneMarks {
  return {
    toggle: () => undefined,
    has: (id) => ids.includes(id),
    all: () => ids,
    clear: () => undefined,
  };
}

interface Dressed extends Fitted {
  attire: FakeAttire;
  shell: ShellSeams;
  rebound: ThemesSpec[];
}

function dressed(options: { focused?: PaneId; marked?: PaneId[] } = {}): Dressed {
  const fitting = fitted();
  const attire = fakeAttire();
  const rebound: ThemesSpec[] = [];
  const shell: ShellSeams = {
    ...overviewShell().shell,
    wardrobe: fitting.wardrobe,
    attire,
    marks: fakeMarks(options.marked ?? []),
    focusedPane: () => options.focused,
    rebind: (_id, spec) => {
      rebound.push(themesPane.spec.parse(spec));
    },
  };
  return { ...fitting, attire, shell, rebound };
}

function head(container: HTMLElement): string {
  return container.querySelector(".kw-ov-head-lead")?.textContent ?? "";
}

function notice(container: HTMLElement): string {
  return container.querySelector(".kw-ov-line")?.textContent ?? "";
}

function rowNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-themes-row")].map(
    (row) => row.getAttribute("data-theme-name") ?? "",
  );
}

function markOf(container: HTMLElement, name: string): string {
  return container.querySelector(`[data-theme-name='${name}'] .kw-themes-mark`)?.textContent ?? "";
}

const summon = (shell: ShellSeams, variant?: string) => themesPane.summon?.spec(shell, variant);

const onPane: ThemesSpec = { kind: "themes", target: { kind: "pane", id: "w1" } };

describe("markedChoices", () => {
  it("names one shared choice, a mix, or none at all", () => {
    expect(markedChoices(["whiplash", "whiplash"])).toEqual({ kind: "shared", name: "whiplash" });
    expect(markedChoices(["whiplash", undefined])).toEqual({ kind: "mixed" });
    expect(markedChoices(["whiplash", "everforest-dark"])).toEqual({ kind: "mixed" });
    expect(markedChoices([undefined, undefined])).toEqual({ kind: "bare" });
    expect(markedChoices([])).toEqual({ kind: "bare" });
  });
});

describe("the themes pane's summon variants", () => {
  it("binds the pane variants to leader w and leader shift+w, marked to the palette only", () => {
    expect(paneActions["themes.summon"]?.chords).toBe("leader shift+f");
    expect(paneActions["themes.summon.pane"]?.chords).toBe("leader w");
    expect(paneActions["themes.summon.arc"]?.chords).toBe("leader shift+w");
    expect(paneActions["themes.summon.marked"]?.chords).toBe("none");
    expect(paneActions["themes.summon.marked"]?.command?.name).toBe("theme-marked");
  });

  it("targets the pane it was summoned from, its arc, or the marked panes", () => {
    const { shell, dispose } = dressed({ focused: "w1", marked: ["w1", "w3"] });
    expect(summon(shell)).toEqual({ kind: "themes", summonedFrom: "w1" });
    expect(summon(shell, "pane")).toEqual({ ...onPane, summonedFrom: "w1" });
    expect(summon(shell, "arc")).toEqual({
      kind: "themes",
      target: { kind: "arc", slug: "pricing" },
      summonedFrom: "w1",
    });
    expect(summon(shell, "marked")).toEqual({
      kind: "themes",
      target: { kind: "panes", ids: ["w1", "w3"] },
      summonedFrom: "w1",
    });
    dispose();
  });

  it("falls back to the window with a notice when the variant has nothing to dress", () => {
    const loose = dressed({ focused: "w3" });
    expect(summon(loose.shell, "arc")).toEqual({
      kind: "themes",
      summonedFrom: "w3",
      notice: summonNotices.noArc,
    });
    expect(summon(loose.shell, "marked")).toMatchObject({ notice: summonNotices.noMarks });
    loose.dispose();
    const house = dressed({ focused: "arcs" });
    expect(summon(house.shell, "pane")).toEqual({
      kind: "themes",
      summonedFrom: "arcs",
      notice: summonNotices.noPane,
    });
    house.dispose();
  });

  it("says the summon notice once, then forgets it from the layout", () => {
    const { shell, rebound, dispose } = dressed({ focused: "w3" });
    const { container } = mountPane(
      themesPane.component,
      summon(shell, "arc") as ThemesSpec,
      shell,
    );
    expect(notice(container)).toBe(summonNotices.noArc);
    expect(rebound).toEqual([{ kind: "themes", summonedFrom: "w3" }]);
    dispose();
  });

  it("validates the persisted target", () => {
    const parses = (target: unknown) =>
      themesPane.spec.safeParse({ kind: "themes", target }).success;
    expect(parses({ kind: "panes", ids: ["w1"] })).toBe(true);
    expect(parses({ kind: "arc" })).toBe(false);
    expect(parses({ kind: "panes", ids: [3] })).toBe(false);
  });
});

describe("the themes pane on a target", () => {
  it("cycles window, this pane, its arc, the marked panes and back, rebinding each", () => {
    const { shell, rebound, dispose } = dressed({ marked: ["w1", "w2", "w3"] });
    const { container, act } = mountPane(
      themesPane.component,
      { kind: "themes", summonedFrom: "w1" },
      shell,
    );
    const heads = [head(container)];
    for (let turn = 0; turn < 4; turn += 1) {
      act("themes.target");
      heads.push(head(container));
    }
    expect(heads).toEqual([
      "keywork-night · the window",
      'inherits keywork-night · pane "run echo served"',
      "inherits keywork-night · arc pricing",
      "inherits keywork-night · 3 marked",
      "keywork-night · the window",
    ]);
    expect(rebound.map((spec) => spec.target)).toEqual([
      { kind: "pane", id: "w1" },
      { kind: "arc", slug: "pricing" },
      { kind: "panes", ids: ["w1", "w2", "w3"] },
      undefined,
    ]);
    expect(rebound.every((spec) => spec.summonedFrom === "w1")).toBe(true);
    dispose();
  });

  it("offers only the targets that make sense right now", () => {
    const { shell, dispose } = dressed();
    const { container, act } = mountPane(
      themesPane.component,
      { kind: "themes", summonedFrom: "w3" },
      shell,
    );
    act("themes.target");
    expect(head(container)).toBe('inherits keywork-night · pane "scratch"');
    act("themes.target");
    expect(head(container)).toBe("keywork-night · the window");
    dispose();
  });

  it("names the window as the only target when nothing else can be dressed", () => {
    const { container, act } = mount(fitted().wardrobe);
    act("themes.target");
    expect(notice(container)).toBe(summonNotices.windowOnly);
    expect(head(container)).toBe("keywork-night · the window");
  });

  it("previews, wears and undresses on the target, never on the window", async () => {
    const { shell, attire, wardrobe, dispose } = dressed();
    const { container, act } = mountPane(themesPane.component, onPane, shell);
    expect(cursorName(container)).toBe("keywork-night");
    act("themes.down");
    await nextFrame();
    expect(attire.previews.at(-1)).toEqual(['pane "run echo served"', "keywork-day"]);
    act("themes.restore");
    expect(attire.previews.at(-1)).toEqual(['pane "run echo served"', undefined]);
    expect(notice(container)).toBe("kept keywork-night");
    act("themes.wear");
    expect(attire.closet.panes.w1).toBe("keywork-day");
    expect(wardrobe.worn()).toBe("keywork-night");
    expect(notice(container)).toBe(targetRememberedNotice);
    expect(head(container)).toBe('keywork-day · pane "run echo served"');
    act("themes.undress");
    expect(attire.closet.panes.w1).toBeUndefined();
    expect(notice(container)).toBe('pane "run echo served" inherits again');
    expect(cursorName(container)).toBe("keywork-night");
    dispose();
  });

  it("marks the target's own theme solid and what it inherits with a dot", () => {
    const { shell, attire, dispose } = dressed();
    attire.wear({ kind: "arc", slug: "pricing" }, "keywork-day");
    const { container, act } = mountPane(themesPane.component, onPane, shell);
    expect(markOf(container, "keywork-day")).toBe("·");
    expect(markOf(container, "keywork-night")).toBe(" ");
    expect(cursorName(container)).toBe("keywork-day");
    act("themes.up");
    act("themes.wear");
    expect(markOf(container, "keywork-night")).toBe("█");
    expect(markOf(container, "keywork-day")).toBe("·");
    expect(head(container)).toBe('keywork-night · pane "run echo served"');
    dispose();
  });

  it("lists system and follows the OS only for the window", () => {
    const { shell, dispose } = dressed();
    const { container, act } = mountPane(
      themesPane.component,
      { kind: "themes", target: { kind: "arc", slug: "pricing" } },
      shell,
    );
    expect(rowNames(container)).not.toContain("system");
    act("themes.system");
    expect(notice(container)).toBe(onlyWindowFollowsNotice);
    act("themes.target");
    expect(rowNames(container)[0]).toBe("system");
    act("themes.undress");
    expect(notice(container)).toBe(windowAlwaysDressedNotice);
    dispose();
  });

  it("names the marked panes' shared choice in the plural", () => {
    const { shell, attire, dispose } = dressed();
    const marked: AttireTarget = { kind: "panes", ids: ["w1", "w2", "w3"] };
    attire.wear(marked, "keywork-day");
    const { container } = mountPane(
      themesPane.component,
      { kind: "themes", target: { kind: "panes", ids: ["w1", "w2", "w3"] } },
      shell,
    );
    expect(head(container)).toBe("keywork-day · 3 marked");
    dispose();
  });

  it("tells a mixed marked set from a bare one and echoes every theme its panes wear", () => {
    const { shell, attire, dispose } = dressed();
    attire.wear({ kind: "pane", id: "w1" }, "keywork-day");
    const { container, act } = mountPane(
      themesPane.component,
      { kind: "themes", target: { kind: "panes", ids: ["w1", "w3"] } },
      shell,
    );
    expect(head(container)).toBe("different themes · 2 marked");
    expect(markOf(container, "keywork-day")).toBe("·");
    expect(markOf(container, "keywork-night")).toBe("·");
    expect(markOf(container, "washed-out")).toBe(" ");
    act("themes.restore");
    expect(notice(container)).toBe("kept what each pane wears");
    dispose();
  });

  it("drops the preview and any pending frame when the pane goes away", async () => {
    const { shell, attire, dispose } = dressed();
    const { act } = mountPane(themesPane.component, onPane, shell);
    act("themes.down");
    cleanup();
    await nextFrame();
    expect(attire.previews).toEqual([['pane "run echo served"', undefined]]);
    dispose();
  });

  it("keeps the window's own wording when the window is the target", () => {
    const { shell, wardrobe, dispose } = dressed();
    const { container, act } = mountPane(themesPane.component, { kind: "themes" }, shell);
    act("themes.down");
    act("themes.wear");
    expect(wardrobe.worn()).toBe("keywork-day");
    expect(notice(container)).toBe(rememberedNotice);
    dispose();
  });
});
