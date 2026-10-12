import { systemThemeName } from "@keywork-app/protocol";
import { type Accessor, createMemo, createSignal, getOwner, runWithOwner } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { z } from "zod";
import type { PaneId } from "../layout/index.ts";
import type { Theme } from "./schema.ts";
import { keyworkNight } from "./themes.ts";
import type { Fitting, Wardrobe } from "./wardrobe.ts";

export type AttireTarget =
  | { readonly kind: "window" }
  | { readonly kind: "arc"; readonly slug: string }
  | { readonly kind: "pane"; readonly id: PaneId }
  | { readonly kind: "panes"; readonly ids: readonly PaneId[] };

export type AttireSource = "pane" | "arc" | "window";

export interface Outfit {
  readonly theme: Theme;
  readonly source: AttireSource;
  readonly arc?: string | undefined;
}

export interface Attire {
  outfit(paneId: PaneId): Outfit;
  worn(target: AttireTarget): string | undefined;
  wear(target: AttireTarget, name: string): string | undefined;
  undress(target: AttireTarget): void;
  preview(target: AttireTarget, name: string | undefined): string | undefined;
  arcOf(paneId: PaneId): string | undefined;
  dressable(paneId: PaneId): boolean;
  describe(target: AttireTarget): string;
}

export interface AttireOptions {
  readonly wardrobe: Wardrobe;
  readonly arcOf: (paneId: PaneId) => string | undefined;
  readonly dressable: (paneId: PaneId) => boolean;
  readonly titleOf: (paneId: PaneId) => string;
  readonly storage?: Pick<Storage, "getItem" | "setItem"> | undefined;
  readonly storageKey: string;
}

export interface AttireState {
  readonly version: 1;
  readonly arcs: Readonly<Record<string, string>>;
  readonly panes: Readonly<Record<PaneId, string>>;
}

export const attireStorageKey = (workspace: string): string => `keywork.attire:${workspace}`;

export const systemRefusal = `${systemThemeName} is a choice for the window · pick a theme by name`;

export function createAttire(options: AttireOptions): Attire {
  const { wardrobe } = options;
  const [choices, setChoices] = createStore<Choices>(rememberedChoices(options));
  const [previewing, setPreviewing] = createSignal<Preview>();
  const fittings = createMemo(() => new Map(wardrobe.fittings().map((fit) => [fit.name, fit])));

  const fit = (name: string): Theme | string =>
    name === systemThemeName ? systemRefusal : themeOrRefusal(fittings().get(name), name);
  const fitted = (name: string | undefined): Theme | undefined => {
    const theme = name === undefined ? undefined : fit(name);
    return typeof theme === "string" ? undefined : theme;
  };
  const previewed = (rung: Rung, key: string): string | undefined => {
    const shown = previewing();
    return shown !== undefined && covers(shown.target, rung, key) ? shown.name : undefined;
  };

  const outfit = memoizedPerPane((paneId): Outfit => {
    const house: Outfit = { theme: wardrobe.wearing() ?? keyworkNight, source: "window" };
    if (!options.dressable(paneId)) return house;
    const own = fitted(previewed("pane", paneId) ?? choices.panes[paneId]);
    if (own !== undefined) return { theme: own, source: "pane" };
    const arc = options.arcOf(paneId);
    if (arc === undefined) return house;
    const shared = fitted(previewed("arc", arc) ?? choices.arcs[arc]);
    return shared === undefined ? house : { theme: shared, source: "arc", arc };
  });

  const refusalToDress = (target: Dressing, name: string): string | undefined => {
    const theme = fit(name);
    if (typeof theme === "string") return theme;
    if (target.kind === "pane" && !options.dressable(target.id))
      return `${describeTarget(target, options.titleOf)} always wears the window's theme`;
    if (target.kind === "panes" && !target.ids.some(options.dressable))
      return "none of these panes can wear a theme of their own";
    return undefined;
  };
  const dressable = (target: Dressing): Dressing =>
    target.kind === "panes" ? { kind: "panes", ids: target.ids.filter(options.dressable) } : target;
  const choose = (target: Dressing, name: string | undefined): void => {
    setChoices(produce((draft) => assign(draft, target, name)));
    persist(options, choices);
  };
  const dropPreviewOn = (target: AttireTarget): void => {
    const shown = previewing();
    if (shown !== undefined && sameTarget(shown.target, target)) setPreviewing(undefined);
  };
  const dropPreview = (): void => {
    if (previewing()?.target.kind === "window") wardrobe.preview(undefined);
    setPreviewing(undefined);
  };

  return {
    outfit,
    worn: (target) => {
      switch (target.kind) {
        case "window":
          return wardrobe.worn();
        case "arc":
          return choices.arcs[target.slug];
        case "pane":
          return choices.panes[target.id];
        case "panes":
          return commonChoice(target.ids.map((id) => choices.panes[id]));
      }
    },
    wear: (target, name) => {
      const refusal = target.kind === "window" ? wardrobe.wear(name) : refusalToDress(target, name);
      if (refusal !== undefined) return refusal;
      dropPreviewOn(target);
      if (target.kind !== "window") choose(dressable(target), name);
      return undefined;
    },
    undress: (target) => {
      if (target.kind === "window") return;
      dropPreviewOn(target);
      choose(target, undefined);
    },
    preview: (target, name) => {
      if (name === undefined) {
        dropPreview();
        return undefined;
      }
      const refusal =
        target.kind === "window" ? wardrobe.preview(name) : refusalToDress(target, name);
      if (refusal !== undefined) return refusal;
      if (target.kind !== "window" && previewing()?.target.kind === "window")
        wardrobe.preview(undefined);
      setPreviewing({ target, name });
      return undefined;
    },
    arcOf: options.arcOf,
    dressable: options.dressable,
    describe: (target) => describeTarget(target, options.titleOf),
  };
}

export function describeTarget(target: AttireTarget, titleOf: (paneId: PaneId) => string): string {
  switch (target.kind) {
    case "window":
      return "the window";
    case "arc":
      return `arc ${target.slug}`;
    case "pane":
      return `pane "${titleOf(target.id)}"`;
    case "panes":
      return `${target.ids.length} marked ${target.ids.length === 1 ? "pane" : "panes"}`;
  }
}

export function sameTarget(left: AttireTarget, right: AttireTarget): boolean {
  return targetKey(left) === targetKey(right);
}

type Dressing = Exclude<AttireTarget, { kind: "window" }>;
type Rung = "pane" | "arc";

interface Choices {
  arcs: Record<string, string>;
  panes: Record<PaneId, string>;
}

interface Preview {
  readonly target: AttireTarget;
  readonly name: string;
}

const attireStateSchema = z.object({
  version: z.literal(1),
  arcs: z.record(z.string(), z.string()),
  panes: z.record(z.string(), z.string()),
});

function rememberedChoices(options: AttireOptions): Choices {
  try {
    const stored = options.storage?.getItem(options.storageKey);
    const parsed = attireStateSchema.safeParse(stored == null ? undefined : JSON.parse(stored));
    return parsed.success ? { arcs: parsed.data.arcs, panes: parsed.data.panes } : emptyChoices();
  } catch {
    return emptyChoices();
  }
}

function emptyChoices(): Choices {
  return { arcs: {}, panes: {} };
}

function persist(options: AttireOptions, choices: Choices): void {
  const state: AttireState = { version: 1, arcs: { ...choices.arcs }, panes: { ...choices.panes } };
  try {
    options.storage?.setItem(options.storageKey, JSON.stringify(state));
  } catch {}
}

function assign(choices: Choices, target: Dressing, name: string | undefined): void {
  const [record, keys] =
    target.kind === "arc"
      ? [choices.arcs, [target.slug]]
      : [choices.panes, target.kind === "pane" ? [target.id] : target.ids];
  for (const key of keys) {
    if (name === undefined) delete record[key];
    else record[key] = name;
  }
}

function covers(target: AttireTarget, rung: Rung, key: string): boolean {
  switch (target.kind) {
    case "window":
      return false;
    case "arc":
      return rung === "arc" && target.slug === key;
    case "pane":
      return rung === "pane" && target.id === key;
    case "panes":
      return rung === "pane" && target.ids.includes(key);
  }
}

function targetKey(target: AttireTarget): string {
  switch (target.kind) {
    case "window":
      return "window";
    case "arc":
      return `arc:${target.slug}`;
    case "pane":
      return `pane:${target.id}`;
    case "panes":
      return `panes:${JSON.stringify([...target.ids].sort())}`;
  }
}

function commonChoice(choices: readonly (string | undefined)[]): string | undefined {
  const [first] = choices;
  return choices.every((choice) => choice === first) ? first : undefined;
}

function themeOrRefusal(fitting: Fitting | undefined, name: string): Theme | string {
  if (fitting === undefined) return `no theme is named "${name}"`;
  return "theme" in fitting ? fitting.theme : fitting.refusal;
}

function memoizedPerPane(resolve: (paneId: PaneId) => Outfit): (paneId: PaneId) => Outfit {
  const owner = getOwner();
  const memos = new Map<PaneId, Accessor<Outfit>>();
  const memoFor = (paneId: PaneId): Accessor<Outfit> =>
    runWithOwner(owner, () =>
      createMemo(() => resolve(paneId), undefined, { equals: sameOutfit }),
    ) ?? (() => resolve(paneId));
  return (paneId) => {
    const known = memos.get(paneId) ?? memoFor(paneId);
    memos.set(paneId, known);
    return known();
  };
}

function sameOutfit(left: Outfit, right: Outfit): boolean {
  return left.theme === right.theme && left.source === right.source && left.arc === right.arc;
}
