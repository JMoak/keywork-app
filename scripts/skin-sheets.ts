import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { poseNames } from "../packages/habitat/src/pose/skin.ts";
import {
  createRasterSurface,
  createRenderer,
  type PaletteSource,
  type RasterSurface,
  resolvePalette,
} from "../packages/habitat/src/render/index.ts";
import { creatureIds, loadSkin } from "../packages/habitat/src/skins/index.ts";
import { encodePng } from "../packages/ui/src/panes/stead/png.ts";
import { sourceOfTheme } from "../packages/ui/src/panes/stead/theme-source.ts";
import { keyworkDay, keyworkNight, type Theme } from "../packages/ui/src/theme/index.ts";

export const sheetScale = 2;
export const sheetGap = 6;
export const sheetCoats: readonly number[] = [2, 6];

export async function writeSkinSheets(directory: string): Promise<string[]> {
  await mkdir(directory, { recursive: true });
  const written: string[] = [];
  for (const id of creatureIds) {
    for (const theme of [keyworkNight, keyworkDay]) {
      const file = join(directory, `${id}-${theme.appearance}.png`);
      await writeFile(file, encodePng(skinSheet(id, theme).raster()));
      written.push(file);
    }
  }
  return written;
}

export function skinSheet(id: string, theme: Theme): RasterSurface {
  const loaded = loadSkin(id);
  if (!loaded.ok) throw new Error(loaded.faults.join("; "));
  const { skin } = loaded;
  const render = createRenderer(skin);
  const source = sourceOfTheme(theme);
  const columns = Math.max(...poseNames.map((pose) => skin.rows[pose].frames));
  const pitch = {
    x: skin.cell.width * sheetScale + sheetGap,
    y: skin.cell.height * sheetScale + sheetGap,
  };
  const block = columns * pitch.x + sheetGap * 3;
  const surface = createRasterSurface(
    block * sheetCoats.length + sheetGap,
    poseNames.length * pitch.y + sheetGap,
  );
  fill(
    surface,
    source.read("--kw-background"),
    0,
    0,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
  );
  sheetCoats.forEach((hueStop, coatAt) => {
    const coat = resolvePalette(source, { hueStop });
    poseNames.forEach((pose, row) => {
      for (let frame = 0; frame < skin.rows[pose].frames; frame += 1) {
        const x = sheetGap + coatAt * block + frame * pitch.x;
        const y = sheetGap + row * pitch.y;
        paintCellGround(surface, source, x, y, skin.cell, skin.groundLine);
        render({ clip: pose, frame, facing: "right" }, coat, { scale: sheetScale }).paint(
          surface,
          x,
          y,
        );
      }
    });
  });
  return surface;
}

function paintCellGround(
  surface: RasterSurface,
  source: PaletteSource,
  x: number,
  y: number,
  cell: { readonly width: number; readonly height: number },
  groundLine: number,
): void {
  fill(surface, source.read("--kw-panel"), x, y, cell.width * sheetScale, cell.height * sheetScale);
  fill(
    surface,
    source.read("--kw-border"),
    x,
    y + groundLine * sheetScale,
    cell.width * sheetScale,
    1,
  );
}

function fill(
  surface: RasterSurface,
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  surface.fillStyle = color;
  surface.fillRect(x, y, width, height);
}

if (import.meta.main) {
  const { positionals } = parseArgs({ allowPositionals: true });
  const directory = positionals[0];
  if (directory === undefined) {
    console.error("usage: bun scripts/skin-sheets.ts <folder to write the sheets into>");
    process.exit(2);
  }
  for (const file of await writeSkinSheets(directory)) console.log(file);
}
