import { type ServerFlavor, systemFlavorName } from "@keywork-app/protocol";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { flavorNamed, gallery, keyworkDay, keyworkNight } from "./flavors.ts";
import { type Flavor, parseFlavor } from "./schema.ts";
import { applyFlavor } from "./variables.ts";

export type FlavorSource = "system" | "gallery" | "server";

export interface FlavorChoice {
  readonly name: string;
  readonly source: FlavorSource;
}

export interface Wardrobe {
  worn(): string;
  choices(): FlavorChoice[];
  wear(name: string): string | undefined;
}

export interface WardrobeOptions {
  serverFlavors: () => readonly ServerFlavor[];
  storage?: Pick<Storage, "getItem" | "setItem"> | undefined;
  apply?: ((flavor: Flavor) => void) | undefined;
  prefersDark?: (() => boolean) | undefined;
  watchAppearance?: ((listener: () => void) => () => void) | undefined;
}

export const wornFlavorKey = "keywork.flavor";

export function flavorChoices(serverFlavors: readonly ServerFlavor[]): FlavorChoice[] {
  const seen = new Set<string>();
  const choices: FlavorChoice[] = [];
  const offer = (name: string, source: FlavorSource): void => {
    if (seen.has(name)) return;
    seen.add(name);
    choices.push({ name, source });
  };
  offer(systemFlavorName, "system");
  for (const flavor of gallery) offer(flavor.name, "gallery");
  for (const flavor of serverFlavors) offer(flavor.name, "server");
  return choices;
}

export function resolveFlavor(
  name: string,
  serverFlavors: readonly ServerFlavor[],
  prefersDark: boolean,
): Flavor {
  if (name === systemFlavorName) return prefersDark ? keyworkNight : keyworkDay;
  const shipped = flavorNamed(name);
  if (shipped !== undefined) return shipped;
  const served = serverFlavors.find((flavor) => flavor.name === name);
  if (served === undefined) throw new Error(`no flavor is named "${name}"`);
  return parseFlavor(served);
}

export function createWardrobe(options: WardrobeOptions): Wardrobe {
  const prefersDark = options.prefersDark ?? systemPrefersDark;
  const apply = options.apply ?? ((flavor: Flavor) => applyFlavor(flavor));
  const [worn, setWorn] = createSignal(rememberedChoice(options.storage));
  const [appearance, bumpAppearance] = createSignal(0);
  onCleanup(
    (options.watchAppearance ?? watchSystemAppearance)(() => bumpAppearance((at) => at + 1)),
  );

  createEffect(() => {
    appearance();
    try {
      apply(resolveFlavor(worn(), options.serverFlavors(), prefersDark()));
    } catch {}
  });

  return {
    worn,
    choices: () => flavorChoices(options.serverFlavors()),
    wear: (name) => {
      try {
        resolveFlavor(name, options.serverFlavors(), prefersDark());
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      setWorn(name);
      options.storage?.setItem(wornFlavorKey, name);
      return undefined;
    },
  };
}

export function systemPrefersDark(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function watchSystemAppearance(listener: () => void): () => void {
  if (typeof matchMedia !== "function") return () => undefined;
  const query = matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function rememberedChoice(storage: Pick<Storage, "getItem"> | undefined): string {
  try {
    return storage?.getItem(wornFlavorKey) ?? systemFlavorName;
  } catch {
    return systemFlavorName;
  }
}
