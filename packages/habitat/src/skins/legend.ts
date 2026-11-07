import type { IndexedBitmap } from "../pose/skin.ts";

export const transparent = 0;
export const identityShadow = 1;
export const identityBase = 2;
export const identityLight = 3;
export const identityHighlight = 4;
export const groundShadow = 5;
export const groundBase = 6;
export const groundLight = 7;
export const groundHighlight = 8;
export const outline = 9;
export const lamplight = 10;
export const needsYou = 11;
export const trouble = 12;
export const glass = 13;
export const fog = 14;
export const dim = 15;

export const creatureGlyphs = ".sclhdgwpo*@!DEF";
export const worldGlyphs = ".:#=-sgwpo*@!DEF";
export const hexGlyphs = "0123456789abcdef";

export function bitmapFromRows(rows: readonly string[], legend = creatureGlyphs): IndexedBitmap {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (height === 0 || width === 0) throw new Error("a bitmap needs at least one pixel");
  const indices = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} is ${row.length} wide, not ${width}`);
    for (let x = 0; x < width; x += 1) indices[y * width + x] = indexOfGlyph(row[x] ?? "", legend);
  });
  return { width, height, indices };
}

export function rowsFromBitmap(bitmap: IndexedBitmap, legend = creatureGlyphs): string[] {
  const rows: string[] = [];
  for (let y = 0; y < bitmap.height; y += 1) {
    let row = "";
    for (let x = 0; x < bitmap.width; x += 1) {
      row += legend[bitmap.indices[y * bitmap.width + x] ?? transparent] ?? "?";
    }
    rows.push(row);
  }
  return rows;
}

export function indexOfGlyph(glyph: string, legend = creatureGlyphs): number {
  const index = legend.indexOf(glyph);
  if (index < 0) throw new Error(`"${glyph}" is not in the legend ${legend}`);
  return index;
}
