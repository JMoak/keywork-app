import type { Theme } from "./schema.ts";
import { densityLevels, diffKeys, syntaxKeys, terminalKeys } from "./sections.ts";

export type ThemeVariables = Readonly<Record<string, string>>;

export const fontVariables: ThemeVariables = {
  "--kw-font-mono":
    '"JetBrains Mono", "Cascadia Code", Consolas, "DejaVu Sans Mono", Menlo, ui-monospace, monospace',
  "--kw-font-prose": '"Source Serif 4", "Newsreader", Georgia, "Times New Roman", serif',
};

export function themeVariables(theme: Theme): ThemeVariables {
  const { tokens } = theme;
  return {
    "--kw-background": tokens.background,
    "--kw-panel": tokens.panel,
    "--kw-panel-lift": tokens.panelLift,
    "--kw-text": tokens.text,
    "--kw-text-mid": tokens.textMid,
    "--kw-text-dim": tokens.textDim,
    "--kw-border": tokens.border,
    "--kw-border-focus": tokens.borderFocus,
    "--kw-accent": tokens.accent,
    "--kw-accent-soft": tokens.accentSoft,
    "--kw-success": tokens.success,
    "--kw-error": tokens.error,
    ...Object.fromEntries(
      rampStops(tokens.ramp).map((stop, index) => [`--kw-ramp-${index + 1}`, stop]),
    ),
    ...Object.fromEntries(
      densityLevels.map((level) => [
        `--kw-density-${level}`,
        `var(--kw-${kebab(theme.density[level])})`,
      ]),
    ),
    ...sectionVariables("terminal", terminalKeys, theme.terminal),
    ...sectionVariables("syntax", syntaxKeys, theme.syntax),
    ...sectionVariables("diff", diffKeys, theme.diff),
    "--kw-selection": theme.selection.background,
    "--kw-selection-text": theme.selection.text ?? tokens.text,
    "--kw-cursor": theme.cursor,
    "--kw-gap": String(theme.gap),
    "--kw-appearance": theme.appearance,
    ...fontVariables,
  };
}

export function themeStylesheet(theme: Theme): string {
  const lines = Object.entries(themeVariables(theme)).map(([name, value]) =>
    declaration(name, value),
  );
  return `:root {\n${lines.join("\n")}\n}\n`;
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(themeVariables(theme))) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = theme.appearance;
  Object.assign(root.dataset, themeAttributes(theme));
}

export function themeAttributes(theme: Theme): Readonly<Record<string, string>> {
  return {
    theme: theme.name,
    appearance: theme.appearance,
    chrome: theme.chromeWeight,
    instruments: theme.instruments,
    gap: String(theme.gap),
  };
}

export function variablesOfStylesheet(css: string): ThemeVariables {
  return Object.fromEntries(
    [...css.matchAll(/(--kw-[a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name ?? "",
      (value ?? "").trim(),
    ]),
  );
}

const stylesheetWidth = 100;

function declaration(name: string, value: string): string {
  const inline = `  ${name}: ${value};`;
  return inline.length <= stylesheetWidth ? inline : `  ${name}:\n    ${value};`;
}

const rampStopCount = 3;

function rampStops(ramp: readonly string[]): string[] {
  return Array.from(
    { length: rampStopCount },
    (_, index) => ramp[Math.min(index, ramp.length - 1)] ?? "",
  );
}

function sectionVariables<Key extends string>(
  section: string,
  keys: readonly Key[],
  colors: Readonly<Record<Key, string>>,
): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [`--kw-${section}-${kebab(key)}`, colors[key]]));
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
