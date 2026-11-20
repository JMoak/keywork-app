import type { MaterialProfile } from "../pose/skin.ts";
import type { Palette, PaletteSource } from "./palette.ts";

export function materialPalette(
  source: PaletteSource,
  profile: MaterialProfile,
  base: Palette,
): Palette {
  const paper = source.read(source.appearance === "dark" ? "--kw-text" : "--kw-background");
  const yellow = source.read("--kw-terminal-yellow");
  const green = source.read("--kw-success");
  const ochre = source.mix(yellow, source.read("--kw-terminal-red"), 0.12);
  const pigment = (name: string, fallback: string): string =>
    source.read(`--kw-art-${name}`).trim() || fallback;
  const ink = pigment(
    "ink",
    source.mix(source.read("--kw-terminal-black"), source.read("--kw-terminal-red"), 0.1),
  );
  const cream = pigment("cream", source.mix(paper, yellow, 0.14));
  const light = pigment("light", cream);
  const earth = pigment("clay", source.mix(ochre, paper, 0.3));
  const moss = pigment("moss", source.mix(green, yellow, 0.32));
  const olive = pigment("olive", source.mix(moss, paper, 0.12));
  const gold = pigment("ochre", ochre);
  const teal = pigment("teal", source.mix(source.read("--kw-terminal-cyan"), green, 0.22));
  const mark = source.mix(teal, base[2] ?? teal, 0.15);
  const sandstone = pigment("stone", source.mix(paper, ochre, 0.4));
  const profiles = {
    leaf: {
      primary: olive,
      secondary: cream,
      details: [source.mix(gold, cream, 0.25), mark, source.mix(mark, ink, 0.25)],
    },
    porcelain: {
      primary: cream,
      secondary: earth,
      details: [mark, source.mix(mark, ink, 0.2), gold],
    },
    sandstone: {
      primary: sandstone,
      secondary: source.mix(moss, base[2] ?? moss, 0.04),
      details: [light, gold, source.mix(moss, ink, 0.3)],
    },
  } satisfies Record<
    MaterialProfile,
    { primary: string; secondary: string; details: readonly string[] }
  >;
  const chosen = profiles[profile];
  return [
    base[0] ?? "transparent",
    ...ramp(source, chosen.primary, ink, light),
    ...ramp(
      source,
      chosen.secondary,
      ink,
      profile === "sandstone" ? source.mix(olive, gold, 0.25) : light,
    ),
    ink,
    base[10] ?? "transparent",
    base[11] ?? "transparent",
    base[12] ?? "transparent",
    ...chosen.details,
  ];
}

function ramp(
  source: PaletteSource,
  pigment: string,
  ink: string,
  light: string,
): readonly string[] {
  return [
    source.mix(pigment, ink, 0.42),
    source.mix(pigment, ink, 0.12),
    pigment,
    source.mix(pigment, light, 0.55),
  ];
}
