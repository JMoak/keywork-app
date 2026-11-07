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

export const glyphs = ".sclhdgwpo*@!DEF" as const;

export function indexOfGlyph(glyph: string): number {
  const index = glyphs.indexOf(glyph);
  if (index < 0) throw new Error(`"${glyph}" is not in the legend ${glyphs}`);
  return index;
}

export function glyphOfIndex(index: number): string {
  const glyph = glyphs[index];
  if (glyph === undefined) throw new Error(`palette index ${index} is outside the legend`);
  return glyph;
}
