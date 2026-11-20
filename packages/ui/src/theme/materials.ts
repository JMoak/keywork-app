import { mixOklab } from "./oklab.ts";
import type { Theme } from "./schema.ts";

const pigments = {
  cream: "#f6e3b8",
  olive: "#858940",
  moss: "#68753a",
  teal: "#388a85",
  ochre: "#cf9b51",
  clay: "#bc926a",
  ink: "#48313d",
  stone: "#d6ae78",
  light: "#fff0cc",
} as const;

export function materialVariables(theme: Theme): Readonly<Record<string, string>> {
  const atmosphere = theme.appearance === "dark" ? 0.06 : 0.025;
  return Object.fromEntries(
    Object.entries(pigments).map(([name, color]) => [
      `--kw-art-${name}`,
      mixOklab(color, theme.tokens.background, atmosphere),
    ]),
  );
}
