import type { FigureName } from "./figure-art.ts";
import { type RampStep, rampSteps } from "./palette.ts";
import type { ToolTier } from "./scene.ts";
import type { Role } from "./texture.ts";

export interface ToolArt {
  readonly raised: readonly string[];
  readonly struck: readonly string[];
}

export const toolMetals = ["wooden", "iron", "golden", "star-metal"] as const;

export const toolWidth = 7;
export const toolHeight = 8;

export function toolLegend(tier: ToolTier): Readonly<Record<string, Role>> {
  const metal = toolMetals[tier];
  return Object.fromEntries([
    ["o", "ink"],
    ...rampSteps.map((step: RampStep): [string, Role] => [step, `hue.${step}#${metal}`]),
  ]);
}

export const toolArts: Readonly<Record<FigureName, ToolArt>> = {
  cairn: lowered(["..oo..", ".ohlo.", "ohlbmo", "olbmdo", ".obmo.", "..oo.."], 2),
  tessera: lowered(["ooooo", "ohllo", "olbmo", "obmdo", "ooooo"], 3),
  folio: {
    raised: held([".ooo...", "ohllo..", "obbmo..", ".oobdo.", "...obdo", "....oo."], 0),
    struck: held(["....oo.", "...obdo", ".oobdo.", "ohllo..", "obbmo..", ".ooo..."], 2),
  },
  purl: {
    raised: held(["h.....l", ".l...b.", "..b.m..", "...m...", "..m.b..", ".d...m.", "d.....d"], 0),
    struck: held(["..h.l..", "..l.b..", "..b.m..", "..m.m..", "..m.d..", "..d.d.."], 1),
  },
  hush: {
    raised: held(["...oo..", "..ohlo.", ".olbo..", "..oo..."], 2),
    struck: held(
      ["....oo.", "...ohlo", "..olbo.", ".ohlo..", "olbo...", ".ombo..", "..omo..", "...o..."],
      0,
    ),
  },
  knot: {
    raised: held([".o...o.", "oho.oho", "olbmblo", "obo.obo", ".o...o."], 1),
    struck: held([".oo.oo.", ".ohmlo.", ".oo.oo."], 4),
  },
  beaver: {
    raised: held(["oo.oo..", "oh.lo..", "olbbo..", ".obmo..", "..obmo.", "...obdo", "....oo."], 0),
    struck: held(["....oo.", "...obdo", "..obmo.", ".obmo..", "olbbo..", "oh.lo..", "oo.oo.."], 1),
  },
  newfie: lowered(["....oo.", "...odo.", "..omo..", ".obo...", "oho....", "oo....."], 2),
  hippo: lowered(["oooooo", "ohllbo", "obmmdo", "oooooo"], 4),
};

function lowered(art: readonly string[], by: number): ToolArt {
  return { raised: held(art, 0), struck: held(art, by) };
}

function held(art: readonly string[], top: number): string[] {
  const empty = ".".repeat(toolWidth);
  return Array.from({ length: toolHeight }, (_, row) =>
    (art[row - top] ?? empty).padEnd(toolWidth, "."),
  );
}
