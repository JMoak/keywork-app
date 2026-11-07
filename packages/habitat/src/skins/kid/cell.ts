import { glyphOfIndex, outline, transparent } from "./legend.ts";
import { deformSprite, mirrorSprite, outlineSprite, type Part, type Sprite } from "./sprite.ts";

export const cellWidth = 48;
export const cellHeight = 52;
export const axis = 24;
export const groundLine = 51;

export type Layer = "behind" | "skin" | "front";

export interface Placement {
  readonly part: Part;
  readonly dx: number;
  readonly dy: number;
  readonly mirror: boolean;
  readonly rows: number;
  readonly cols: number;
  readonly layer: Layer;
  readonly outline: boolean;
}

export type PlacementOptions = Partial<Omit<Placement, "part">>;

export function place(part: Part, options: PlacementOptions = {}): Placement {
  return {
    part,
    dx: options.dx ?? 0,
    dy: options.dy ?? 0,
    mirror: options.mirror ?? false,
    rows: options.rows ?? 0,
    cols: options.cols ?? 0,
    layer: options.layer ?? "front",
    outline: options.outline ?? true,
  };
}

export function compose(placements: readonly Placement[]): Uint8Array {
  const cell = new Uint8Array(cellWidth * cellHeight);
  for (const placement of placements.filter((each) => each.layer === "behind"))
    blitPlacement(cell, placement);
  blitSkin(
    cell,
    placements.filter((each) => each.layer === "skin"),
  );
  for (const placement of placements.filter((each) => each.layer === "front"))
    blitPlacement(cell, placement);
  return cell;
}

export function mirrorCell(cell: Uint8Array): Uint8Array {
  const mirrored = new Uint8Array(cell.length);
  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 1; x < cellWidth; x += 1) {
      mirrored[y * cellWidth + (2 * axis - x)] = cell[y * cellWidth + x] ?? transparent;
    }
  }
  return mirrored;
}

export function cellToAscii(cell: Uint8Array): string {
  const lines: string[] = [];
  for (let y = 0; y < cellHeight; y += 1) {
    let line = "";
    for (let x = 0; x < cellWidth; x += 1)
      line += glyphOfIndex(cell[y * cellWidth + x] ?? transparent);
    lines.push(line);
  }
  return lines.join("\n");
}

export function cellFromAscii(ascii: string): Uint8Array {
  const rows = ascii.split("\n");
  const cell = new Uint8Array(cellWidth * cellHeight);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1)
      cell[y * cellWidth + x] = ".sclhdgwpo*@!DEF".indexOf(row.charAt(x));
  });
  return cell;
}

export function resolvedSprite(placement: Placement): { sprite: Sprite; x: number; y: number } {
  const { part } = placement;
  const shaped = placement.mirror ? mirrorSprite(part.sprite) : part.sprite;
  const deformed =
    part.band === undefined || (placement.rows === 0 && placement.cols === 0)
      ? shaped
      : deformSprite(shaped, part.band, placement.rows, placement.cols);
  const left = placement.mirror ? 2 * axis + 1 - part.x - part.sprite.width : part.x;
  return {
    sprite: deformed,
    x: left + placement.dx - placement.cols,
    y: part.y + placement.dy - placement.rows,
  };
}

function blitPlacement(cell: Uint8Array, placement: Placement): void {
  const resolved = resolvedSprite(placement);
  if (placement.outline) blit(cell, outlineSprite(resolved.sprite), resolved.x - 1, resolved.y - 1);
  else blit(cell, resolved.sprite, resolved.x, resolved.y);
}

function blitSkin(cell: Uint8Array, placements: readonly Placement[]): void {
  if (placements.length === 0) return;
  const skin = new Uint8Array(cellWidth * cellHeight);
  for (const placement of placements) {
    const resolved = resolvedSprite(placement);
    blit(skin, resolved.sprite, resolved.x, resolved.y);
  }
  const outlined = outlineSprite({ width: cellWidth, height: cellHeight, pixels: skin });
  blit(cell, outlined, -1, -1);
}

function blit(cell: Uint8Array, sprite: Sprite, left: number, top: number): void {
  for (let y = 0; y < sprite.height; y += 1) {
    const cellY = top + y;
    if (cellY < 0 || cellY >= cellHeight) continue;
    for (let x = 0; x < sprite.width; x += 1) {
      const cellX = left + x;
      if (cellX < 0 || cellX >= cellWidth) continue;
      const index = sprite.pixels[y * sprite.width + x] ?? transparent;
      if (index !== transparent) cell[cellY * cellWidth + cellX] = index;
    }
  }
}

export function isOutline(index: number): boolean {
  return index === outline;
}
