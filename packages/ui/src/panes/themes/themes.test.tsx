import type { ServerTheme } from "@keywork-app/protocol";
import { cleanup, within } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaneId } from "../../layout/index.ts";
import type { Attire, AttireTarget } from "../../theme/attire.ts";
import type { Theme } from "../../theme/schema.ts";
import { keyworkNight } from "../../theme/themes.ts";
import { createWardrobe, type Wardrobe } from "../../theme/wardrobe.ts";
import { mountPane, overviewShell } from "../overview/testing.tsx";
import type { PaneMarks, ShellSeams } from "../registry.ts";
import { rememberedNotice, type ThemesSpec, targetRememberedNotice, themesPane } from "./index.tsx";
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

  it("tells assistive tech which theme the cursor is on and which one is worn", async () => {
    const { wardrobe, dispose } = fitted();
    const { container, act } = mount(wardrobe);
    const list = within(container).getByRole("listbox", { name: "themes" });
    const cursorOption = () =>
      container.querySelector(`#${list.getAttribute("aria-activedescendant")}`);
    expect(cursorOption()?.getAttribute("data-theme-name")).toBe("keywork-night");
    expect(cursorOption()?.getAttribute("aria-selected")).toBe("true");
    act("themes.down");
    await nextFrame();
    expect(cursorOption()?.getAttribute("data-theme-name")).toBe(cursorName(container));
    const worn = within(list).getByRole("option", { current: true });
    expect(worn.getAttribute("data-theme-name")).toBe("keywork-night");
    expect(within(worn).getByRole("img", { name: "worn" })).toBeTruthy();
    expect(within(container).getByRole("status").textContent).toBe(notice(container));
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

  it("drops the preview and any pending frame when the pane goes away", async () => {
    const { shell, attire, dispose } = dressed();
    const { act } = mountPane(themesPane.component, onPane, shell);
    act("themes.down");
    cleanup();
    await nextFrame();
    expect(attire.previews).toEqual([['pane "run echo served"', undefined]]);
    dispose();
  });
});
