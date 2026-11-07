import type { Glyph } from "../creature/semantic.ts";
import type { IndexedFrame } from "../skins/atlas.ts";
import { bitmapFromRows } from "../skins/legend.ts";

export const glyphGlyphs = ".o=@+!-";

export const glyphSize = 7;

export const glyphGap = 3;

export function glyphFrame(glyph: Glyph): IndexedFrame | undefined {
  return glyphFrames[glyph];
}

const glyphFrames: Readonly<Record<Glyph, IndexedFrame | undefined>> = {
  bell: bitmapFromRows(
    ["...o...", "..o@o..", ".o@@@o.", ".o@@@o.", "o@@@@@o", "ooooooo", "...o..."],
    glyphGlyphs,
  ),
  cross: bitmapFromRows(
    ["oo...oo", "o!o.o!o", ".o!!!o.", "..o!o..", ".o!!!o.", "o!o.o!o", "oo...oo"],
    glyphGlyphs,
  ),
  check: bitmapFromRows(
    [".....oo", "....o+o", "o..o+o.", "o+o+o..", ".o+o...", "..o....", "......."],
    glyphGlyphs,
  ),
  dot: bitmapFromRows(
    [".......", ".......", "..ooo..", ".o---o.", "..ooo..", ".......", "......."],
    glyphGlyphs,
  ),
  pause: bitmapFromRows(
    [".......", ".oo.oo.", ".--.--.", ".--.--.", ".--.--.", ".oo.oo.", "......."],
    glyphGlyphs,
  ),
  none: undefined,
};
