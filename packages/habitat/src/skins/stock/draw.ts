export function centered(span: number, content: string): string {
  const margin = (span - content.length) / 2;
  if (!Number.isInteger(margin) || margin < 0) {
    throw new Error(`"${content}" does not centre in ${span} columns`);
  }
  return ".".repeat(margin) + content + ".".repeat(margin);
}

export function symmetric(span: number, widths: readonly number[], glyph: string): string[] {
  return widths.map((width) => centered(span, glyph.repeat(width)));
}

export type Stamp = readonly [row: number, column: number, glyphs: string];

export function stamped(rows: readonly string[], stamps: readonly Stamp[]): string[] {
  const drawn = [...rows];
  for (const [row, column, glyphs] of stamps) {
    const held = drawn[row];
    if (held === undefined || column < 0 || column + glyphs.length > held.length) {
      throw new Error(`stamp "${glyphs}" at row ${row}, column ${column} leaves the drawing`);
    }
    drawn[row] = held.slice(0, column) + glyphs + held.slice(column + glyphs.length);
  }
  return drawn;
}
