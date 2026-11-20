import type { IndexedFrame } from "../../atlas.ts";
import { bitmapFromRows, worldGlyphs } from "../../legend.ts";

export const courtyardSize = { width: 144, height: 84 } as const;

type Point = readonly [x: number, y: number];
type Stroke = readonly [x: number, y: number, length: number];

export function landscape() {
  const { width, height } = courtyardSize;
  const indices = new Uint8Array(width * height);
  const frame: IndexedFrame = { width, height, indices };

  function span(ink: number, y: number, left: number, right: number): void {
    if (y < 0 || y >= height) return;
    const start = Math.max(0, left);
    const end = Math.min(width, right);
    if (start < end) indices.fill(ink, y * width + start, y * width + end);
  }

  function shape(ink: number, start: Point, ...corners: Point[]): void {
    const edges = [...corners, start];
    const rows = edges.map(([, y]) => y);
    for (let y = Math.max(0, Math.min(...rows)); y < Math.min(height, Math.max(...rows)); y++) {
      const cuts: number[] = [];
      const scan = y + 0.5;
      let previous = start;
      for (const next of edges) {
        const [ax, ay] = previous;
        const [bx, by] = next;
        if (ay > scan !== by > scan) cuts.push(ax + ((scan - ay) * (bx - ax)) / (by - ay));
        previous = next;
      }
      cuts.sort((a, b) => a - b);
      for (let pair = 0; pair + 1 < cuts.length; pair += 2) {
        span(
          ink,
          y,
          Math.ceil((cuts[pair] as number) - 0.5),
          Math.ceil((cuts[pair + 1] as number) - 0.5),
        );
      }
    }
  }

  function bank(ink: number, first: Point, ...rim: Point[]): void {
    shape(ink, first, ...rim, [width, height], [0, height]);
  }

  function marks(ink: number, ...strokes: Stroke[]): void {
    for (const [x, y, length] of strokes) span(ink, y, x, x + length);
  }

  function stamp(x: number, y: number, tile: IndexedFrame): void {
    for (let row = 0; row < tile.height; row++) {
      for (let column = 0; column < tile.width; column++) {
        const ink = tile.indices[row * tile.width + column];
        if (ink) span(ink, y + row, x + column, x + column + 1);
      }
    }
  }

  return { frame, shape, bank, marks, stamp };
}

export type Landscape = ReturnType<typeof landscape>;

export function motif(...rows: string[]): IndexedFrame {
  const width = Math.max(...rows.map((row) => row.length));
  return bitmapFromRows(
    rows.map((row) => row.padEnd(width, ".").replaceAll(" ", ".")),
    worldGlyphs,
  );
}
