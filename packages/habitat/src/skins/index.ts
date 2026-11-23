import { artSkin, type CreatureArt, type CreatureId, creatureIds } from "./art.ts";
import { beaverArt } from "./beaver/art.ts";
import { cairnArt } from "./cairn/art.ts";
import { folioArt } from "./folio/art.ts";
import { hippoArt } from "./hippo/art.ts";
import { hushArt } from "./hush/art.ts";
import { knotArt } from "./knot/art.ts";
import {
  type LoadedSkin,
  type LoadedSkinOk,
  loadSkin as loadFrom,
  type SkinSource,
} from "./loader.ts";
import { newfieArt } from "./newfie/art.ts";
import { placeholderSkin } from "./placeholder.ts";
import { purlArt } from "./purl/art.ts";
import { tesseraArt } from "./tessera/art.ts";

export const creatureArts: Readonly<Record<CreatureId, CreatureArt>> = {
  cairn: cairnArt,
  tessera: tesseraArt,
  folio: folioArt,
  purl: purlArt,
  hush: hushArt,
  knot: knotArt,
  beaver: beaverArt,
  newfie: newfieArt,
  hippo: hippoArt,
};

export const skins: Readonly<Record<string, SkinSource>> = {
  ...Object.fromEntries(
    creatureIds.map((id): [string, SkinSource] => [id, () => artSkin(creatureArts[id])]),
  ),
  placeholder: placeholderSkin,
};

export const defaultSkinId = "cairn";

export function resolveSkinId(id: string | undefined, seed: number): string {
  if (isCreatureId(id)) return id;
  return creatureIds[(seed >>> 0) % creatureIds.length] ?? defaultSkinId;
}

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

function isCreatureId(id: string | undefined): id is CreatureId {
  return (creatureIds as readonly (string | undefined)[]).includes(id);
}

export {
  type ArtFrame,
  artSkin,
  type CreatureArt,
  type CreatureId,
  creatureIds,
  decodeFrame,
} from "./art.ts";
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
export { type Clip, gazeTurns, sheetBeatMs, sheetClips, turnBeatMs } from "./clips.ts";
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
  coatBase,
  coatDeep,
  coatHighlight,
  coatLight,
  coatShade,
  creatureGlyphs,
  creatureInk,
  dim,
  firstFixed,
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
  paper,
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
