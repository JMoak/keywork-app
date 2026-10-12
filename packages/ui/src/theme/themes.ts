import declared from "./gallery.json";
import { parseTheme, type Theme } from "./schema.ts";

export const gallery: readonly Theme[] = declared.themes.map((theme) => parseTheme(theme));

export function themeNamed(name: string): Theme | undefined {
  return gallery.find((theme) => theme.name === name);
}

export const keyworkNight: Theme = houseTheme("keywork-night");
export const keyworkDay: Theme = houseTheme("keywork-day");

function houseTheme(name: string): Theme {
  const theme = themeNamed(name);
  if (theme === undefined) throw new Error(`the synced gallery lost the house theme "${name}"`);
  return theme;
}
