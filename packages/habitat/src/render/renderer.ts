import type { Facing } from "../pose/pose.ts";
import type { PoseName, Skin } from "../pose/skin.ts";
import { type IndexedFrame, mirrorFrame, type SlicedSkin, sliceSkin } from "../skins/atlas.ts";
import type { Palette } from "./palette.ts";
import { alphaMask, type HitMask, mirrors, type PaintSurface, paintIndexed } from "./raster.ts";

export interface RenderPose {
  readonly clip: PoseName;
  readonly frame: number;
  readonly facing: Facing;
}

export interface RenderPrefs {
  readonly scale: number;
}

export interface RenderedFrame {
  readonly width: number;
  readonly height: number;
  readonly indexed: IndexedFrame;
  readonly alpha: Uint8Array;
  paint(surface: PaintSurface, x?: number, y?: number): void;
}

export type Renderer = (pose: RenderPose, tokens: Palette, prefs: RenderPrefs) => RenderedFrame;

export const artScale = 2;

export function scaleFor(devicePixelRatio: number, size = 1): number {
  return Math.max(1, Math.round(artScale * size * devicePixelRatio));
}

export function createRenderer(skin: Skin): Renderer {
  const sliced = sliceSkin(skin);
  const mirrored = new Map<string, IndexedFrame>();
  const masks = new Map<string, HitMask>();
  return (pose, tokens, prefs) => {
    const scale = Math.max(1, Math.round(prefs.scale));
    const indexed = frameFor(sliced, mirrored, pose);
    const key = `${pose.clip}:${pose.frame}:${pose.facing}:${scale}`;
    const mask = masks.get(key) ?? alphaMask(indexed, scale);
    masks.set(key, mask);
    return {
      width: indexed.width * scale,
      height: indexed.height * scale,
      indexed,
      alpha: mask.bits,
      paint: (surface, x = 0, y = 0) => paintIndexed(surface, indexed, tokens, scale, x, y),
    };
  };
}

function frameFor(
  sliced: SlicedSkin,
  mirrored: Map<string, IndexedFrame>,
  pose: RenderPose,
): IndexedFrame {
  const cell = sliced.frame(pose.clip, pose.frame);
  if (!mirrors(pose.clip, pose.facing)) return cell;
  const key = `${pose.clip}:${pose.frame}`;
  const known = mirrored.get(key);
  if (known !== undefined) return known;
  const flipped = mirrorFrame(cell);
  mirrored.set(key, flipped);
  return flipped;
}
