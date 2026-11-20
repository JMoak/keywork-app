import { describe, expect, it } from "vitest";
import { poseNames } from "../../pose/skin.ts";
import { contentHash, mirrorFrame, sliceSkin } from "../atlas.ts";
import type { Sprite } from "../kid/sprite.ts";
import { outlineSeals, validateAtlas } from "../loader.ts";
import { cairnFrame, cairnRows, cairnSkin } from "./index.ts";
import { levelSummit, shard, summit } from "./parts.ts";

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
    expect(skin.material).toBe("sandstone");
  });

  it("seals every silhouette and leaves a clear pixel around the whole cell", () => {
    expect(outlineSeals(skin)).toEqual([]);
    for (const pose of poseNames) {
      for (let index = 0; index < skin.rows[pose].frames; index += 1) {
        const pixels = sliced.frame(pose, index).indices;
        const label = `${pose} ${index}`;
        expect(pixels.length, label).toBe(48 * 52);
        expect(pixels.filter((value) => value > 0).length, label).toBeGreaterThan(250);
        expect(Math.max(...pixels), label).toBeLessThanOrEqual(15);
        expect(pixels.includes(12), label).toBe(pose === "blocked");
        expect(pixels.includes(10) || pixels.includes(11), label).toBe(false);
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

  it("inclines the summit toward the requested compass octant above a steady shard", () => {
    const idle = cairnFrame("idle", 0);
    const neutral = partOrigin(idle, summit.sprite);
    expect(skin.gaze).toEqual({ row: poseNames.indexOf("look"), directions: 8 });
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
      expect(partOrigin(frame, shard.sprite), `octant ${direction} shard`).toEqual(
        partOrigin(idle, shard.sprite),
      );
    }
    expect(
      new Set(octants.map(([direction]) => contentHash(sliced.frame("look", direction)))).size,
    ).toBe(8);
  });

  it("keeps open air between three unequal stones in idle, wait and every look", () => {
    for (const pose of ["idle", "wait", "look"] as const) {
      for (let index = 0; index < cairnRows[pose].frames; index += 1) {
        const pixels = cairnFrame(pose, index);
        const stones = regions(pixels, (value) => value !== 0);
        const label = `${pose} ${index}`;
        expect(stones, label).toHaveLength(3);
        const [cap = [], ring = [], lower = []] = stones;
        expect(ring.length, label).toBeGreaterThan(cap.length * 1.5);
        expect(cap.length, label).toBeGreaterThan(lower.length * 2);
        expect(
          pixels.slice(50 * 48).every((value) => value === 0),
          label,
        ).toBe(true);
        for (const stone of stones) {
          const moss = stone.filter((at) => [5, 6, 7, 8, 15].includes(pixels[at] ?? 0));
          expect(moss.length, label).toBeGreaterThan(stone.length * 0.05);
          expect(moss.length, label).toBeLessThan(stone.length * 0.3);
        }
      }
    }
  });

  it("tilts the cap toward the upper right and narrows the lower shard to a point", () => {
    const [cap = [], , lower = []] = regions(cairnFrame("idle", 0), (value) => value !== 0);
    const capRows = occupiedRows(cap);
    expect(Math.min(...(capRows[0] ?? []))).toBeGreaterThan(
      Math.max(...(capRows.at(-1) ?? [])) + 4,
    );
    const lowerRows = occupiedRows(lower);
    expect(Math.max(...lowerRows.map((row) => row.length))).toBeGreaterThan(10);
    expect(lowerRows.at(-1)?.length).toBeLessThanOrEqual(3);
  });

  it("keeps a through-hole open in every rendered frame, including the foreshortened arch", () => {
    for (const pose of poseNames) {
      for (let index = 0; index < cairnRows[pose].frames; index += 1) {
        const label = `${pose} ${index}`;
        const [opening] = aperture(cairnFrame(pose, index));
        const foreshortened = pose === "sit" || pose === "nap" || (pose === "raise" && index < 4);
        expect(opening?.length ?? 0, label).toBeGreaterThanOrEqual(foreshortened ? 12 : 32);
        expect(
          opening?.every((at) => at % 48 > 8 && at % 48 < 37 && at >= 48 * 17 && at < 48 * 40),
          label,
        ).toBe(true);
      }
    }
  });

  it("holds the pierced stone still while the top counterbalances the striking shard", () => {
    const lifted = cairnFrame("work", 0);
    const struck = cairnFrame("work", 3);
    expect(aperture(lifted)[0]).toEqual(aperture(struck)[0]);
    expect(partOrigin(struck, levelSummit.sprite).x).toBeLessThan(
      partOrigin(lifted, levelSummit.sprite).x,
    );
    expect(struck.slice(37 * 48, 45 * 48)).not.toEqual(lifted.slice(37 * 48, 45 * 48));
  });

  it("settles edge-on at the ground line and opens upward to wait", () => {
    const idle = cairnFrame("idle", 0);
    const resting = cairnFrame("nap", 0);
    expect(top(resting) - top(idle)).toBeGreaterThanOrEqual(14);
    expect(top(cairnFrame("wait", 0))).toBeLessThan(top(idle));
    expect(idle.slice(49 * 48).every((value) => value === 0)).toBe(true);
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

function aperture(pixels: Uint8Array): number[][] {
  return regions(pixels, (value) => value === 0)
    .filter((region) => region[0] !== 0 && region.length > 5)
    .sort((first, second) => second.length - first.length);
}

function occupiedRows(stone: number[]): number[][] {
  return Array.from({ length: 52 }, (_, y) =>
    stone.filter((at) => Math.floor(at / 48) === y).map((at) => at % 48),
  ).filter((row) => row.length > 0);
}

function regions(pixels: Uint8Array, includes: (value: number) => boolean): number[][] {
  const unseen = new Set([...pixels.keys()].filter((at) => includes(pixels[at] ?? 0)));
  const found: number[][] = [];
  for (const seed of unseen) {
    const region: number[] = [];
    const pending = [seed];
    while (pending.length > 0) {
      const at = pending.pop();
      if (at === undefined || !unseen.delete(at)) continue;
      region.push(at);
      for (const adjacent of [
        at - 48,
        at + 48,
        ...(at % 48 > 0 ? [at - 1] : []),
        ...(at % 48 < 47 ? [at + 1] : []),
      ]) {
        if (unseen.has(adjacent)) pending.push(adjacent);
      }
    }
    found.push(region);
  }
  return found;
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
