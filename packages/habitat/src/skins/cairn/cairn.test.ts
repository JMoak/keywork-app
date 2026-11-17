import { describe, expect, it } from "vitest";
import { poseNames } from "../../pose/skin.ts";
import { contentHash, mirrorFrame, sliceSkin } from "../atlas.ts";
import type { Sprite } from "../kid/sprite.ts";
import { outlineSeals, validateAtlas } from "../loader.ts";
import { cairnFrame, cairnRows, cairnSkin } from "./index.ts";
import { summit } from "./parts.ts";

describe("Cairn's authored atlas", () => {
  const skin = cairnSkin();
  const sliced = sliceSkin(skin);

  it("builds a complete, reproducible native atlas with fresh pixel storage", () => {
    const rebuilt = cairnSkin();
    expect(validateAtlas(skin)).toEqual([]);
    expect(skin.cell).toEqual({ width: 48, height: 52 });
    expect(skin.atlas.width).toBe(384);
    expect(skin.atlas.height).toBe(52 * poseNames.length);
    expect(contentHash(rebuilt.atlas)).toBe(contentHash(skin.atlas));
    expect(rebuilt.atlas.indices).not.toBe(skin.atlas.indices);
    expect(Object.keys(skin.rows)).toEqual(poseNames);
    expect(skin.groundLine).toBe(51);
  });

  it("seals every silhouette and leaves a clear pixel around the whole cell", () => {
    expect(outlineSeals(skin)).toEqual([]);
    for (const pose of poseNames) {
      for (let index = 0; index < skin.rows[pose].frames; index += 1) {
        const pixels = sliced.frame(pose, index).indices;
        const label = `${pose} ${index}`;
        expect(pixels.length, label).toBe(48 * 52);
        expect(pixels.filter((value) => value > 0).length, label).toBeGreaterThan(250);
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
    for (let index = 0; index < skin.rows["walk-left"].frames; index += 1)
      expect(cairnFrame("walk-right", index)).toEqual(
        mirrorFrame(sliced.frame("walk-left", index)).indices,
      );
  });

  it("distinguishes the six primary states by silhouette alone", () => {
    const states = ["idle", "work", "wait", "blocked", "deliver", "nap"] as const;
    states.forEach((pose, at) => {
      for (const other of states.slice(at + 1))
        expect(
          silhouetteDifference(cairnFrame(pose, 0), cairnFrame(other, 0)),
          `${pose} / ${other}`,
        ).toBeGreaterThan(80);
    });
  });

  it("inclines the summit toward the requested compass octant above a steady foundation", () => {
    const idle = cairnFrame("idle", 0);
    const neutral = partOrigin(idle, summit.sprite);
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
      const frame = cairnFrame("look", direction);
      const turned = partOrigin(frame, summit.sprite);
      expect(Math.sign(turned.x - neutral.x), `octant ${direction} x`).toBe(horizontal);
      expect(Math.sign(turned.y - neutral.y), `octant ${direction} y`).toBe(vertical);
      expect(frame.slice(37 * 48), `octant ${direction} foundation`).toEqual(idle.slice(37 * 48));
    }
    expect(
      new Set(octants.map(([direction]) => contentHash(sliced.frame("look", direction)))).size,
    ).toBe(8);
  });

  it("floats as three separate stones without drawing a shadow into its sheet", () => {
    for (let index = 0; index < cairnRows.idle.frames; index += 1) {
      const pixels = cairnFrame("idle", index);
      expect(connectedAreas(pixels), `idle ${index}`).toHaveLength(3);
      expect(pixels.slice(49 * 48).every((value) => value === 0)).toBe(true);
      expect(pixels.every((value) => value <= 4 || value === 9)).toBe(true);
    }
  });

  it("keeps the foundation steady while the summit works independently", () => {
    const first = cairnFrame("work", 0);
    const last = cairnFrame("work", 3);
    expect(first.slice(38 * 48)).toEqual(last.slice(38 * 48));
    expect(first.slice(0, 38 * 48)).not.toEqual(last.slice(0, 38 * 48));
    const idleFirst = cairnFrame("idle", 0);
    const idleShifted = cairnFrame("idle", 2);
    expect(idleFirst.slice(37 * 48)).toEqual(idleShifted.slice(37 * 48));
    expect(idleFirst.slice(0, 37 * 48)).not.toEqual(idleShifted.slice(0, 37 * 48));
  });

  it("settles into one low resting mound and opens upward to wait", () => {
    const resting = cairnFrame("nap", 0);
    expect(connectedAreas(resting)).toHaveLength(1);
    expect(top(resting)).toBeGreaterThanOrEqual(26);
    expect(top(cairnFrame("wait", 0))).toBeLessThan(top(cairnFrame("idle", 0)));
    expect(resting.slice(50 * 48, 51 * 48).some((value) => value !== 0)).toBe(true);
  });

  it("rests on a calm closed idle loop while gestures end in declared fallbacks", () => {
    expect(cairnRows.idle.loop).toBe(true);
    expect(cairnRows.idle.ms.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThan(6000);
    expect(cairnFrame("idle", cairnRows.idle.frames - 1)).toEqual(cairnFrame("idle", 0));
    for (const pose of ["deliver", "celebrate", "stretch", "wave", "greet", "raise"] as const) {
      expect(cairnRows[pose].loop, pose).toBe(false);
      expect(cairnRows[pose].fallback, pose).toBe("idle");
    }
    expect(cairnRows.ring.fallback).toBe("wait");
    expect(cairnRows.stumble.fallback).toBe("work");
  });

  it("rejects missing frames instead of silently drawing an unrelated pose", () => {
    for (const index of [-1, 0.5, Number.NaN, cairnRows.idle.frames])
      expect(() => cairnFrame("idle", index)).toThrow(RangeError);
  });
});

function silhouetteDifference(first: Uint8Array, second: Uint8Array): number {
  return first.reduce(
    (count, value, at) => count + (Boolean(value) === Boolean(second[at]) ? 0 : 1),
    0,
  );
}

function top(pixels: Uint8Array): number {
  return Math.floor(pixels.findIndex((value) => value !== 0) / 48);
}

function connectedAreas(pixels: Uint8Array): number[] {
  const unseen = new Set([...pixels.keys()].filter((at) => pixels[at] !== 0));
  const areas: number[] = [];
  while (unseen.size > 0) {
    const seed = unseen.values().next().value;
    if (seed === undefined) break;
    const pending = [seed];
    let area = 0;
    while (pending.length > 0) {
      const at = pending.pop();
      if (at === undefined || !unseen.delete(at)) continue;
      area += 1;
      for (const adjacent of [
        at - 48,
        at + 48,
        ...(at % 48 > 0 ? [at - 1] : []),
        ...(at % 48 < 47 ? [at + 1] : []),
      ])
        if (unseen.has(adjacent)) pending.push(adjacent);
    }
    areas.push(area);
  }
  return areas.sort((first, second) => first - second);
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
  if (origin === undefined) throw new Error("the summit is missing from the rendered frame");
  return origin;
}
