import type { Skin } from "../pose/skin.ts";
import { carterSkin } from "./carter/index.ts";
import { joinerSkin } from "./joiner/index.ts";
import { kidSkin } from "./kid/index.ts";
import { type LoadedSkin, loadSkin as loadFrom, type SkinSource } from "./loader.ts";
import { placeholderSkin } from "./placeholder.ts";

export const skins: Readonly<Record<string, SkinSource>> = {
  kid: () => kidSkin() as Skin,
  carter: () => carterSkin() as Skin,
  joiner: () => joinerSkin() as Skin,
  placeholder: placeholderSkin,
};

export const defaultSkinId = "kid";

export function loadSkin(
  id: string = defaultSkinId,
  sources: Readonly<Record<string, SkinSource>> = skins,
): LoadedSkin {
  return loadFrom(id, sources);
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
