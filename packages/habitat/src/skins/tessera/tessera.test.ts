import { describe, expect, it } from "vitest";
import { poseNames } from "../../pose/skin.ts";
import { contentHash, mirrorFrame, sliceSkin } from "../atlas.ts";
import type { Sprite } from "../kid/sprite.ts";
import { groundContact, outlineSeals, validateAtlas } from "../loader.ts";
import { tesseraFrame, tesseraRows, tesseraSkin } from "./index.ts";
import { crown } from "./parts.ts";

describe("Tessera's authored atlas", () => {
  const skin = tesseraSkin();
  const sliced = sliceSkin(skin);

  it("builds a complete, reproducible native atlas with fresh pixel storage", () => {
    const rebuilt = tesseraSkin();
    expect(validateAtlas(skin)).toEqual([]);
    expect(skin.cell).toEqual({ width: 48, height: 52 });
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
        expect(Math.max(...pixels), label).toBeLessThanOrEqual(12);
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
    const neutral = partOrigin(idle, crown.sprite);
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
      const turned = partOrigin(frame, crown.sprite);
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

function partOrigin(pixels: Uint8Array, sprite: Sprite): { x: number; y: number } {
  const matches: { x: number; y: number }[] = [];
  for (let y = 0; y <= 52 - sprite.height; y += 1) {
    for (let x = 0; x <= 48 - sprite.width; x += 1) {
      if (
        sprite.pixels.every(
          (value, at) =>
            value === 0 ||
            value === pixels[(y + Math.floor(at / sprite.width)) * 48 + x + (at % sprite.width)],
        )
      )
        matches.push({ x, y });
    }
  }
  expect(matches).toHaveLength(1);
  const origin = matches[0];
  if (origin === undefined) throw new Error("the crown is missing from the rendered frame");
  return origin;
}
