import type { Season, SkyPhase } from "../world/sky.ts";

export type Palette = readonly string[];

export type Appearance = "dark" | "light";

export interface PaletteSource {
  read(name: string): string;
  mix(from: string, toward: string, amount: number): string;
  readonly appearance: Appearance;
}

export interface PaletteOptions {
  readonly hueStop?: number | undefined;
  readonly season?: Season | undefined;
  readonly world?: boolean | undefined;
  readonly forcedColors?: boolean | undefined;
}

export interface PaletteRole {
  readonly index: number;
  readonly role: string;
}

export const paletteRoles: readonly PaletteRole[] = [
  { index: 0, role: "transparent" },
  { index: 1, role: "identity shadow" },
  { index: 2, role: "identity base" },
  { index: 3, role: "identity light" },
  { index: 4, role: "identity highlight" },
  { index: 5, role: "ground shadow" },
  { index: 6, role: "ground base" },
  { index: 7, role: "ground light" },
  { index: 8, role: "ground highlight" },
  { index: 9, role: "outline" },
  { index: 10, role: "lamplight" },
  { index: 11, role: "needs-you" },
  { index: 12, role: "trouble" },
  { index: 13, role: "glass" },
  { index: 14, role: "fog" },
  { index: 15, role: "dim" },
];

export const transparentColor = "transparent";

export const tokensRead: readonly string[] = [
  "--kw-terminal-black",
  "--kw-text",
  "--kw-background",
  "--kw-accent",
  "--kw-panel-lift",
  "--kw-success",
  "--kw-terminal-yellow",
  "--kw-error",
  "--kw-panel",
  "--kw-text-faint",
  "--kw-text-dim",
  "--kw-border",
  "--kw-terminal-cyan",
  "--kw-terminal-red",
];

export const identityShadowShare = 0.35;
export const identityLightShare = 0.3;
export const identityHighlightShare = 0.65;
export const groundShadowShare = 0.3;
export const groundLightShare = 0.2;
export const groundHighlightShare = 0.45;
export const groundGreenShare = 0.15;
export const seasonShare = 0.2;
export const timberShare = 0.2;

export function resolvePalette(source: PaletteSource, options: PaletteOptions = {}): Palette {
  if (options.forcedColors === true) return forcedPalette;
  const ink = source.read("--kw-terminal-black");
  const paper = source.read(source.appearance === "dark" ? "--kw-text" : "--kw-background");
  const identity = options.world === true ? timber(source) : coat(source, options.hueStop);
  const towardLight = sameColor(identity, paper) ? ink : paper;
  const towardDark = sameColor(identity, ink) ? paper : ink;
  const ground = seasoned(
    source,
    source.mix(source.read("--kw-panel-lift"), source.read("--kw-success"), groundGreenShare),
    options.season,
    paper,
  );
  return [
    transparentColor,
    source.mix(identity, towardDark, identityShadowShare),
    identity,
    source.mix(identity, towardLight, identityLightShare),
    source.mix(identity, towardLight, identityHighlightShare),
    source.mix(ground, ink, groundShadowShare),
    ground,
    source.mix(ground, paper, groundLightShare),
    source.mix(ground, paper, groundHighlightShare),
    ink,
    source.read("--kw-terminal-yellow"),
    source.read("--kw-accent"),
    source.read("--kw-error"),
    source.read("--kw-panel"),
    source.read("--kw-text-faint"),
    source.read("--kw-text-dim"),
  ];
}

export const forcedPalette: Palette = [
  transparentColor,
  "Canvas",
  "Canvas",
  "Canvas",
  "Canvas",
  "Canvas",
  "Canvas",
  "Canvas",
  "Canvas",
  "CanvasText",
  "Highlight",
  "Highlight",
  "CanvasText",
  "Canvas",
  "GrayText",
  "GrayText",
];

export interface SkyColors {
  readonly zenith: string;
  readonly horizon: string;
}

export const skyShares = {
  dayHorizon: 0.15,
  duskZenith: 0.15,
  duskHorizon: 0.3,
  nightZenith: 0.35,
  nightHorizon: 0.15,
  dawnZenith: 0.2,
  dawnHorizon: 0.25,
} as const;

export const forcedSky: SkyColors = { zenith: "Canvas", horizon: "Canvas" };

export function resolveSky(
  source: PaletteSource,
  phase: SkyPhase,
  forcedColors = false,
): SkyColors {
  if (forcedColors) return forcedSky;
  const background = source.read("--kw-background");
  const ink = source.read("--kw-terminal-black");
  switch (phase) {
    case "day":
      return {
        zenith: background,
        horizon: source.mix(background, source.read("--kw-terminal-cyan"), skyShares.dayHorizon),
      };
    case "dusk":
      return {
        zenith: source.mix(background, ink, skyShares.duskZenith),
        horizon: source.mix(background, source.read("--kw-terminal-yellow"), skyShares.duskHorizon),
      };
    case "night":
      return {
        zenith: source.mix(background, ink, skyShares.nightZenith),
        horizon: source.mix(background, ink, skyShares.nightHorizon),
      };
    case "dawn":
      return {
        zenith: source.mix(background, ink, skyShares.dawnZenith),
        horizon: source.mix(background, source.read("--kw-terminal-red"), skyShares.dawnHorizon),
      };
  }
}

export type GlyphPalette = readonly [string, string, string, string, string, string, string];

export const glyphRoles = [
  "transparent",
  "outline",
  "fill",
  "needs-you",
  "success",
  "trouble",
  "dim",
] as const;

export function resolveGlyphPalette(source: PaletteSource, forcedColors = false): GlyphPalette {
  if (forcedColors) {
    return [
      transparentColor,
      "CanvasText",
      "Canvas",
      "Highlight",
      "Highlight",
      "CanvasText",
      "GrayText",
    ];
  }
  return [
    transparentColor,
    source.read("--kw-terminal-black"),
    source.read(source.appearance === "dark" ? "--kw-text" : "--kw-background"),
    source.read("--kw-accent"),
    source.read("--kw-success"),
    source.read("--kw-error"),
    source.read("--kw-text-dim"),
  ];
}

export function paletteKey(palette: Palette): string {
  return palette.join("|");
}

export function unresolvedRoles(palette: Palette): PaletteRole[] {
  return paletteRoles.filter((role) => {
    const color = palette[role.index];
    return role.index !== 0 && (color === undefined || color.trim() === "");
  });
}

function sameColor(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function coat(source: PaletteSource, hueStop: number | undefined): string {
  return hueStop === undefined ? source.read("--kw-accent") : source.read(`--kw-ramp-${hueStop}`);
}

function timber(source: PaletteSource): string {
  return source.mix(source.read("--kw-border"), source.read("--kw-terminal-yellow"), timberShare);
}

function seasoned(
  source: PaletteSource,
  ground: string,
  season: Season | undefined,
  paper: string,
): string {
  switch (season) {
    case "spring":
    case "summer":
      return source.mix(ground, source.read("--kw-success"), seasonShare);
    case "autumn":
      return source.mix(ground, source.read("--kw-terminal-yellow"), seasonShare);
    case "winter":
      return source.mix(ground, paper, seasonShare);
    case undefined:
      return ground;
  }
}
