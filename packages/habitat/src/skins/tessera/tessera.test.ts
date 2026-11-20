import { describe, expect, it } from "vitest";
import { poseNames } from "../../pose/skin.ts";
import { contentHash, mirrorFrame, sliceSkin } from "../atlas.ts";
import { dim, fog, glass, groundShadow, lamplight, needsYou, outline, trouble } from "../legend.ts";
import { groundContact, outlineSeals, validateAtlas } from "../loader.ts";
import { tesseraFrame, tesseraRows, tesseraSkin } from "./index.ts";

describe("Tessera's authored atlas", () => {
  const skin = tesseraSkin();
  const sliced = sliceSkin(skin);

  it("builds a complete, reproducible native atlas with fresh pixel storage", () => {
    const rebuilt = tesseraSkin();
    expect(validateAtlas(skin)).toEqual([]);
    expect(skin.cell).toEqual({ width: 48, height: 52 });
    expect(skin.material).toBe("porcelain");
    expect(skin.atlas.width).toBe(384);
    expect(skin.atlas.height).toBe(52 * poseNames.length);
    expect(contentHash(rebuilt.atlas)).toBe(contentHash(skin.atlas));
    expect(rebuilt.atlas.indices).not.toBe(skin.atlas.indices);
    expect(Object.keys(skin.rows)).toEqual(poseNames);
  });

  it("seals every silhouette and leaves a clear pixel around the whole cell", () => {
    expect(outlineSeals(skin)).toEqual([]);
    expect(groundContact(skin)).toEqual([]);
    for (const pose of poseNames) {
      for (let index = 0; index < skin.rows[pose].frames; index += 1) {
        const pixels = sliced.frame(pose, index).indices;
        const label = `${pose} ${index}`;
        expect(pixels.length, label).toBe(48 * 52);
        expect(pixels.filter((value) => value > 0).length, label).toBeGreaterThan(300);
        expect(Math.max(...pixels), label).toBeLessThanOrEqual(dim);
        expect(pixels.includes(lamplight) || pixels.includes(needsYou), label).toBe(false);
        expect(pixels.includes(trouble), label).toBe(pose === "blocked");
        expect(
          pixels.some(
            (value, at) =>
              value !== 0 && (at < 48 || at >= 48 * 51 || at % 48 === 0 || at % 48 === 47),
          ),
          label,
        ).toBe(false);
      }
    }
  });

  it("joins three painted porcelain plates into one dome over six separately tapered legs", () => {
    const idle = tesseraFrame("idle", 0);
    const plates = glazedRegions(idle).filter((region) => region.length > 40);
    expect(plates).toHaveLength(3);
    for (const plate of plates) {
      expect(plate.filter((at) => idle[at] === glass || idle[at] === fog).length).toBeGreaterThan(
        8,
      );
      expect(plate.some((at) => idle[at] === dim)).toBe(true);
    }
    for (const y of [30, 31, 32, 33]) {
      const band = inkRuns(idle, y);
      expect(band).toHaveLength(1);
      expect(band[0]).toBeGreaterThan(34);
    }
    const shins = [43, 44, 45, 46].map((y) => inkRuns(idle, y));
    expect(shins.filter((runs) => runs.length === 6).length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...inkRuns(idle, 50))).toBe(1);
  });

  it("moves in every requested pose and mirrors walking without losing a column", () => {
    for (const pose of poseNames) {
      const frames = Array.from({ length: skin.rows[pose].frames }, (_, index) =>
        contentHash(sliced.frame(pose, index)),
      );
      expect(new Set(frames).size, pose).toBeGreaterThan(1);
    }
    for (let index = 0; index < skin.rows["walk-left"].frames; index += 1) {
      expect(tesseraFrame("walk-right", index)).toEqual(
        mirrorFrame(sliced.frame("walk-left", index)).indices,
      );
    }
  });

  it("distinguishes the six primary states by silhouette alone", () => {
    const states = ["idle", "work", "wait", "blocked", "deliver", "nap"] as const;
    states.forEach((pose, at) => {
      for (const other of states.slice(at + 1)) {
        expect(
          silhouetteDifference(tesseraFrame(pose, 0), tesseraFrame(other, 0)),
          `${pose} / ${other}`,
        ).toBeGreaterThan(80);
      }
    });
  });

  it("turns its crown toward the requested compass octant with its feet planted", () => {
    const idle = tesseraFrame("idle", 0);
    const neutral = crownTip(idle);
    const octants = [
      [0, 1, 0],
      [1, 1, 1],
      [2, 0, 1],
      [3, -1, 1],
      [4, -1, 0],
      [5, -1, -1],
      [6, 0, -1],
      [7, 1, -1],
    ] as const;
    for (const [direction, horizontal, vertical] of octants) {
      const frame = tesseraFrame("look", direction);
      const turned = crownTip(frame);
      expect(Math.sign(turned.x - neutral.x), `octant ${direction} x`).toBe(horizontal);
      expect(Math.sign(turned.y - neutral.y), `octant ${direction} y`).toBe(vertical);
      expect(frame.slice(40 * 48), `octant ${direction} feet`).toEqual(idle.slice(40 * 48));
    }
    expect(
      new Set(octants.map(([direction]) => contentHash(sliced.frame("look", direction)))).size,
    ).toBe(8);
  });

  it("keeps its supporting feet planted while the working foreleg moves", () => {
    const first = tesseraFrame("work", 0);
    const lifted = tesseraFrame("work", 2);
    for (let index = 0; index < tesseraRows.work.frames; index += 1)
      expect(tesseraFrame("work", index).slice(48 * 46)).toEqual(first.slice(48 * 46));
    expect(lifted.slice(0, 48 * 46)).not.toEqual(first.slice(0, 48 * 46));
  });

  it("folds into a lower, narrower rest and opens upward to wait", () => {
    const idle = bounds(tesseraFrame("idle", 0));
    const resting = bounds(tesseraFrame("nap", 0));
    const waiting = bounds(tesseraFrame("wait", 0));
    expect(resting.top).toBeGreaterThan(idle.top + 8);
    expect(resting.right - resting.left).toBeLessThan(idle.right - idle.left);
    expect(waiting.top).toBeLessThan(idle.top);
    expect(resting.bottom).toBe(skin.groundLine - 1);
  });

  it("rests on a calm closed idle loop while gestures end in declared fallbacks", () => {
    expect(tesseraRows.idle.loop).toBe(true);
    expect(tesseraRows.idle.ms.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThan(5000);
    expect(tesseraFrame("idle", tesseraRows.idle.frames - 1)).toEqual(tesseraFrame("idle", 0));
    for (const pose of ["deliver", "celebrate", "stretch", "wave", "greet", "raise"] as const) {
      expect(tesseraRows[pose].loop, pose).toBe(false);
      expect(tesseraRows[pose].fallback, pose).toBe("idle");
    }
    expect(tesseraRows.ring.fallback).toBe("wait");
    expect(tesseraRows.stumble.fallback).toBe("work");
  });

  it("rejects missing frames instead of silently drawing an unrelated pose", () => {
    for (const index of [-1, 0.5, Number.NaN, tesseraRows.idle.frames])
      expect(() => tesseraFrame("idle", index)).toThrow(RangeError);
  });
});

function silhouetteDifference(first: Uint8Array, second: Uint8Array): number {
  return first.reduce(
    (count, value, at) => count + (Boolean(value) === Boolean(second[at]) ? 0 : 1),
    0,
  );
}

function bounds(pixels: Uint8Array): { left: number; right: number; top: number; bottom: number } {
  const points = [...pixels.keys()].filter((at) => pixels[at] !== 0);
  return {
    left: Math.min(...points.map((at) => at % 48)),
    right: Math.max(...points.map((at) => at % 48)),
    top: Math.floor(Math.min(...points) / 48),
    bottom: Math.floor(Math.max(...points) / 48),
  };
}

function crownTip(pixels: Uint8Array): { x: number; y: number } {
  const y = bounds(pixels).top;
  const row = pixels.subarray(y * 48, (y + 1) * 48);
  return { x: (row.indexOf(outline) + row.lastIndexOf(outline)) / 2, y };
}

function inkRuns(pixels: Uint8Array, y: number): number[] {
  const runs: number[] = [];
  let length = 0;
  for (const pixel of pixels.subarray(y * 48, (y + 1) * 48)) {
    if (pixel) length++;
    else if (length > 0) {
      runs.push(length);
      length = 0;
    }
  }
  return runs;
}

function glazedRegions(pixels: Uint8Array): number[][] {
  const remaining = new Set(
    [...pixels.keys()].filter((at) => {
      const value = pixels[at] ?? 0;
      return (value > 0 && value < groundShadow) || value >= glass;
    }),
  );
  const regions: number[][] = [];
  for (const start of remaining) {
    const region = [start];
    remaining.delete(start);
    for (let i = 0; i < region.length; i++) {
      const at = region[i] as number;
      for (const next of [at - 48, at + 48, at - 1, at + 1]) {
        if (remaining.delete(next)) region.push(next);
      }
    }
    regions.push(region);
  }
  return regions;
}
