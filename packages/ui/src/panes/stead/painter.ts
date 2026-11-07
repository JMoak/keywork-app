import type { Season, SkyPhase } from "@keywork-app/habitat";
import { prefersReducedMotion } from "../../chrome/stamp.ts";
import { keyworkNight, themeVariables } from "../../theme/index.ts";
import { mixOklab } from "../../theme/oklab.ts";
import {
  type PaintSurface,
  type Palette,
  type PaletteSource,
  paintedHeight,
  paintStead,
  resolveGlyphPalette,
  resolvePalette,
  resolveSky,
  type SteadPainting,
  type SteadScene,
  samePainting,
  scaleFor,
  tokensRead,
} from "./habitat-render.ts";

export interface CanvasFit {
  readonly scale: number;
  readonly dpr: number;
  readonly artWidth: number;
  readonly artHeight: number;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly cssPerArt: number;
}

export type CanvasPainter = (
  canvas: HTMLCanvasElement,
  painting: SteadPainting,
  fit: CanvasFit,
) => boolean;

export interface Palettes {
  readonly key: string;
  readonly world: Palette;
  readonly glyphs: SteadPainting["glyphs"];
  readonly sky: SteadPainting["sky"];
  coat(hueStop: number): Palette;
}

export const fallbackStageWidth = 640;
export const forcedColorsQuery = "(forced-colors: active)";
export const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

export function paletteSourceOf(
  element: Element,
  fallback: Readonly<Record<string, string>> = themeVariables(keyworkNight),
): PaletteSource {
  const style = getComputedStyle(element);
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

export function forcedColorsActive(): boolean {
  return mediaMatches(forcedColorsQuery);
}

export function reducedMotionActive(): boolean {
  return prefersReducedMotion();
}

export function devicePixelRatioOf(): number {
  const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

export function fitCanvas(cssWidth: number, scene: SteadScene, dpr: number): CanvasFit {
  const width = cssWidth > 0 ? cssWidth : fallbackStageWidth;
  const scale = scaleFor(dpr);
  const artWidth = Math.max(scene.width, Math.floor((width * dpr) / scale));
  const artHeight = paintedHeight(scene);
  const cssPerArt = scale / dpr;
  return {
    scale,
    dpr,
    artWidth,
    artHeight,
    cssWidth: artWidth * cssPerArt,
    cssHeight: artHeight * cssPerArt,
    cssPerArt,
  };
}

export function paintCanvas(
  canvas: HTMLCanvasElement,
  painting: SteadPainting,
  fit: CanvasFit,
): boolean {
  const deviceWidth = fit.artWidth * fit.scale;
  const deviceHeight = fit.artHeight * fit.scale;
  if (canvas.width !== deviceWidth) canvas.width = deviceWidth;
  if (canvas.height !== deviceHeight) canvas.height = deviceHeight;
  canvas.style.width = `${fit.cssWidth}px`;
  canvas.style.height = `${fit.cssHeight}px`;
  const context = canvas.getContext("2d");
  if (context === null) return false;
  context.imageSmoothingEnabled = false;
  paintStead(surfaceOf(context), painting);
  return true;
}

export function paintWhenChanged(paint: CanvasPainter = paintCanvas): CanvasPainter {
  let shown: { canvas: HTMLCanvasElement; painting: SteadPainting; fit: CanvasFit } | undefined;
  return (canvas, painting, fit) => {
    if (
      shown !== undefined &&
      shown.canvas === canvas &&
      sameFit(shown.fit, fit) &&
      samePainting(shown.painting, painting)
    ) {
      return false;
    }
    const painted = paint(canvas, painting, fit);
    shown = painted ? { canvas, painting, fit } : undefined;
    return painted;
  };
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

export function watchMedia(query: string, react: () => void): () => void {
  if (typeof matchMedia !== "function") return () => undefined;
  const list = matchMedia(query);
  if (typeof list.addEventListener !== "function") return () => undefined;
  list.addEventListener("change", react);
  return () => list.removeEventListener("change", react);
}

export function watchTheme(react: () => void): () => void {
  if (typeof MutationObserver !== "function" || typeof document === "undefined") {
    return () => undefined;
  }
  const observer = new MutationObserver(() => react());
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-appearance", "style", "class"],
  });
  return () => observer.disconnect();
}

export function watchSize(element: Element, react: () => void): () => void {
  if (typeof ResizeObserver !== "function") return () => undefined;
  const observer = new ResizeObserver(() => react());
  observer.observe(element);
  return () => observer.disconnect();
}

function sameFit(a: CanvasFit, b: CanvasFit): boolean {
  return (
    a.scale === b.scale &&
    a.dpr === b.dpr &&
    a.artWidth === b.artWidth &&
    a.artHeight === b.artHeight &&
    a.cssWidth === b.cssWidth &&
    a.cssHeight === b.cssHeight
  );
}

function mediaMatches(query: string): boolean {
  return typeof matchMedia === "function" && matchMedia(query).matches;
}
