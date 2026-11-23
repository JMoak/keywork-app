import {
  type BlockPalette,
  critterParts,
  figureFor,
  firstKit,
  forcedBlockPalette,
  frameIndex,
  type IndexedTexture,
  identityRamp,
  kitNamed,
  resolveBlockPalette,
  type Sprite,
  textureFromRows,
} from "@keywork-app/habitat/block";
import type { TeamMember } from "./port.ts";

export const teamRows = 46;
export const groundRow = 41;
export const groundDepth = 3;
export const stepForward = 2;
export const eggCell = 18;
export const cellsShown = 10;
export const hopHeight = 5;
export const hopMs = 280;
export const longestCycle = 8;
export const ticksPerBeat = 2;

export interface Standing {
  readonly member: TeamMember;
  readonly current: boolean;
  readonly lift: number;
}

export interface StripScene {
  readonly pitch: number;
  readonly zoom: number;
  readonly tick: number;
  readonly quiet: boolean;
  readonly standing: readonly Standing[];
  readonly eggSway: number;
}

export function stripPalette(
  kitId: string,
  light: boolean,
  background: string,
  forcedColors: boolean,
): BlockPalette {
  const kit = kitNamed(kitId) ?? firstKit;
  const appearance = light ? "day" : "night";
  return forcedColors
    ? forcedBlockPalette(kit, appearance)
    : resolveBlockPalette(kit, appearance, background);
}

export function stripTexels(members: number, pitch: number): number {
  return members * pitch + eggCell;
}

export function zoomFor(sizePercent: number, devicePixelRatio: number): number {
  return Math.max(1, Math.round((sizePercent / 100) * devicePixelRatio));
}

export function hopLift(elapsedMs: number): number {
  if (elapsedMs < 0 || elapsedMs >= hopMs) return 0;
  const through = elapsedMs / hopMs;
  return Math.round(hopHeight * 4 * through * (1 - through));
}

export function nextFrameTick(standing: readonly Standing[], tick: number): number | undefined {
  const sprites = standing.flatMap(({ member }) => spritesOf(member));
  const shown = sprites.map((sprite) => frameIndex(sprite, tick));
  for (let ahead = ticksPerBeat; ahead <= longestCycle; ahead += ticksPerBeat) {
    if (sprites.some((sprite, at) => frameIndex(sprite, tick + ahead) !== shown[at])) {
      return tick + ahead;
    }
  }
  return undefined;
}

export function sceneKey(scene: StripScene, palette: BlockPalette): string {
  const figures = scene.standing.map(({ member, current, lift }) =>
    [
      member.slug,
      member.skin,
      member.identity,
      member.doing,
      member.first,
      current,
      lift,
      spritesOf(member)
        .map((sprite) => frameIndex(sprite, scene.tick))
        .join("."),
    ].join(":"),
  );
  return [palette.key, scene.zoom, scene.pitch, scene.quiet, scene.eggSway, ...figures].join("|");
}

export function paintStrip(
  context: CanvasRenderingContext2D,
  scene: StripScene,
  palette: BlockPalette,
): void {
  const brush = brushOn(context, scene.zoom, palette);
  const width = stripTexels(scene.standing.length, scene.pitch);
  context.clearRect(0, 0, width * scene.zoom, teamRows * scene.zoom);
  layGround(brush, width);
  scene.standing.forEach((standing, at) => {
    const centre = at * scene.pitch + (scene.pitch >> 1);
    if (standing.member.first && !scene.quiet) lightGround(brush, at * scene.pitch, scene.pitch);
    stand(brush, standing, centre, scene.tick);
  });
  const eggCentre = scene.standing.length * scene.pitch + (eggCell >> 1) + scene.eggSway;
  brush.stamp(eggArt, eggCentre - (eggArt.width >> 1), groundRow - eggArt.height, undefined);
}

interface Brush {
  rect(x: number, y: number, width: number, height: number, role: string, ramp?: string): void;
  stamp(texture: IndexedTexture, x: number, y: number, ramp: string | undefined): void;
}

function brushOn(context: CanvasRenderingContext2D, zoom: number, palette: BlockPalette): Brush {
  const rect = (
    x: number,
    y: number,
    width: number,
    height: number,
    role: string,
    ramp?: string,
  ): void => {
    const colour = palette.colourOf(role, ramp);
    if (colour === undefined) return;
    context.fillStyle = colour;
    context.fillRect(x * zoom, y * zoom, width * zoom, height * zoom);
  };
  return {
    rect,
    stamp: (texture, x, y, ramp) => {
      for (let row = 0; row < texture.height; row += 1) {
        for (let column = 0; column < texture.width; column += 1) {
          const index = texture.indices[row * texture.width + column] ?? 0;
          const role = index === 0 ? undefined : texture.roles[index - 1];
          if (role !== undefined) rect(x + column, y + row, 1, 1, role, ramp);
        }
      }
    },
  };
}

const groundRoles = ["grass>paper@0.45", "grass>paper@0.15", "soil"] as const;
const litRoles = ["accent", "accent>ink@0.25", "accent>ink@0.5"] as const;

function layGround(brush: Brush, width: number): void {
  groundRoles.forEach((role, depth) => {
    const inset = depth === 1 ? 0 : 1;
    brush.rect(inset, groundRow + depth, width - inset * 2, 1, role);
  });
}

function lightGround(brush: Brush, left: number, width: number): void {
  litRoles.forEach((role, depth) => {
    brush.rect(left + 2, groundRow + depth, width - 4, 1, role);
  });
}

function stand(brush: Brush, standing: Standing, centre: number, tick: number): void {
  const { member, current, lift } = standing;
  const figure = figureFor(member.skin);
  const wide = Math.max(0, ...figure.rows.map((row) => row.length));
  const feet = groundRow + (current ? stepForward : 0);
  const ownColour = identityRamp(member.identity);
  if (current) {
    brush.rect(centre - (wide >> 1) - 1, groundRow + groundDepth, wide + 2, 1, "hue.l", ownColour);
  }
  for (const sprite of spritesOf(member)) {
    const frame = sprite.frames[frameIndex(sprite, tick)] ?? sprite.frames[0];
    if (frame !== undefined) {
      brush.stamp(frame, centre + sprite.left, feet - lift + sprite.top, ownColour);
    }
  }
  if (member.doing !== "sit") return;
  const head = feet - lift - figure.rows.length - figure.hover - 6;
  brush.rect(centre - 2, head, 1, 3, "chalk");
  brush.rect(centre + 1, head, 1, 3, "chalk");
}

function spritesOf(member: TeamMember): Sprite[] {
  return critterParts(figureFor(member.skin), member.doing, member.order).flatMap((part) =>
    "sprite" in part ? [part.sprite] : [],
  );
}

const eggArt = textureFromRows(
  [
    "...ooo...",
    "..owwwo..",
    ".ohwwwwo.",
    ".ohwwswo.",
    "owwwwwwwo",
    "owswwwwwo",
    "owwwwwsdo",
    "owwwwwddo",
    ".owwdddo.",
    "..odddo..",
    "...ooo...",
  ],
  { o: "ink", h: "paper", w: "chalk", d: "stone", s: "slate" },
);
