import type { Skin } from "@keywork-app/habitat";
import {
  createRenderer,
  type Palette,
  type PaletteSource,
  resolvePalette,
  tokensRead,
} from "@keywork-app/habitat/render";
import { defaultSkinId, loadSkin } from "@keywork-app/habitat/skins";
import { paletteSourceOf, surfaceOf } from "../panes/stead/painter.ts";
import type { Renderer } from "./renderer.ts";

export function skinnedRenderer(skin: Skin, source: () => PaletteSource): Renderer {
  const render = createRenderer(skin);
  const coats = new Map<string, Palette>();
  const renderer: Renderer = (pose, _tokens, prefs) => {
    const palette = coatFor(coats, source(), prefs.hueStop, prefs.forcedColors === true);
    const frame = render(pose, palette, { scale: prefs.deviceScale });
    return {
      width: frame.width,
      height: frame.height,
      alpha: frame.alpha,
      paint: (context) => {
        context.clearRect(0, 0, frame.width, frame.height);
        frame.paint(surfaceOf(context));
      },
    };
  };
  return Object.assign(renderer, { rows: skin.rows });
}

export function companionRenderer(skinId = defaultSkinId): Renderer | undefined {
  const loaded = loadSkin(skinId);
  if (!loaded.ok) return undefined;
  return skinnedRenderer(loaded.skin, () => paletteSourceOf(document.documentElement));
}

function coatFor(
  coats: Map<string, Palette>,
  source: PaletteSource,
  hueStop: number | undefined,
  forcedColors: boolean,
): Palette {
  const key = forcedColors
    ? "forced"
    : [source.appearance, hueStop ?? "accent", ...tokensRead.map((name) => source.read(name))].join(
        "|",
      );
  const known = coats.get(key);
  if (known !== undefined) return known;
  const coat = resolvePalette(source, { hueStop, forcedColors });
  coats.set(key, coat);
  return coat;
}
