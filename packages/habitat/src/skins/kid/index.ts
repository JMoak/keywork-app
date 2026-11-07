import { cellHeight, cellToAscii, cellWidth, groundLine } from "./cell.ts";
import { type Clip, clipBuilders } from "./poses.ts";
import { type PoseName, poseNames, type Row, type Skin } from "./types.ts";

export type { Layer, Placement, PlacementOptions } from "./cell.ts";
export {
  axis,
  cellFromAscii,
  cellHeight,
  cellToAscii,
  cellWidth,
  compose,
  groundLine,
  mirrorCell,
  place,
} from "./cell.ts";
export { glyphs } from "./legend.ts";
export type { EyeState, GoggleState } from "./parts.ts";
export * as parts from "./parts.ts";
export { airborneFrames, clipBuilders } from "./poses.ts";
export type { ArmPose, HammerPlace, KidConfig, KidExtras, LegPose } from "./rig.ts";
export { kid, modelConfig } from "./rig.ts";
export type { Band, Part, Sprite } from "./sprite.ts";
export {
  deformSprite,
  mirrorSprite,
  opaqueCount,
  outlineSprite,
  part,
  spriteFromRows,
} from "./sprite.ts";
export type { IndexedBitmap, PaletteRoles, PoseName, Row, Skin } from "./types.ts";
export { poseNames } from "./types.ts";

export const atlasColumns = 8;

export function kidSkin(): Skin {
  const clips = poseNames.map((name) => [name, clipBuilders[name]()] as const);
  const width = cellWidth * atlasColumns;
  const height = cellHeight * poseNames.length;
  const indices = new Uint8Array(width * height);
  clips.forEach(([, clip], row) => {
    clip.frames.forEach((frame, column) => {
      paintCell(indices, width, frame, column, row);
    });
  });
  return {
    id: "kid",
    displayName: "The kid",
    cell: { width: cellWidth, height: cellHeight },
    atlas: { width, height, indices },
    palette: { identity: [1, 2, 3, 4], ground: [5, 6, 7, 8], outline: 9, accent: [10, 11, 12] },
    rows: Object.fromEntries(clips.map(([name, clip]) => [name, clip.row])) as Record<
      PoseName,
      Row
    >,
    groundLine,
    gaze: { row: poseNames.indexOf("look"), directions: 8 },
  };
}

export function frameOf(skin: Skin, pose: PoseName, frame: number): Uint8Array {
  const row = poseNames.indexOf(pose);
  if (frame < 0 || frame >= skin.rows[pose].frames) {
    throw new Error(`${pose} has ${skin.rows[pose].frames} frames, not a frame ${frame}`);
  }
  const { width, height } = skin.cell;
  const cell = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const start = (row * height + y) * skin.atlas.width + frame * width;
    cell.set(skin.atlas.indices.subarray(start, start + width), y * width);
  }
  return cell;
}

export function renderFrameAscii(skin: Skin, pose: PoseName, frame: number): string {
  return cellToAscii(frameOf(skin, pose, frame));
}

export function clipOf(pose: PoseName): Clip {
  return clipBuilders[pose]();
}

function paintCell(
  indices: Uint8Array,
  atlasWidth: number,
  frame: Uint8Array,
  column: number,
  row: number,
): void {
  for (let y = 0; y < cellHeight; y += 1) {
    const source = frame.subarray(y * cellWidth, (y + 1) * cellWidth);
    indices.set(source, (row * cellHeight + y) * atlasWidth + column * cellWidth);
  }
}
