import { type ServerTheme, systemThemeName } from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { parseTheme, type Theme } from "./schema.ts";
import { gallery, keyworkDay, keyworkNight } from "./themes.ts";
import { applyTheme } from "./variables.ts";

export type ThemeSource = "system" | "gallery" | "server";

export interface ThemeChoice {
  readonly name: string;
  readonly source: ThemeSource;
}

export type Fitting =
  | { readonly name: string; readonly source: ThemeSource; readonly theme: Theme }
  | { readonly name: string; readonly source: ThemeSource; readonly refusal: string };

export interface Wardrobe {
  worn(): string;
  wearing(): Theme | undefined;
  choices(): ThemeChoice[];
  fittings(): Fitting[];
  wear(name: string): string | undefined;
  preview(name: string | undefined): string | undefined;
  toggleSystem(): string | undefined;
}

export interface WardrobeOptions {
  serverThemes: () => readonly ServerTheme[];
  storage?: Pick<Storage, "getItem" | "setItem"> | undefined;
  apply?: ((theme: Theme) => void) | undefined;
  prefersDark?: (() => boolean) | undefined;
  watchAppearance?: ((listener: () => void) => () => void) | undefined;
}

export const wornThemeKey = "keywork.theme";
export const formerWornThemeKey = "keywork.flavor";
export const systemBasisKey = "keywork.theme.system";

export function createWardrobe(options: WardrobeOptions): Wardrobe {
  const prefersDark = options.prefersDark ?? systemPrefersDark;
  const apply = options.apply ?? ((theme: Theme) => applyTheme(theme));
  const [worn, setWorn] = createSignal(rememberedChoice(options.storage));
  const [basis, setBasis] = createSignal(remembered(options.storage, systemBasisKey));
  const [previewing, setPreviewing] = createSignal<string>();
  const [appearance, bumpAppearance] = createSignal(0);
  onCleanup(
    (options.watchAppearance ?? watchSystemAppearance)(() => bumpAppearance((at) => at + 1)),
  );

  const closet = createMemo(() => closetOf(options.serverThemes()));
  const resolve = (name: string): Theme => {
    appearance();
    return resolveTheme(name, closet(), prefersDark(), basis());
  };
  const attempt = (name: string): Theme | string => {
    try {
      return resolve(name);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };
  const wearing = createMemo(() => {
    const theme = attempt(previewing() ?? worn());
    return typeof theme === "string" ? undefined : theme;
  });

  createEffect(() => {
    const theme = wearing();
    if (theme !== undefined) apply(theme);
  });

  const remember = (key: string, value: string): void => {
    try {
      options.storage?.setItem(key, value);
    } catch {}
  };

  const wear = (name: string): string | undefined => {
    const theme = attempt(name);
    if (typeof theme === "string") return theme;
    setPreviewing(undefined);
    setWorn(name);
    remember(wornThemeKey, name);
    return undefined;
  };

  return {
    worn,
    wearing,
    choices: () => choicesOf(closet()),
    fittings: () =>
      choicesOf(closet()).map((choice) => {
        const theme = attempt(choice.name);
        return typeof theme === "string" ? { ...choice, refusal: theme } : { ...choice, theme };
      }),
    wear,
    preview: (name) => {
      if (name === undefined) {
        setPreviewing(undefined);
        return undefined;
      }
      const theme = attempt(name);
      if (typeof theme === "string") return theme;
      setPreviewing(name);
      return undefined;
    },
    toggleSystem: () => {
      if (worn() === systemThemeName) return wear(wearing()?.name ?? keyworkNight.name);
      const current = wearing();
      if (current !== undefined) {
        setBasis(current.name);
        remember(systemBasisKey, current.name);
      }
      return wear(systemThemeName);
    },
  };
}

export interface BootOptions {
  storage?: Pick<Storage, "getItem"> | undefined;
  apply?: ((theme: Theme) => void) | undefined;
  prefersDark?: (() => boolean) | undefined;
}

export function wearRememberedTheme(options: BootOptions = {}): Theme {
  const prefersDark = (options.prefersDark ?? systemPrefersDark)();
  const closet = closetOf([]);
  const basis = remembered(options.storage, systemBasisKey);
  const theme =
    fitted(closet, rememberedChoice(options.storage)) ??
    resolveTheme(systemThemeName, closet, prefersDark, basis);
  (options.apply ?? ((chosen: Theme) => applyTheme(chosen)))(theme);
  return theme;
}

export type Closet = ReadonlyMap<string, { source: ThemeSource; theme: () => Theme }>;

export function closetOf(serverThemes: readonly ServerTheme[]): Closet {
  const closet = new Map<string, { source: ThemeSource; theme: () => Theme }>();
  for (const theme of gallery) closet.set(theme.name, { source: "gallery", theme: () => theme });
  for (const served of serverThemes) {
    const shipped = closet.get(served.name);
    closet.set(served.name, {
      source: shipped?.source ?? "server",
      theme: once(() => parseTheme(served)),
    });
  }
  return closet;
}

export function choicesOf(closet: Closet): ThemeChoice[] {
  return [
    { name: systemThemeName, source: "system" },
    ...[...closet.entries()].map(([name, { source }]) => ({ name, source })),
  ];
}

export function resolveTheme(
  name: string,
  closet: Closet,
  prefersDark: boolean,
  systemBasis: string | undefined = undefined,
): Theme {
  if (name === systemThemeName) return systemTheme(closet, prefersDark, systemBasis);
  const entry = closet.get(name);
  if (entry === undefined) throw new Error(`no theme is named "${name}"`);
  return entry.theme();
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

function systemTheme(closet: Closet, prefersDark: boolean, basis: string | undefined): Theme {
  const wanted = prefersDark ? "dark" : "light";
  const pairing = basisPair(closet, basis) ?? [keyworkNight, keyworkDay];
  return pairing.find((theme) => theme.appearance === wanted) ?? pairing[0];
}

function basisPair(closet: Closet, basis: string | undefined): [Theme, Theme] | undefined {
  if (basis === undefined) return undefined;
  const theme = fitted(closet, basis);
  const pair = theme?.pair === undefined ? undefined : fitted(closet, theme.pair);
  return theme === undefined || pair === undefined ? undefined : [theme, pair];
}

function fitted(closet: Closet, name: string): Theme | undefined {
  try {
    return closet.get(name)?.theme();
  } catch {
    return undefined;
  }
}

function once<Value>(make: () => Value): () => Value {
  let outcome: { value: Value } | { error: unknown } | undefined;
  return () => {
    outcome ??= settled(make);
    if ("error" in outcome) throw outcome.error;
    return outcome.value;
  };
}

function settled<Value>(make: () => Value): { value: Value } | { error: unknown } {
  try {
    return { value: make() };
  } catch (error) {
    return { error };
  }
}

function rememberedChoice(storage: Pick<Storage, "getItem"> | undefined): string {
  return (
    remembered(storage, wornThemeKey) ?? remembered(storage, formerWornThemeKey) ?? systemThemeName
  );
}

function remembered(
  storage: Pick<Storage, "getItem"> | undefined,
  key: string,
): string | undefined {
  try {
    return storage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}
