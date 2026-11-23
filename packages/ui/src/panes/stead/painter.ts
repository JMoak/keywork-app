import type { Season, SkyPhase } from "@keywork-app/habitat";
import { prefersReducedMotion } from "../../chrome/stamp.ts";
import {
  followMedia,
  inWindowOf,
  mediaMatches,
  observeSize,
  pixelRatioOf,
  styleOf,
} from "../../surfaces/runtime/realm.ts";
import { keyworkNight, themeVariables } from "../../theme/index.ts";
import { mixOklab } from "../../theme/oklab.ts";
import {
  type PaintSurface,
  type Palette,
  type PaletteSource,
  resolveGlyphPalette,
  resolvePalette,
  resolveSky,
  type SteadPainting,
  tokensRead,
} from "./habitat-render.ts";

export interface Palettes {
  readonly key: string;
  readonly world: Palette;
  readonly glyphs: SteadPainting["glyphs"];
  readonly sky: SteadPainting["sky"];
  coat(hueStop: number): Palette;
}

export const forcedColorsQuery = "(forced-colors: active)";
export const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

export function paletteSourceOf(
  element: Element,
  fallback: Readonly<Record<string, string>> = themeVariables(keyworkNight),
): PaletteSource {
  const style = styleOf(element);
  const applied = style.getPropertyValue("--kw-background").trim() !== "";
  const read = (name: string): string =>
    applied ? style.getPropertyValue(name).trim() : (fallback[name] ?? "");
  return {
    read,
    mix: mixOklab,
    appearance: read("--kw-appearance") === "light" ? "light" : "dark",
  };
}

export function palettesOf(
  source: PaletteSource,
  phase: SkyPhase,
  season: Season | undefined,
  forcedColors: boolean,
  previous: Palettes | undefined,
): Palettes {
  const key = [
    forcedColors ? "forced" : source.appearance,
    phase,
    season ?? "",
    ...tokensRead.map((name) => (forcedColors ? "" : source.read(name))),
  ].join("|");
  if (previous !== undefined && previous.key === key) return previous;
  const coats = new Map<number, Palette>();
  return {
    key,
    world: resolvePalette(source, { world: true, season, forcedColors }),
    glyphs: resolveGlyphPalette(source, forcedColors),
    sky: resolveSky(source, phase, forcedColors),
    coat: (hueStop) => {
      const known = coats.get(hueStop);
      if (known !== undefined) return known;
      const coat = resolvePalette(source, { hueStop, season, forcedColors });
      coats.set(hueStop, coat);
      return coat;
    },
  };
}

export function forcedColorsActive(anchor?: Node): boolean {
  return typeof document !== "undefined" && mediaMatches(anchor ?? document, forcedColorsQuery);
}

export function reducedMotionActive(): boolean {
  return prefersReducedMotion();
}

export function devicePixelRatioOf(anchor?: Node): number {
  return typeof document === "undefined" ? 1 : pixelRatioOf(anchor ?? document);
}

export function surfaceOf(context: CanvasRenderingContext2D): PaintSurface {
  return {
    get fillStyle() {
      return String(context.fillStyle);
    },
    set fillStyle(color: string) {
      context.fillStyle = color;
    },
    fillRect: (x, y, width, height) => context.fillRect(x, y, width, height),
    clearRect: (x, y, width, height) => context.clearRect(x, y, width, height),
  };
}

export function watchMedia(query: string, react: () => void, anchor?: Node): () => void {
  if (typeof document === "undefined") return () => undefined;
  return followMedia(anchor ?? document, query, react);
}

export function watchTheme(react: () => void, anchor?: Node): () => void {
  if (typeof document === "undefined") return () => undefined;
  return inWindowOf(anchor ?? document, (realm) => {
    if (typeof realm.MutationObserver !== "function") return () => undefined;
    const observer = new realm.MutationObserver(() => react());
    observer.observe(realm.document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-appearance", "style", "class"],
    });
    return () => observer.disconnect();
  });
}

export function watchSize(element: Element, react: () => void): () => void {
  return observeSize(element, () => react());
}
