import { type Theme, themeVariables } from "../../theme/index.ts";
import { mixOklab } from "../../theme/oklab.ts";
import type { PaletteSource } from "./habitat-render.ts";

export function sourceOfTheme(theme: Theme): PaletteSource {
  const variables = themeVariables(theme);
  return {
    read: (name) => variables[name] ?? "",
    mix: mixOklab,
    appearance: theme.appearance,
  };
}
