export type WidthTier = "broadsheet" | "column" | "clipping" | "masthead";

export const columnPx = 8;

export const tierColumns = { broadsheet: 100, column: 70, clipping: 40 } as const;

export const tierMinPx = {
  broadsheet: tierColumns.broadsheet * columnPx,
  column: tierColumns.column * columnPx,
  clipping: tierColumns.clipping * columnPx,
} as const;

export function tierOf(widthPx: number): WidthTier {
  if (widthPx >= tierMinPx.broadsheet) return "broadsheet";
  if (widthPx >= tierMinPx.column) return "column";
  if (widthPx >= tierMinPx.clipping) return "clipping";
  return "masthead";
}

export const tierPresetPx: Record<WidthTier, number> = {
  broadsheet: 960,
  column: 640,
  clipping: 420,
  masthead: 280,
};
