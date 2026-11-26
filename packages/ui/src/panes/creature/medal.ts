import { facesAway, facesLeft, facesRight } from "@keywork-app/habitat/block";
import type { PaintSurface, Palette } from "@keywork-app/habitat/render";
import {
  creatureInk,
  type IndexedFrame,
  lamplight,
  paper,
  transparent,
  trouble,
} from "@keywork-app/habitat/skins";

export const medal = { width: 3, height: 6, ribbon: 2 } as const;
export const chestShare = 0.6;

export interface Chest {
  readonly x: number;
  readonly y: number;
}

export function pinMedal(
  surface: PaintSurface,
  frame: IndexedFrame,
  palette: Palette,
  scale: number,
  aspect: number | undefined,
): void {
  const chest = chestOf(frame, aspect);
  if (chest === undefined) return;
  const dab = (x: number, y: number, wide: number, tall: number, colour: number): void => {
    surface.fillStyle = palette[colour] ?? "";
    surface.fillRect((chest.x + x) * scale, (chest.y + y) * scale, wide * scale, tall * scale);
  };
  dab(1, 0, 1, medal.ribbon, trouble);
  dab(0, medal.ribbon, medal.width, 1, creatureInk);
  dab(0, medal.ribbon + 1, medal.width, medal.width, lamplight);
  dab(0, medal.ribbon + 1, 1, 1, paper);
}

export function chestOf(frame: IndexedFrame, aspect: number | undefined): Chest | undefined {
  if (aspect !== undefined && facesAway(aspect)) return undefined;
  const lean = aspect === undefined ? 0 : facesLeft(aspect) ? -1 : facesRight(aspect) ? 1 : 0;
  const reach = aspect !== undefined && aspect % 2 === 0 ? 1 : 0.5;
  const middle = (frame.width - medal.width) >> 1;
  const chestRow = Math.round(frame.height * chestShare);
  const rows = Array.from({ length: frame.height }, (_, row) => row).sort(
    (a, b) => Math.abs(a - chestRow) - Math.abs(b - chestRow),
  );
  for (const y of rows) {
    const columns = Array.from({ length: frame.width }, (_, x) => x).filter((x) =>
      wornAt(frame, x, y),
    );
    const edge = lean < 0 ? columns[0] : columns[columns.length - 1];
    if (edge === undefined) continue;
    const wanted = Math.round(middle + (edge - middle) * Math.abs(lean) * reach);
    const x = columns.reduce((best, column) =>
      Math.abs(column - wanted) < Math.abs(best - wanted) ? column : best,
    );
    return { x, y };
  }
  return undefined;
}

function wornAt(frame: IndexedFrame, x: number, y: number): boolean {
  if (x + medal.width > frame.width || y + medal.height > frame.height) return false;
  for (let row = y; row < y + medal.height; row += 1) {
    for (let column = x; column < x + medal.width; column += 1) {
      if ((frame.indices[row * frame.width + column] ?? transparent) === transparent) return false;
    }
  }
  return true;
}
