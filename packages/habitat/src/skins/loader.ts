import { type PoseName, poseNames, type Skin, validateSkin } from "../pose/skin.ts";
import { type IndexedFrame, lowestOpaqueRow, type SlicedSkin, sliceSkin } from "./atlas.ts";
import { transparent } from "./legend.ts";

export type SkinSource = () => Skin;

export type LoadedSkin = LoadedSkinOk | LoadedSkinRefused;

export interface LoadedSkinOk {
  readonly ok: true;
  readonly id: string;
  readonly skin: Skin;
  readonly sliced: SlicedSkin;
}

export interface LoadedSkinRefused {
  readonly ok: false;
  readonly id: string;
  readonly faults: readonly string[];
}

export function loadSkin(id: string, sources: Readonly<Record<string, SkinSource>>): LoadedSkin {
  const source = sources[id];
  if (source === undefined) return { ok: false, id, faults: [`no skin is registered as "${id}"`] };
  const built = build(source);
  if (typeof built === "string") return { ok: false, id, faults: [built] };
  if (built.id !== id)
    return { ok: false, id, faults: [`skin "${id}" calls itself "${built.id}"`] };
  const faults = validateAtlas(built);
  if (faults.length > 0) return { ok: false, id, faults };
  return { ok: true, id, skin: built, sliced: sliceSkin(built) };
}

export function validateAtlas(skin: Skin): string[] {
  const faults = shapeFaults(skin);
  if (faults.length > 0) return faults;
  faults.push(...validateSkin(skin));
  if (skin.gaze !== undefined) {
    if (skin.gaze.row < 0 || skin.gaze.row >= poseNames.length) {
      faults.push(`gaze row ${skin.gaze.row} is outside the atlas`);
    } else if (skin.rows[poseNames[skin.gaze.row] as PoseName].frames < skin.gaze.directions) {
      faults.push(`gaze row holds fewer frames than its ${skin.gaze.directions} directions`);
    }
  }
  return faults;
}

export function groundContact(
  skin: Skin,
  airborne: Readonly<Partial<Record<PoseName, readonly number[]>>> = {},
): string[] {
  const sliced = sliceSkin(skin);
  const contact = skin.groundLine - 1;
  return poseNames.flatMap((pose) =>
    Array.from({ length: skin.rows[pose].frames }, (_, index) => index).flatMap((index) => {
      if (airborne[pose]?.includes(index)) return [];
      const lowest = lowestOpaqueRow(sliced.frame(pose, index));
      if (lowest === undefined) return [`${pose} frame ${index} is empty`];
      return lowest === contact ? [] : [`${pose} frame ${index} stands on row ${lowest}`];
    }),
  );
}

export function outlineSeals(skin: Skin): string[] {
  const sliced = sliceSkin(skin);
  const { outline } = skin.palette;
  return poseNames.flatMap((pose) =>
    Array.from({ length: skin.rows[pose].frames }, (_, index) => index).flatMap((index) => {
      const frame = sliced.frame(pose, index);
      const leaks = fillsTouchingAir(frame, outline, skin.groundLine - 1);
      return leaks === 0 ? [] : [`${pose} frame ${index} has ${leaks} fill pixels touching air`];
    }),
  );
}

function build(source: SkinSource): Skin | string {
  try {
    return source();
  } catch (error) {
    return `the skin threw while building: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function shapeFaults(skin: Skin): string[] {
  const faults: string[] = [];
  if (!Number.isInteger(skin.cell.width) || skin.cell.width <= 0)
    faults.push(`cell width ${skin.cell.width} is not a positive integer`);
  if (!Number.isInteger(skin.cell.height) || skin.cell.height <= 0)
    faults.push(`cell height ${skin.cell.height} is not a positive integer`);
  if (!(skin.atlas.indices instanceof Uint8Array)) faults.push("the atlas indices are not bytes");
  for (const name of poseNames) {
    if (skin.rows[name] === undefined) faults.push(`${name}: the row is missing`);
  }
  return faults;
}

function fillsTouchingAir(frame: IndexedFrame, outline: number, contactRow: number): number {
  const { width, height, indices } = frame;
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? outline : (indices[y * width + x] ?? 0);
  let leaks = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const own = at(x, y);
      if (own === transparent || own === outline) continue;
      const touchesAir =
        at(x - 1, y) === transparent ||
        at(x + 1, y) === transparent ||
        at(x, y - 1) === transparent ||
        (y !== contactRow && at(x, y + 1) === transparent);
      if (touchesAir) leaks += 1;
    }
  }
  return leaks;
}
