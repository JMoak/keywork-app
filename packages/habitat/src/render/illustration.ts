import type { Facing } from "../pose/pose.ts";
import { type PoseName, poseNames } from "../pose/skin.ts";

export interface Illustration {
  readonly id: string;
  readonly src: string;
  readonly source: IllustrationSize;
  readonly footprint: IllustrationSize & { readonly groundLine: number };
  readonly anchor: IllustrationPoint;
  readonly facing: Facing;
  readonly still?: IllustrationRect;
  readonly clips?: Readonly<Partial<Record<PoseName, IllustrationClip>>>;
}

export interface IllustrationSize {
  readonly width: number;
  readonly height: number;
}

export interface IllustrationPoint {
  readonly x: number;
  readonly y: number;
}

export type IllustrationRect = IllustrationSize & IllustrationPoint;

export interface IllustrationClip {
  readonly frames: readonly IllustrationRect[];
  readonly ms: readonly number[];
  readonly loop: boolean;
  readonly still: number;
}

export interface IllustrationPlacement {
  readonly crop: IllustrationRect;
  readonly destination: IllustrationRect;
  readonly mirrored: boolean;
}

export function validateIllustration(art: Illustration): void {
  if (!art.id || !art.src) throw new Error("An illustration needs an identity and image source");
  if (!validSize(art.source) || Math.max(art.source.width, art.source.height) > 2048)
    throw new RangeError("Illustration images must fit within 2048 by 2048 pixels");
  if (
    !validSize(art.footprint) ||
    !Number.isFinite(art.footprint.groundLine) ||
    art.footprint.groundLine <= 0 ||
    art.footprint.groundLine > art.footprint.height
  )
    throw new RangeError("Invalid illustration footprint or ground line");
  if (![art.anchor.x, art.anchor.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
    throw new RangeError("Illustration anchors use normalized coordinates");
  if (art.footprint.groundLine === art.footprint.height && art.anchor.y !== 1)
    throw new RangeError("A flush ground line requires a bottom-edge illustration anchor");
  if (art.facing !== "left" && art.facing !== "right")
    throw new Error("Invalid illustration facing");
  if (art.still) validateCrop(art.still, art.source);
  for (const [name, clip] of Object.entries(art.clips ?? {})) {
    if (
      !poseNames.includes(name as PoseName) ||
      !clip ||
      typeof clip.loop !== "boolean" ||
      !clip.frames.length ||
      clip.frames.length > 64 ||
      clip.frames.length !== clip.ms.length
    )
      throw new Error(`Invalid illustration clip ${name}`);
    if (
      !Number.isInteger(clip.still) ||
      clip.still < 0 ||
      clip.still >= clip.frames.length ||
      clip.ms.some((ms) => !Number.isFinite(ms) || ms <= 0) ||
      !Number.isFinite(clip.ms.reduce((sum, ms) => sum + ms, 0))
    )
      throw new RangeError(`Invalid hold or still frame in illustration clip ${name}`);
    for (const frame of clip.frames) validateCrop(frame, art.source);
  }
}

export function illustrationFrame(
  art: Illustration,
  clip?: PoseName,
  elapsedMs = 0,
  still = false,
): IllustrationRect | undefined {
  if (clip === undefined) return art.still ?? { x: 0, y: 0, ...art.source };
  const row = art.clips?.[clip];
  if (!row) return undefined;
  if (still) return row.frames[row.still];
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const duration = row.ms.reduce((sum, ms) => sum + ms, 0);
  let time = row.loop ? elapsed % duration : elapsed;
  for (const [i, ms] of row.ms.entries()) {
    if (time < ms) return row.frames[i];
    time -= ms;
  }
  return row.frames.at(-1);
}

export function placeIllustration(
  art: Illustration,
  crop: IllustrationRect,
  output: IllustrationSize,
  facing: Facing = art.facing,
): IllustrationPlacement {
  if (![output.width, output.height].every((v) => Number.isFinite(v) && v > 0))
    throw new RangeError("Illustration output dimensions must be finite and positive");
  const { footprint, anchor } = art;
  const mirrored = facing !== art.facing;
  const pivot = mirrored ? 1 - anchor.x : anchor.x;
  const room = Math.min(output.width / footprint.width, output.height / footprint.height);
  const width = footprint.width * room;
  const height = footprint.height * room;
  const ground = footprint.groundLine * room;
  const scale = Math.min(
    width / (2 * Math.max(pivot, 1 - pivot) * crop.width),
    height / crop.height,
    anchor.y > 0 ? ground / (crop.height * anchor.y) : Infinity,
    anchor.y < 1 ? (height - ground) / (crop.height * (1 - anchor.y)) : Infinity,
  );
  const destination = {
    x: output.width / 2 - pivot * crop.width * scale,
    y: (output.height - height) / 2 + ground - anchor.y * crop.height * scale,
    width: crop.width * scale,
    height: crop.height * scale,
  };
  return { crop, destination, mirrored };
}

export function illustrationPixel(
  placement: IllustrationPlacement,
  point: IllustrationPoint,
): IllustrationPoint | undefined {
  const { crop, destination, mirrored } = placement;
  const x = Math.floor(((point.x - destination.x) / destination.width) * crop.width);
  const y = Math.floor(((point.y - destination.y) / destination.height) * crop.height);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x >= crop.width ||
    y < 0 ||
    y >= crop.height
  )
    return undefined;
  return { x: crop.x + (mirrored ? crop.width - 1 - x : x), y: crop.y + y };
}

function validSize(size: IllustrationSize): boolean {
  return [size.width, size.height].every((v) => Number.isSafeInteger(v) && v > 0);
}

function validateCrop(rect: IllustrationRect, sheet: IllustrationSize): void {
  if (
    !validSize(rect) ||
    !Number.isSafeInteger(rect.x) ||
    !Number.isSafeInteger(rect.y) ||
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > sheet.width ||
    rect.y + rect.height > sheet.height
  )
    throw new RangeError("Illustration crop leaves its source image");
}
