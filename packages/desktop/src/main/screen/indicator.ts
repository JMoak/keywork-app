import { systemPairing, themeNamed } from "@keywork-app/ui/theme";
import type { IndicatorBanner } from "./sharer.ts";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface IndicatorPalette {
  readonly ground: string;
  readonly ink: string;
}

export interface IndicatorLayout {
  readonly edges: readonly Rect[];
  readonly banner: Rect;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface PlacedStrip {
  readonly bounds: Rect;
  readonly shape: Rect;
}

export interface IndicatorPalettes {
  readonly view: IndicatorPalette;
  readonly control: IndicatorPalette;
}

export const edgeThickness = 4;

export const bannerSize = { width: 560, height: 36 } as const;

export const stopUrl = "https://keywork.invalid/screen/stop";

export const resumeUrl = "https://keywork.invalid/screen/resume";

export interface IndicatorTheme {
  readonly tokens: { readonly error: string; readonly background: string };
  readonly terminal: { readonly yellow: string };
}

export function themedIndicatorPalettes(theme: IndicatorTheme): IndicatorPalettes {
  return {
    view: { ground: theme.terminal.yellow, ink: theme.tokens.background },
    control: { ground: theme.tokens.error, ink: theme.tokens.background },
  };
}

export interface KeeperThemeSource {
  readonly worn: () => string | undefined;
  readonly prefersDark: () => boolean;
  readonly fallback?: IndicatorPalettes | undefined;
}

export function keeperIndicatorPalettes(source: KeeperThemeSource): IndicatorPalettes {
  const name = source.worn();
  if (name === undefined && source.fallback !== undefined) return source.fallback;
  const worn = name === undefined ? undefined : themeNamed(name);
  const theme = worn ?? systemPairing(themeNamed, source.prefersDark(), undefined);
  return themedIndicatorPalettes(theme);
}

export interface WornThemeSlot {
  readonly worn: () => string | undefined;
  wear(name: unknown): void;
}

export function wornThemeSlot(): WornThemeSlot {
  let worn: string | undefined;
  return {
    worn: () => worn,
    wear: (name) => {
      if (typeof name === "string" && name !== "") worn = name;
    },
  };
}

export function paletteFor(banner: IndicatorBanner, palettes: IndicatorPalettes): IndicatorPalette {
  return banner.mode === "control" ? palettes.control : palettes.view;
}

export function indicatorLayout(area: Rect, scaleFactor = 1): IndicatorLayout {
  const { x, y, width, height } = wholePixelArea(area, scaleFactor);
  const edge = edgeThickness;
  const bannerWidth = Math.min(bannerSize.width, width);
  return {
    edges: [
      { x, y, width, height: edge },
      { x, y: y + height - edge, width, height: edge },
      { x, y: y + edge, width: edge, height: height - 2 * edge },
      { x: x + width - edge, y: y + edge, width: edge, height: height - 2 * edge },
    ],
    banner: {
      x: x + Math.round((width - bannerWidth) / 2),
      y: y + edge,
      width: bannerWidth,
      height: bannerSize.height,
    },
  };
}

export function wholePixelArea(area: Rect, scaleFactor: number): Rect {
  return {
    x: area.x,
    y: area.y,
    width: wholeDips(area.width, scaleFactor),
    height: wholeDips(area.height, scaleFactor),
  };
}

// Windows grows a window narrower or shorter than its minimum track size (about 30 DIP) to that
// size whatever the frame options, so a strip keeps its window inside the area and paints only
// its own rect through the window's shape.
export function placedStrip(strip: Rect, granted: Size, area: Rect): PlacedStrip {
  const width = Math.max(strip.width, granted.width);
  const height = Math.max(strip.height, granted.height);
  const x = Math.max(area.x, Math.min(strip.x, area.x + area.width - width));
  const y = Math.max(area.y, Math.min(strip.y, area.y + area.height - height));
  return {
    bounds: { x, y, width, height },
    shape: { x: strip.x - x, y: strip.y - y, width: strip.width, height: strip.height },
  };
}

export interface OverlayWindowPlan {
  readonly level: "screen-saver";
  readonly excludedFromCapture: true;
  readonly clickThrough: boolean;
  readonly focusable: false;
  readonly visibleOnFullScreen: boolean;
}

export function overlayWindowPlan(
  part: "edge" | "banner",
  platform: NodeJS.Platform,
): OverlayWindowPlan {
  return {
    level: "screen-saver",
    excludedFromCapture: true,
    clickThrough: part === "edge",
    focusable: false,
    visibleOnFullScreen: platform === "darwin",
  };
}

export function bannerLine(banner: IndicatorBanner): string {
  const stop =
    banner.shortcut === undefined ? "Stop ends it" : `Stop or ${banner.shortcut} ends it`;
  return `${whoLine(banner)} · ${stop}`;
}

export function bannerPage(banner: IndicatorBanner, palette: IndicatorPalette): string {
  const resume = banner.paused === true ? `<a href="${resumeUrl}">Resume</a>` : "";
  return page(
    palette,
    `<main><span>${escapeHtml(bannerLine(banner))}</span><nav>${resume}<a href="${stopUrl}">Stop</a></nav></main>`,
    [
      "nav{display:flex;gap:12px}",
      "main{display:flex;align-items:center;justify-content:space-between;gap:12px;height:100vh;padding:0 12px;box-sizing:border-box}",
      "span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "a{color:inherit;font-weight:700;text-decoration:underline;cursor:pointer}",
    ],
  );
}

export function edgePage(palette: IndicatorPalette, agent = false): string {
  return page(
    palette,
    "",
    agent
      ? [
          `body{background:repeating-linear-gradient(45deg,${palette.ground} 0 6px,${palette.ink} 6px 12px)}`,
        ]
      : [],
  );
}

export function isStopNavigation(url: string): boolean {
  return url === stopUrl;
}

export function isResumeNavigation(url: string): boolean {
  return url === resumeUrl;
}

function whoLine(banner: IndicatorBanner): string {
  const who = banner.controller === "agent" ? `agent ${banner.who}` : banner.who;
  if (banner.mode === "view") return `${who} is viewing this screen`;
  if (banner.paused === true) return `${who}'s control is paused while you use this machine`;
  return `${who} is controlling this screen`;
}

export function dataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function page(palette: IndicatorPalette, body: string, rules: readonly string[]): string {
  const css = [
    `html,body{margin:0;height:100%;background:${palette.ground};color:${palette.ink};font:13px system-ui,sans-serif;overflow:hidden;user-select:none}`,
    ...rules,
  ].join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>${css}</style></head><body>${body}</body></html>`;
}

const pixelSlack = 1e-3;

function wholeDips(length: number, scaleFactor: number): number {
  const pixels = Math.floor(length * scaleFactor + pixelSlack);
  return Math.floor(pixels / scaleFactor + pixelSlack);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}
