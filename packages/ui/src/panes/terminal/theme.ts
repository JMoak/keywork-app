import type { ITheme } from "@xterm/xterm";

export type TerminalSlot = keyof ITheme;

export const themeVariables: Readonly<Record<TerminalSlot, string>> = {
  background: "--kw-panel",
  foreground: "--kw-text",
  cursor: "--kw-cursor",
  cursorAccent: "--kw-panel",
  selectionBackground: "--kw-selection",
  selectionForeground: "--kw-selection-text",
  selectionInactiveBackground: "--kw-panel-lift",
  scrollbarSliderBackground: "--kw-border",
  scrollbarSliderHoverBackground: "--kw-text-dim",
  scrollbarSliderActiveBackground: "--kw-text-mid",
  overviewRulerBorder: "--kw-border",
  black: "--kw-terminal-black",
  red: "--kw-terminal-red",
  green: "--kw-terminal-green",
  yellow: "--kw-terminal-yellow",
  blue: "--kw-terminal-blue",
  magenta: "--kw-terminal-magenta",
  cyan: "--kw-terminal-cyan",
  white: "--kw-terminal-white",
  brightBlack: "--kw-terminal-bright-black",
  brightRed: "--kw-terminal-bright-red",
  brightGreen: "--kw-terminal-bright-green",
  brightYellow: "--kw-terminal-bright-yellow",
  brightBlue: "--kw-terminal-bright-blue",
  brightMagenta: "--kw-terminal-bright-magenta",
  brightCyan: "--kw-terminal-bright-cyan",
  brightWhite: "--kw-terminal-bright-white",
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

export function watchTheme(root: HTMLElement, onChange: () => void): () => void {
  if (typeof MutationObserver !== "function") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ["style", "data-theme"] });
  return () => observer.disconnect();
}

export type FontFaces = Pick<FontFaceSet, "addEventListener" | "removeEventListener"> & {
  readonly ready: Promise<unknown>;
};

export function watchFonts(
  onSettled: () => void,
  fonts: FontFaces | undefined = typeof document === "object" ? document.fonts : undefined,
): () => void {
  if (fonts === undefined) return () => {};
  let live = true;
  const settled = (): void => {
    if (live) onSettled();
  };
  void fonts.ready.then(settled);
  fonts.addEventListener("loadingdone", settled);
  return () => {
    live = false;
    fonts.removeEventListener("loadingdone", settled);
  };
}

const fallbackFontSize = 13;
