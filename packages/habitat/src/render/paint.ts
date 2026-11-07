import type { Pointer } from "../creature/creature.ts";
import type { Glyph } from "../creature/semantic.ts";
import type { Facing } from "../pose/pose.ts";
import { directionRows, type PoseName, type Skin } from "../pose/skin.ts";
import { type IndexedFrame, sliceSkin } from "../skins/atlas.ts";
import { groundBase, groundLight, groundShadow, transparent } from "../skins/legend.ts";
import { glyphFrame, glyphGap, glyphSize } from "./glyph.ts";
import type { GlyphPalette, Palette, SkyColors } from "./palette.ts";
import { hitTest, type PaintSurface, paintIndexed } from "./raster.ts";
import type { Renderer, RenderPose } from "./renderer.ts";
import { anchorsFor, groundDepth, type SteadScene, slotOfX, slotSpan, xOfSlot } from "./stead.ts";

export interface FigurePose {
  readonly clip: PoseName;
  readonly frame: number;
  readonly facing: Facing;
  readonly x: number;
  readonly lift: number;
  readonly blink: boolean;
  readonly gaze: { readonly direction: number } | undefined;
  readonly glyph: Glyph;
}

export interface PlacedFigure {
  readonly slug: string;
  readonly skin: Skin;
  readonly pose: RenderPose;
  readonly slot: number;
  readonly left: number;
  readonly top: number;
  readonly glyph: Glyph;
}

export interface Figure {
  readonly placed: PlacedFigure;
  readonly render: Renderer;
  readonly palette: Palette;
}

export interface SteadPainting {
  readonly scene: SteadScene;
  readonly width: number;
  readonly scale: number;
  readonly sky: SkyColors;
  readonly world: Palette;
  readonly glyphs: GlyphPalette;
  readonly figures: readonly Figure[];
}

export const liftLimit = 3;
export const eyeLine = 0.4;
export const horizonShare = 0.55;

export function paintedHeight(scene: SteadScene): number {
  return scene.groundY + groundDepth;
}

export function horizonRow(scene: SteadScene): number {
  return Math.round(scene.groundY * horizonShare);
}

export function shownPose(skin: Skin, pose: FigurePose): RenderPose {
  if (pose.clip === "idle" && pose.gaze !== undefined && skin.gaze !== undefined) {
    const direction =
      ((pose.gaze.direction % skin.gaze.directions) + skin.gaze.directions) % skin.gaze.directions;
    return { clip: "look", frame: direction, facing: pose.facing };
  }
  if (pose.clip === "idle" && pose.blink && skin.rows.idle.frames > 1) {
    return { clip: "idle", frame: 1, facing: pose.facing };
  }
  return { clip: pose.clip, frame: pose.frame, facing: pose.facing };
}

export function restingPose(pose: FigurePose): FigurePose {
  return { ...pose, frame: directionRows.has(pose.clip) ? pose.frame : 0, blink: false };
}

export function placeFigure(
  scene: SteadScene,
  slug: string,
  skin: Skin,
  pose: FigurePose,
): PlacedFigure {
  const center = xOfSlot(anchorsFor(scene, slug), pose.x);
  const lift = Math.min(liftLimit, Math.max(0, Math.round(pose.lift)));
  return {
    slug,
    skin,
    pose: shownPose(skin, pose),
    slot: pose.x,
    left: Math.round(center - skin.cell.width / 2),
    top: scene.groundY - skin.groundLine - lift,
    glyph: pose.glyph,
  };
}

export function insideFigure(figure: PlacedFigure, x: number, y: number): boolean {
  return hitTest(
    figure.skin,
    figure.pose.clip,
    figure.pose.frame,
    x - figure.left,
    y - figure.top,
    figure.pose.facing,
  );
}

export function figureAt(
  figures: readonly PlacedFigure[],
  x: number,
  y: number,
): PlacedFigure | undefined {
  for (let at = figures.length - 1; at >= 0; at -= 1) {
    const figure = figures[at];
    if (figure !== undefined && insideFigure(figure, x, y)) return figure;
  }
  return undefined;
}

export function crownRow(figure: PlacedFigure): number {
  const frame = sliceSkin(figure.skin).frame(figure.pose.clip, figure.pose.frame);
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if (frame.indices[y * frame.width + x] !== transparent) return y;
    }
  }
  return frame.height;
}

export function glyphOrigin(figure: PlacedFigure): { x: number; y: number } | undefined {
  if (glyphFrame(figure.glyph) === undefined) return undefined;
  const x = figure.left + Math.floor((figure.skin.cell.width - glyphSize) / 2);
  const y = figure.top + crownRow(figure) - glyphGap - glyphSize;
  return { x, y: Math.max(0, y) };
}

export function pointerOffset(
  scene: SteadScene,
  figure: PlacedFigure,
  x: number,
  y: number,
): Pointer {
  const anchors = anchorsFor(scene, figure.slug);
  const span = Math.max(1, slotSpan(anchors));
  const eyeY = figure.top + figure.skin.cell.height * eyeLine;
  return { dx: slotOfX(anchors, x) - figure.slot, dy: (y - eyeY) / span };
}

export function paintStead(surface: PaintSurface, painting: SteadPainting): void {
  const { scene, width, scale } = painting;
  const height = paintedHeight(scene);
  surface.clearRect(0, 0, width * scale, height * scale);
  paintSky(surface, painting, height);
  paintGroundBeyond(surface, painting);
  paintIndexed(surface, scene.bitmap, painting.world, scale, 0, 0);
  for (const figure of painting.figures) paintFigure(surface, figure, painting);
}

export function samePainting(a: SteadPainting, b: SteadPainting): boolean {
  return (
    a.width === b.width &&
    a.scale === b.scale &&
    a.scene.groundY === b.scene.groundY &&
    sameBitmap(a.scene.bitmap, b.scene.bitmap) &&
    sameEntries(a.sky, b.sky) &&
    sameEntries(a.world, b.world) &&
    sameEntries(a.glyphs, b.glyphs) &&
    a.figures.length === b.figures.length &&
    a.figures.every((figure, at) => {
      const other = b.figures[at];
      return other !== undefined && sameFigure(figure, other);
    })
  );
}

function sameFigure(a: Figure, b: Figure): boolean {
  return (
    a.render === b.render &&
    a.placed.skin === b.placed.skin &&
    a.placed.left === b.placed.left &&
    a.placed.top === b.placed.top &&
    a.placed.glyph === b.placed.glyph &&
    a.placed.pose.clip === b.placed.pose.clip &&
    a.placed.pose.frame === b.placed.pose.frame &&
    a.placed.pose.facing === b.placed.pose.facing &&
    sameEntries(a.palette, b.palette)
  );
}

function sameBitmap(a: IndexedFrame, b: IndexedFrame): boolean {
  if (a === b) return true;
  if (a.width !== b.width || a.height !== b.height) return false;
  return a.indices.every((index, at) => index === b.indices[at]);
}

function sameEntries<Entries extends object>(a: Entries, b: Entries): boolean {
  if (a === b) return true;
  const keys = Object.keys(a) as (keyof Entries)[];
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}

function paintSky(surface: PaintSurface, painting: SteadPainting, height: number): void {
  const { scene, width, scale, sky } = painting;
  const horizon = horizonRow(scene);
  surface.fillStyle = sky.zenith;
  surface.fillRect(0, 0, width * scale, horizon * scale);
  surface.fillStyle = sky.horizon;
  surface.fillRect(0, horizon * scale, width * scale, (scene.groundY - horizon) * scale);
  surface.fillStyle = sky.zenith;
  surface.fillRect(0, scene.groundY * scale, width * scale, (height - scene.groundY) * scale);
}

function paintGroundBeyond(surface: PaintSurface, painting: SteadPainting): void {
  const { scene, width, scale, world } = painting;
  const bands = [groundLight, groundBase, groundBase, groundShadow];
  bands.forEach((index, row) => {
    const color = world[index];
    if (color === undefined) return;
    surface.fillStyle = color;
    surface.fillRect(0, (scene.groundY + row) * scale, width * scale, scale);
  });
}

function paintFigure(surface: PaintSurface, figure: Figure, painting: SteadPainting): void {
  const { scale } = painting;
  const { placed } = figure;
  figure
    .render(placed.pose, figure.palette, { scale })
    .paint(surface, placed.left * scale, placed.top * scale);
  const glyph = glyphFrame(placed.glyph);
  const origin = glyphOrigin(placed);
  if (glyph === undefined || origin === undefined) return;
  paintIndexed(surface, glyph, painting.glyphs, scale, origin.x * scale, origin.y * scale);
}
