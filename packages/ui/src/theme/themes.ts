import declared from "./gallery.json";
import { parseTheme, type Theme } from "./schema.ts";

export const gallery: readonly Theme[] = declared.themes.map((theme) => parseTheme(theme));

export const wornThemeKey = "keywork.theme";
export const formerWornThemeKey = "keywork.flavor";
export const systemBasisKey = "keywork.theme.system";
export const rememberedThemeKeys = [wornThemeKey, formerWornThemeKey, systemBasisKey] as const;

export type Remembered = (key: string) => string | undefined;

export function themeNamed(name: string): Theme | undefined {
  return gallery.find((theme) => theme.name === name);
}

export const keyworkNight: Theme = houseTheme("keywork-night");
export const keyworkDay: Theme = houseTheme("keywork-day");

export function rememberedTheme(remembered: Remembered, prefersDark: boolean): Theme {
  const choice = remembered(wornThemeKey) ?? remembered(formerWornThemeKey);
  const chosen = choice === undefined ? undefined : themeNamed(choice);
  return chosen ?? systemPairing(themeNamed, prefersDark, remembered(systemBasisKey));
}

export function systemPairing(
  named: (name: string) => Theme | undefined,
  prefersDark: boolean,
  basis: string | undefined,
): Theme {
  const wanted = prefersDark ? "dark" : "light";
  const pairing = basisPair(named, basis) ?? [keyworkNight, keyworkDay];
  return pairing.find((theme) => theme.appearance === wanted) ?? pairing[0];
}

function basisPair(
  named: (name: string) => Theme | undefined,
  basis: string | undefined,
): [Theme, Theme] | undefined {
  if (basis === undefined) return undefined;
  const theme = named(basis);
  const pair = theme?.pair === undefined ? undefined : named(theme.pair);
  return theme === undefined || pair === undefined ? undefined : [theme, pair];
}

function houseTheme(name: string): Theme {
  const theme = themeNamed(name);
  if (theme === undefined) throw new Error(`the synced gallery lost the house theme "${name}"`);
  return theme;
}
