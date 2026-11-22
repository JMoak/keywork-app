import { describe, expect, it } from "vitest";
import { poseNames } from "../../pose/skin.ts";
import { contentHash, sliceSkin } from "../atlas.ts";
import type { Sprite } from "../kid/sprite.ts";
import { groundContact, outlineSeals } from "../loader.ts";
import { tesseraFrame, tesseraSkin } from "./index.ts";
import { crown } from "./parts.ts";

describe("Tessera's authored atlas", () => {
  const skin = tesseraSkin();
  const sliced = sliceSkin(skin);

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
});

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
