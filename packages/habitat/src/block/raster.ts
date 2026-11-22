import { type Raster, rgbaOf } from "../render/raster.ts";
import { overChannel } from "./colour.ts";
import type { Affine, DrawList, Quad } from "./draw-list.ts";
import { onTheRim, outlined } from "./forced.ts";
import type { BlockPalette } from "./palette.ts";
import type { Backdrop, Light } from "./sky.ts";

export interface Picture {
  readonly list: DrawList;
  readonly backdrop: readonly Backdrop[];
  readonly lights: readonly Light[];
}

type Rgba = readonly [number, number, number, number];

export function deviceMatrix(quad: Quad, scale: number, atRest: boolean): Affine {
  const [a, b, c, d, e, f] = quad.matrix;
  const x = e * scale;
  const y = f * scale;
  return [
    a * scale,
    b * scale,
    c * scale,
    d * scale,
    atRest ? Math.round(x) : x,
    atRest ? Math.round(y) : y,
  ];
}

export function rasterizePicture(picture: Picture, palette: BlockPalette): Raster {
  const { view } = picture.list;
  const width = view.width;
  const height = view.height;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const parse = parser();
  const ground = parse(palette.background);
  for (let offset = 0; offset < rgba.length; offset += 4) rgba.set(ground, offset);
  for (const rect of picture.backdrop) {
    const colour = palette.colourOf(rect.role, undefined);
    if (colour === undefined) continue;
    paintRect(rgba, width, height, rect, parse(colour), view.scale);
  }
  for (const quad of picture.list.quads) {
    blit(
      rgba,
      width,
      height,
      quad,
      deviceMatrix(quad, view.scale, picture.list.atRest),
      palette,
      parse,
    );
  }
  for (const light of picture.lights) {
    const colour = palette.colourOf(light.role, undefined);
    if (colour === undefined) continue;
    blend(rgba, width, height, light, parse(colour), view.scale);
  }
  return { width, height, rgba };
}

function parser(): (colour: string) => Rgba {
  const parsed = new Map<string, Rgba>();
  return (colour) => {
    const known = parsed.get(colour);
    if (known !== undefined) return known;
    const made = rgbaOf(colour);
    parsed.set(colour, made);
    return made;
  };
}

function paintRect(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  rect: Backdrop,
  colour: Rgba,
  scale: number,
): void {
  const opacity =
    rect.alpha === undefined ? undefined : Math.round(Math.min(1, Math.max(0, rect.alpha)) * 255);
  for (let y = Math.max(0, rect.y); y < Math.min(height, rect.y + rect.height); y += 1) {
    for (let x = Math.max(0, rect.x); x < Math.min(width, rect.x + rect.width); x += 1) {
      if (rect.dither && Math.floor(x / scale) % 2 !== Math.floor(y / scale) % 2) continue;
      const at = (y * width + x) * 4;
      if (opacity === undefined) rgba.set(colour, at);
      else {
        for (let channel = 0; channel < 3; channel += 1) {
          rgba[at + channel] = overChannel(rgba[at + channel] ?? 0, colour[channel] ?? 0, opacity);
        }
      }
    }
  }
}

function blend(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  light: Light,
  colour: Rgba,
  scale: number,
): void {
  const opacity = Math.round(Math.min(1, Math.max(0, light.alpha)) * 255);
  for (let y = light.y * scale; y < (light.y + 1) * scale; y += 1) {
    for (let x = light.x * scale; x < (light.x + 1) * scale; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const at = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        rgba[at + channel] = overChannel(rgba[at + channel] ?? 0, colour[channel] ?? 0, opacity);
      }
    }
  }
}

function blit(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  quad: Quad,
  matrix: Affine,
  palette: BlockPalette,
  parse: (colour: string) => Rgba,
): void {
  const [a, b, c, d, e, f] = matrix;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9) return;
  const xs = [e, e + a * quad.width, e + c * quad.height, e + a * quad.width + c * quad.height];
  const ys = [f, f + b * quad.width, f + d * quad.height, f + b * quad.width + d * quad.height];
  const left = Math.max(0, Math.floor(Math.min(...xs)));
  const right = Math.min(width, Math.ceil(Math.max(...xs)));
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const bottom = Math.min(height, Math.ceil(Math.max(...ys)));
  const texture = "texture" in quad.paint ? quad.paint.texture : undefined;
  const roles =
    texture === undefined ? ["fill" in quad.paint ? quad.paint.fill : ""] : texture.roles;
  const colours = roles.map((role) => {
    const colour = palette.colourOf(role, quad.ramp, quad.light, quad.fog, quad.haze);
    return colour === undefined ? undefined : parse(colour);
  });
  const edge = outlined(quad, palette) ? parse(palette.edge ?? "") : undefined;
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const dx = px + 0.5 - e;
      const dy = py + 0.5 - f;
      const u = (d * dx - c * dy) / determinant;
      const v = (a * dy - b * dx) / determinant;
      if (u < 0 || v < 0 || u >= quad.width || v >= quad.height) continue;
      const index =
        texture === undefined
          ? 1
          : (texture.indices[Math.floor(v) * texture.width + Math.floor(u)] ?? 0);
      if (index === 0) continue;
      const colour =
        edge !== undefined && onTheRim(quad, Math.floor(u), Math.floor(v))
          ? edge
          : colours[index - 1];
      if (colour !== undefined) rgba.set(colour, (py * width + px) * 4);
    }
  }
}
