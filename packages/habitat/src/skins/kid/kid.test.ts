import { describe, expect, it } from "vitest";
import { resolvedSprite } from "./cell.ts";
import {
  cellHeight,
  cellToAscii,
  cellWidth,
  clipBuilders,
  deformSprite,
  frameOf,
  groundLine,
  kidSkin,
  mirrorCell,
  opaqueCount,
  type Placement,
  type PoseName,
  part,
  type parts,
  poseNames,
  renderFrameAscii,
  type Skin,
} from "./index.ts";

const skin = kidSkin();

const freeOfTheGround: ReadonlySet<PoseName> = new Set(["celebrate", "greet", "raise"]);
const contactRow = groundLine - 1;

function everyFrame(): { pose: PoseName; frame: number; cell: Uint8Array }[] {
  return poseNames.flatMap((pose) =>
    Array.from({ length: skin.rows[pose].frames }, (_, frame) => ({
      pose,
      frame,
      cell: frameOf(skin, pose, frame),
    })),
  );
}

function pixel(cell: Uint8Array, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= cellWidth || y >= cellHeight) return -1;
  return cell[y * cellWidth + x] ?? 0;
}

function lowestOpaqueRow(cell: Uint8Array): number {
  let lowest = -1;
  cell.forEach((index, at) => {
    if (index !== 0) lowest = Math.max(lowest, Math.floor(at / cellWidth));
  });
  return lowest;
}

function unoutlinedFills(cell: Uint8Array): string[] {
  const faults: string[] = [];
  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      const index = pixel(cell, x, y);
      if (index === 0 || index === 9) continue;
      const neighbours = [
        pixel(cell, x - 1, y),
        pixel(cell, x + 1, y),
        pixel(cell, x, y - 1),
        pixel(cell, x, y + 1),
      ];
      if (neighbours.some((neighbour) => neighbour <= 0)) faults.push(`${x},${y}`);
    }
  }
  return faults;
}

function pixelsOutsideTheCell(placement: Placement): string[] {
  const { sprite, x, y } = resolvedSprite(placement);
  const outlined = placement.outline || placement.layer === "skin";
  const clipped: string[] = [];
  for (let j = 0; j < sprite.height; j += 1) {
    for (let i = 0; i < sprite.width; i += 1) {
      const index = sprite.pixels[j * sprite.width + i] ?? 0;
      if (index === 0) continue;
      const margin = outlined && index !== 9 ? 1 : 0;
      const left = x + i - margin;
      const top = y + j - margin;
      const right = x + i + margin;
      const bottom = y + j + margin;
      if (left < 0 || top < 0 || right >= cellWidth || bottom >= cellHeight) {
        clipped.push(`${x + i},${y + j}`);
      }
    }
  }
  return clipped;
}

function bandOf(named: typeof parts.torso) {
  if (named.band === undefined) throw new Error(`${named.name} has no band`);
  return named.band;
}

function withPixelsCounted(whole: Skin) {
  return { ...whole, atlas: { ...whole.atlas, indices: whole.atlas.indices.length } };
}

function firstDifferingPixel(one: Skin, other: Skin): number {
  return one.atlas.indices.findIndex((index, at) => index !== other.atlas.indices[at]);
}

describe("kidSkin manifest", () => {
  it("is deterministic: two generations are byte-identical", () => {
    const again = kidSkin();
    expect(withPixelsCounted(again)).toEqual(withPixelsCounted(skin));
    expect(firstDifferingPixel(again, skin)).toBe(-1);
  });

  it("gives every one-shot a fallback that settles on a loop", () => {
    for (const pose of poseNames) {
      const row = skin.rows[pose];
      if (row.loop) continue;
      expect(row.fallback).toBeDefined();
      const fallback = skin.rows[row.fallback ?? "idle"];
      expect(fallback.loop || skin.rows[fallback.fallback ?? "idle"].loop).toBe(true);
    }
  });
});

describe("every frame", () => {
  it("uses only the thirteen creature indices, with binary alpha", () => {
    for (const { pose, frame, cell } of everyFrame()) {
      const used = new Set(cell);
      for (const index of used) expect(index, `${pose} ${frame}`).toBeLessThan(13);
      expect(used.size, `${pose} ${frame}`).toBeGreaterThan(1);
    }
  });

  it("has a dark outline around every opaque region: only index 9 touches transparency or the cell edge", () => {
    for (const { pose, frame, cell } of everyFrame()) {
      expect(unoutlinedFills(cell), `${pose} ${frame}`).toEqual([]);
    }
  });

  it("stands on the fixed ground line in every row except celebrate, greet and raise", () => {
    for (const { pose, frame, cell } of everyFrame()) {
      if (freeOfTheGround.has(pose)) continue;
      expect(lowestOpaqueRow(cell), `${pose} ${frame}`).toBe(contactRow);
    }
  });

  it("never places a part above row 0 or beyond the cell, outline included", () => {
    for (const pose of poseNames) {
      for (const placements of clipBuilders[pose]().placements) {
        for (const placement of placements) {
          const clipped = pixelsOutsideTheCell(placement);
          expect(clipped, `${pose} ${placement.part.name}`).toEqual([]);
        }
      }
    }
  });

  it("keeps the crown clear for the glyph in the standing rows", () => {
    for (const { pose, frame, cell } of everyFrame()) {
      if (pose === "hammer" || pose === "stretch" || pose === "wave" || pose === "ring") continue;
      for (let x = 18; x <= 30; x += 1)
        expect(pixel(cell, x, 0), `${pose} ${frame} at ${x}`).toBe(0);
    }
  });
});

describe("the poses", () => {
  it("mirrors walk-left into walk-right", () => {
    for (let frame = 0; frame < 8; frame += 1) {
      expect(frameOf(skin, "walk-right", frame)).toEqual(
        mirrorCell(frameOf(skin, "walk-left", frame)),
      );
    }
  });

  it("gives the look row eight distinct directions around the model pose", () => {
    const directions = Array.from({ length: 8 }, (_, frame) => frameOf(skin, "look", frame));
    const model = frameOf(skin, "idle", 0);
    for (const direction of directions) expect(direction).not.toEqual(model);
    expect(new Set(directions.map((cell) => cellToAscii(cell))).size).toBe(8);
  });

  it("rings with both hands on the rope and the bell in the needs-you index while it swings", () => {
    const swinging = frameOf(skin, "ring", 2);
    const bellPixels = swinging.filter((index) => index === 11).length;
    expect(bellPixels).toBeGreaterThan(10);
    expect(frameOf(skin, "ring", 0).includes(11)).toBe(false);
    expect(frameOf(skin, "ring", 4).includes(11)).toBe(false);
    expect([pixel(swinging, 11, 27), pixel(swinging, 11, 29)]).toEqual([1, 1]);
  });
});

describe("the parts kit", () => {
  it("parses legend rows into sprites and refuses ragged rows or unknown glyphs", () => {
    const dot = part("dot", 0, 0, ["c"]);
    expect(dot.sprite).toEqual({ width: 1, height: 1, pixels: new Uint8Array([2]) });
    expect(() => part("ragged", 0, 0, ["cc", "c"])).toThrow(/wide/);
    expect(() => part("odd", 0, 0, ["cx"])).toThrow(/legend/);
  });

  it("grows and shrinks a band by whole rows and columns", () => {
    const box = part("box", 0, 0, ["ccc", "ccc", "ccc"], { rows: [0, 2], cols: [0, 2] });
    const grown = deformSprite(box.sprite, bandOf(box), 2, 1);
    expect([grown.width, grown.height]).toEqual([5, 5]);
    expect(opaqueCount(grown)).toBe(25);
    const shrunk = deformSprite(box.sprite, bandOf(box), -1, -1);
    expect([shrunk.width, shrunk.height]).toEqual([1, 2]);
  });
});

describe("ASCII snapshots for review", () => {
  it("idle frame 0: the model pose, goggles up, hammer in the belt", () => {
    expect(`\n${renderFrameAscii(skin, "idle", 0)}`).toBe(idleModel);
  });
});

const idleModel = `
................................................
................................................
............o.......................o...........
............oo.....................oo...........
............oho...................oho...........
.............oho.................oho............
.............ollo...............ollo............
..............ollo.............ollo.............
..............olllo.....o.....olllo.............
...............oollooooolooooolloo..............
.................ooooocclccooooo................
................ogggggoclcogggggo...............
...............oogpwwgooooogpwwgoo..............
..............ocogggggoclcogggggoco.............
.............occcooooocclccoooooccco............
............occccccccccccccccccccccco...........
............occccccccccccccccccccccco...........
............occccccoocccccccoocccccco...........
........oooocccccccoocccccccoocccccccoooo.......
.......ocsscccccccccccccccccccccccccccssco......
.......ocsscccccccccccccccccccccccccccssco......
.......occccccccccclllllllllllccccccccccco......
........oooocccccclllllllllllllccccccoooo.......
............occccclllllllllllllccccco...........
.............occcclllllllllllllcccco............
..............ossclllllllllllllcsso.............
...............osscllllsssllllcsso..............
................osssllllllllllssso..............
.................oossslllllsssooo...............
...................ossslllssso..................
...................occcclcccco..................
...................occcclcccco..................
.................ooocccccccccooo................
................occocccccccccocco...............
................occooooooooooocco...............
...............occcogggggggggoccco..............
.............ooccccogggggggggoccccoo............
............occccccogggggggggocccccco...........
...........occccccodddddhdddddocccccco..........
.......ooooocccccogggggggggggggoccccco..........
......odddddoccccogggggggggggggoccccco..........
......odddddoccccogggwwwwwwwgggoccccco..........
......odddddossscogggwgggggwgggocssso...........
.......oowoo.ooocogggwgggggwgggocooo............
........owo.....oogggwwwwwwwgggoo...............
........owo.....oodddddddddddddoo...............
........owo......ooooooooooooooo................
.........o.......owwwwo...owwwwo................
.................oddddo...oddddo................
................oddddo.....oddddo...............
.................oooo.......oooo................
................................................`;
