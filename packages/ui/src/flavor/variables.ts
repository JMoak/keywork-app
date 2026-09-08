import { densityLevels, type Flavor } from "./schema.ts";

export type FlavorVariables = Readonly<Record<string, string>>;

export const fontVariables: FlavorVariables = {
  "--kw-font-mono": 'ui-monospace, "JetBrains Mono", "Cascadia Code", Consolas, monospace',
  "--kw-font-prose": '"Source Serif 4", "Newsreader", Georgia, "Times New Roman", serif',
};

export function flavorVariables(flavor: Flavor): FlavorVariables {
  const { tokens } = flavor;
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
        `var(${variableOfToken(flavor.density[level])})`,
      ]),
    ),
    "--kw-appearance": flavor.appearance,
    ...fontVariables,
  };
}

export function flavorStylesheet(flavor: Flavor): string {
  const lines = Object.entries(flavorVariables(flavor)).map(
    ([name, value]) => `  ${name}: ${value};`,
  );
  return `:root {\n${lines.join("\n")}\n}\n`;
}

export function applyFlavor(flavor: Flavor, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(flavorVariables(flavor))) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = flavor.appearance;
  root.dataset.flavor = flavor.name;
}

export function variablesOfStylesheet(css: string): FlavorVariables {
  return Object.fromEntries(
    [...css.matchAll(/(--kw-[a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name ?? "",
      (value ?? "").trim(),
    ]),
  );
}

const rampStopCount = 3;

function rampStops(ramp: readonly string[]): string[] {
  return Array.from(
    { length: rampStopCount },
    (_, index) => ramp[Math.min(index, ramp.length - 1)] ?? "",
  );
}

function variableOfToken(token: string): string {
  return `--kw-${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}
