import type { ITheme } from "@xterm/xterm";

export type TerminalSlot = keyof ITheme;

export const themeVariables: Readonly<Record<TerminalSlot, string>> = {
  background: "--kw-panel",
  foreground: "--kw-text",
  cursor: "--kw-accent",
  cursorAccent: "--kw-panel",
  selectionBackground: "--kw-accent-soft",
  selectionForeground: "--kw-background",
  selectionInactiveBackground: "--kw-panel-lift",
  scrollbarSliderBackground: "--kw-border",
  scrollbarSliderHoverBackground: "--kw-text-dim",
  scrollbarSliderActiveBackground: "--kw-text-mid",
  overviewRulerBorder: "--kw-border",
  black: "--kw-background",
  red: "--kw-error",
  green: "--kw-success",
  yellow: "--kw-accent-soft",
  blue: "--kw-ramp-2",
  magenta: "--kw-accent",
  cyan: "--kw-ramp-3",
  white: "--kw-text-mid",
  brightBlack: "--kw-text-dim",
  brightRed: "--kw-error",
  brightGreen: "--kw-success",
  brightYellow: "--kw-accent",
  brightBlue: "--kw-ramp-1",
  brightMagenta: "--kw-ramp-1",
  brightCyan: "--kw-ramp-3",
  brightWhite: "--kw-text",
  extendedAnsi: "",
};

export function terminalTheme(read: (variable: string) => string): ITheme {
  const theme: Record<string, string> = {};
  for (const [slot, variable] of Object.entries(themeVariables)) {
    if (variable === "") continue;
    const value = read(variable).trim();
    if (value !== "") theme[slot] = value;
  }
  return theme as ITheme;
}

export function themeOfElement(element: Element): ITheme {
  const style = getComputedStyle(element);
  return terminalTheme((variable) => style.getPropertyValue(variable));
}

export function monoFontOf(element: Element): { family: string; size: number } {
  const style = getComputedStyle(element);
  const family = style.getPropertyValue("--kw-font-mono").trim();
  const size = Number.parseFloat(style.fontSize);
  return {
    family: family === "" ? "monospace" : family,
    size: Number.isFinite(size) && size > 0 ? size : fallbackFontSize,
  };
}

export function watchFlavor(root: HTMLElement, onChange: () => void): () => void {
  if (typeof MutationObserver !== "function") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ["style", "data-flavor"] });
  return () => observer.disconnect();
}

const fallbackFontSize = 13;
