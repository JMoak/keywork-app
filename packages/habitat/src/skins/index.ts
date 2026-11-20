import type { Skin } from "../pose/skin.ts";
import { cairnSkin } from "./cairn/index.ts";
import { carterSkin } from "./carter/index.ts";
import { folioSkin } from "./folio/index.ts";
import { joinerSkin } from "./joiner/index.ts";
import { kidSkin } from "./kid/index.ts";
import {
  type LoadedSkin,
  type LoadedSkinOk,
  loadSkin as loadFrom,
  type SkinSource,
} from "./loader.ts";
import { placeholderSkin } from "./placeholder.ts";
import { tesseraSkin } from "./tessera/index.ts";

export const skins: Readonly<Record<string, SkinSource>> = {
  kid: () => kidSkin() as Skin,
  carter: () => carterSkin() as Skin,
  joiner: () => joinerSkin() as Skin,
  tessera: tesseraSkin,
  cairn: cairnSkin,
  folio: folioSkin,
  placeholder: placeholderSkin,
};

export const defaultSkinId = "kid";

export function loadSkin(
  id: string = defaultSkinId,
  sources: Readonly<Record<string, SkinSource>> = skins,
): LoadedSkin {
  if (sources !== skins) return loadFrom(id, sources);
  const shipped = builtInSources.get(id);
  if (shipped === undefined || sources[id] !== shipped) {
    builtInSkins.delete(id);
    return loadFrom(id, sources);
  }
  const known = builtInSkins.get(id);
  if (known !== undefined) return known;
  const loaded = loadFrom(id, sources);
  if (loaded.ok) builtInSkins.set(id, loaded);
  return loaded;
}

export function skinIds(): string[] {
  return Object.keys(skins);
}

export {
  assembleAtlas,
  clearSliceCache,
  contentHash,
  type IndexedFrame,
  lowestOpaqueRow,
  mirrorFrame,
  opaqueCount,
  type SlicedSkin,
  skinHash,
  sliceCacheSize,
  sliceSkin,
} from "./atlas.ts";
export {
  type BorrowedPose,
  borrowedRows,
  type CodexManifest,
  type CodexRow,
  type CodexRowTiming,
  codexRowMap,
  codexRows,
  importCodexAtlas,
} from "./codex.ts";
export {
  bitmapFromRows,
  creatureGlyphs,
  dim,
  fog,
  glass,
  groundBase,
  groundHighlight,
  groundLight,
  groundShadow,
  hexGlyphs,
  identityBase,
  identityHighlight,
  identityLight,
  identityShadow,
  indexOfGlyph,
  lamplight,
  needsYou,
  outline,
  rowsFromBitmap,
  transparent,
  trouble,
  worldGlyphs,
} from "./legend.ts";
export {
  groundContact,
  type LoadedSkin,
  type LoadedSkinOk,
  type LoadedSkinRefused,
  outlineSeals,
  type SkinSource,
  validateAtlas,
} from "./loader.ts";
export { placeholderAirborne, placeholderGroundLine, placeholderSkin } from "./placeholder.ts";
export type { Tile } from "./world/tiles.ts";
export * as tiles from "./world/tiles.ts";

const builtInSources = new Map(Object.entries(skins));
const builtInSkins = new Map<string, LoadedSkinOk>();
