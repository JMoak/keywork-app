import {
  type BlockPalette,
  deviceMatrix,
  type IndexedTexture,
  onTheRim,
  outlined,
  type Picture,
  type Quad,
} from "@keywork-app/habitat/block";

export interface TextureCache {
  canvasOf(texture: IndexedTexture, quad: Quad): CanvasImageSource | undefined;
  readonly size: number;
  clear(): void;
}

export type CanvasMaker = (width: number, height: number) => HTMLCanvasElement | OffscreenCanvas;

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const textureCacheLimit = 4096;

export function textureCache(
  palette: () => BlockPalette,
  make: CanvasMaker = documentCanvas,
  limit = textureCacheLimit,
): TextureCache {
  const held = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
  let theme = "";
  return {
    canvasOf: (texture, quad) => {
      const colours = palette();
      if (colours.key !== theme) {
        held.clear();
        theme = colours.key;
      }
      const key = `${texture.key}|${quad.ramp ?? ""}|${quad.light ?? ""}|${quad.fog}|${quad.haze}`;
      const known = held.get(key);
      if (known !== undefined) return known;
      const canvas = make(texture.width, texture.height);
      const context = canvas.getContext("2d") as Context2D | null;
      if (context === null) return undefined;
      paintTexture(context, texture, colours, quad);
      if (held.size >= limit) held.clear();
      held.set(key, canvas);
      return canvas;
    },
    get size() {
      return held.size;
    },
    clear: () => held.clear(),
  };
}

export function paintPicture(
  context: CanvasRenderingContext2D,
  picture: Picture,
  palette: BlockPalette,
  cache: TextureCache,
): void {
  const { view } = picture.list;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = false;
  context.globalAlpha = 1;
  context.fillStyle = palette.background;
  context.fillRect(0, 0, view.width, view.height);
  for (const rect of picture.backdrop) {
    const colour = palette.colourOf(rect.role, undefined);
    if (colour === undefined) continue;
    context.fillStyle = rect.dither ? (dither(context, colour, view.scale) ?? colour) : colour;
    context.globalAlpha = rect.alpha ?? 1;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  context.globalAlpha = 1;
  for (const quad of picture.list.quads) {
    context.setTransform(...deviceMatrix(quad, view.scale, picture.list.atRest));
    if ("fill" in quad.paint) {
      const colour = palette.colourOf(quad.paint.fill, quad.ramp, quad.light, quad.fog, quad.haze);
      if (colour === undefined) continue;
      context.fillStyle = colour;
      context.fillRect(0, 0, quad.width, quad.height);
      if (outlined(quad, palette)) outline(context, quad, palette.edge ?? colour);
      continue;
    }
    const image = cache.canvasOf(quad.paint.texture, quad);
    if (image !== undefined) context.drawImage(image, 0, 0);
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  for (const light of picture.lights) {
    const colour = palette.colourOf(light.role, undefined);
    if (colour === undefined) continue;
    context.globalAlpha = light.alpha;
    context.fillStyle = colour;
    context.fillRect(light.x * view.scale, light.y * view.scale, view.scale, view.scale);
  }
  context.globalAlpha = 1;
}

const patterns = new WeakMap<Context2D, Map<string, CanvasPattern>>();

function dither(
  context: CanvasRenderingContext2D,
  colour: string,
  scale: number,
): CanvasPattern | undefined {
  const known = patterns.get(context) ?? new Map<string, CanvasPattern>();
  patterns.set(context, known);
  const key = `${colour}|${scale}`;
  const held = known.get(key);
  if (held !== undefined) return held;
  const tile = documentCanvas(scale * 2, scale * 2);
  const paint = tile.getContext("2d");
  if (paint === null) return undefined;
  paint.fillStyle = colour;
  paint.fillRect(0, 0, scale, scale);
  paint.fillRect(scale, scale, scale, scale);
  const pattern = context.createPattern(tile, "repeat") ?? undefined;
  if (pattern !== undefined) known.set(key, pattern);
  return pattern;
}

function paintTexture(
  context: Context2D,
  texture: IndexedTexture,
  palette: BlockPalette,
  quad: Quad,
): void {
  const colours = texture.roles.map((role) =>
    palette.colourOf(role, quad.ramp, quad.light, quad.fog, quad.haze),
  );
  for (let y = 0; y < texture.height; y += 1) {
    let x = 0;
    while (x < texture.width) {
      const index = texture.indices[y * texture.width + x] ?? 0;
      let run = 1;
      while (x + run < texture.width && texture.indices[y * texture.width + x + run] === index) {
        run += 1;
      }
      const colour = index === 0 ? undefined : colours[index - 1];
      if (colour !== undefined) {
        context.fillStyle = colour;
        context.fillRect(x, y, run, 1);
      }
      x += run;
    }
  }
  if (outlined(quad, palette)) outlineOpaque(context, texture, quad, palette.edge ?? "");
}

function outline(context: Context2D, quad: Quad, edge: string): void {
  const width = Math.ceil(quad.width);
  const height = Math.ceil(quad.height);
  context.fillStyle = edge;
  context.fillRect(0, 0, width, 1);
  context.fillRect(0, height - 1, width, 1);
  context.fillRect(0, 0, 1, height);
  context.fillRect(width - 1, 0, 1, height);
}

function outlineOpaque(
  context: Context2D,
  texture: IndexedTexture,
  quad: Quad,
  edge: string,
): void {
  const width = Math.min(texture.width, Math.ceil(quad.width));
  const height = Math.min(texture.height, Math.ceil(quad.height));
  const rim = [
    ...Array.from({ length: width }, (_, x) => [
      [x, 0],
      [x, height - 1],
    ]),
    ...Array.from({ length: height }, (_, y) => [
      [0, y],
      [width - 1, y],
    ]),
  ].flat() as [number, number][];
  context.fillStyle = edge;
  for (const [x, y] of rim) {
    if (onTheRim(quad, x, y) && (texture.indices[y * texture.width + x] ?? 0) !== 0) {
      context.fillRect(x, y, 1, 1);
    }
  }
}

function documentCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
