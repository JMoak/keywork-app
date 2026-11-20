import { describe, expect, it } from "vitest";
import { type PoseName, paletteIndexLimit, poseNames } from "../../pose/skin.ts";
import {
  contentHash,
  type IndexedFrame,
  lowestOpaqueRow,
  mirrorFrame,
  sliceSkin,
} from "../atlas.ts";
import { lamplight, trouble } from "../legend.ts";
import { groundContact, outlineSeals, validateAtlas } from "../loader.ts";
import { folioFrame, folioRows, folioSkin } from "./index.ts";

describe("Folio's leaf-wing atlas", () => {
  const skin = folioSkin();
  const sliced = sliceSkin(skin);
  const frames = (pose: PoseName) =>
    Array.from({ length: folioRows[pose].frames }, (_, i) => sliced.frame(pose, i));

  it("packs every declared pose into the native grid, leaving unused cells transparent", () => {
    expect(validateAtlas(skin)).toEqual([]);
    expect(skin.cell).toEqual({ width: 48, height: 52 });
    expect(skin.material).toBe("leaf");
    expect([skin.atlas.width, skin.atlas.height]).toEqual([384, 1092]);
    expect(Object.keys(folioRows)).toEqual(poseNames);
    for (const [row, pose] of poseNames.entries()) {
      const clip = frames(pose);
      expect(new Set(clip.map(contentHash)).size, pose).toBeGreaterThan(1);
      for (let y = 0; y < 52; y += 1) {
        const start = (row * 52 + y) * skin.atlas.width;
        expect(
          skin.atlas.indices.subarray(start + clip.length * 48, start + 384).some(Boolean),
          pose,
        ).toBe(false);
      }
    }
    const rebuilt = folioSkin();
    expect(rebuilt.atlas.indices).not.toBe(skin.atlas.indices);
    expect(contentHash(rebuilt.atlas)).toBe(contentHash(skin.atlas));
  });

  it("seals every contour and keeps each pose inside the cell with a transparent border", () => {
    expect(outlineSeals(skin)).toEqual([]);
    for (const pose of poseNames) {
      for (const [i, frame] of frames(pose).entries()) {
        const edge = frame.indices.some((pixel, at) => {
          const x = at % frame.width;
          const y = Math.floor(at / frame.width);
          return (
            pixel !== 0 && (x === 0 || y === 0 || x === frame.width - 1 || y === frame.height - 1)
          );
        });
        expect(edge, `${pose} ${i}`).toBe(false);
        expect(
          frame.indices.some((pixel) => pixel >= paletteIndexLimit),
          pose,
        ).toBe(false);
        expect(frame.indices.includes(13), pose).toBe(true);
        expect(frame.indices.includes(14), pose).toBe(true);
        expect(frame.indices.includes(trouble), pose).toBe(pose === "blocked");
      }
    }
  });

  it("grounds the feet through the walk and takes off and lands in a single wingbeat", () => {
    expect(groundContact(skin, { celebrate: [1, 2, 3] })).toEqual([]);
    expect(frames("celebrate").map(lowestOpaqueRow)).toEqual([50, 48, 45, 47, 50, 50]);
    for (const [i, left] of frames("walk-left").entries()) {
      const right = sliced.frame("walk-right", i);
      expect(mirrorFrame(left).indices).toEqual(right.indices);
      expect(eyeGlint(left).x).toBeLessThan(24);
      expect(eyeGlint(right).x).toBeGreaterThan(24);
    }
    expect(new Set(frames("walk-left").map(contentHash)).size).toBe(8);
    expect(eyeGlint(sliced.frame("idle", 0)).x).toBeGreaterThan(24);
  });

  it("moves the eye into all eight screen compass octants while both feet stay planted", () => {
    const idle = sliced.frame("idle", 0);
    const neutral = eyeGlint(idle);
    const compass = [
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
    ];
    expect(skin.gaze).toEqual({ row: poseNames.indexOf("look"), directions: 8 });
    for (const [octant, look] of frames("look").entries()) {
      const eye = eyeGlint(look);
      expect(
        [Math.sign(eye.x - neutral.x), Math.sign(eye.y - neutral.y)],
        `direction ${octant}`,
      ).toEqual(compass[octant]);
      expect(look.indices.slice(43 * 48)).toEqual(idle.indices.slice(43 * 48));
    }
  });

  it("raises a listening leaf, shelters beneath a bent wing, and draws both leaves low to sleep", () => {
    const states = ["idle", "work", "wait", "blocked", "deliver", "nap"] as const;
    for (const [at, pose] of states.entries()) {
      for (const other of states.slice(at + 1)) {
        const first = sliced.frame(pose, 0).indices;
        const second = sliced.frame(other, 0).indices;
        const distance = first.reduce(
          (sum, value, index) => sum + Number(Boolean(value) !== Boolean(second[index])),
          0,
        );
        expect(distance, `${pose} / ${other} silhouettes`).toBeGreaterThan(160);
      }
    }
    const top = (pose: PoseName) =>
      Math.floor(sliced.frame(pose, 0).indices.findIndex(Boolean) / 48);
    expect(top("wait")).toBeLessThan(top("idle") - 5);
    expect(top("blocked")).toBeGreaterThan(top("idle"));
    expect(top("nap")).toBeGreaterThan(top("idle") + 10);
  });

  it("keeps two veined leaves, an open channel beside the cream neck and a curled teal-backed tail", () => {
    const idle = sliced.frame("idle", 0);
    const row = (y: number, x: number, end: number) => [
      ...idle.indices.slice(y * idle.width + x, y * idle.width + end),
    ];
    expect(row(12, 10, 19)).toContain(13);
    expect(row(12, 24, 34)).toContain(13);
    expect(row(12, 19, 23)).toEqual([0, 0, 0, 0]);
    for (const y of [24, 28, 29, 32]) {
      const backLeaf = row(y, 4, 24);
      const frontLeaf = row(y, 34, 46);
      expect(backLeaf).toContain(13);
      expect(frontLeaf).toContain(13);
      expect(row(y, 20, 28)).toContain(0);
      expect(row(y, 25, 35)).toContain(8);
    }
    expect(row(39, 2, 7)).toContain(8);
    expect(row(39, 7, 12)).toEqual([0, 0, 0, 0, 0]);
    expect(row(39, 12, 17)).toContain(6);
    expect(row(44, 2, 15)).toContain(14);
  });

  it("presses the fold flatter beneath its snout and releases it on the final hold", () => {
    const start = sliced.frame("work", 0);
    const press = sliced.frame("work", 3);
    const release = sliced.frame("work", folioRows.work.frames - 1);
    const paperThickness = (frame: IndexedFrame) => {
      let y = skin.groundLine - 1;
      while (frame.indices[y * frame.width + 43]) y -= 1;
      return skin.groundLine - 1 - y;
    };
    expect(paperThickness(press)).toBeGreaterThan(0);
    expect(paperThickness(press)).toBeLessThan(paperThickness(start));
    expect(press.indices.slice(43 * 48 + 32, 43 * 48 + 40)).toContain(8);
    expect(release.indices).toEqual(start.indices);
  });

  it("blinks on the renderer's idle blink frame and returns to an unbroken resting hold", () => {
    expect(
      sliced
        .frame("idle", 1)
        .indices.slice(0, 31 * 48)
        .includes(lamplight),
    ).toBe(false);
    expect(eyeGlint(sliced.frame("idle", 0)).x).toBeGreaterThan(0);
    expect(sliced.frame("idle", folioRows.idle.frames - 1).indices).toEqual(
      sliced.frame("idle", 0).indices,
    );
    expect(folioRows.idle.ms.reduce((a, b) => a + b)).toBeGreaterThan(5000);
    for (const pose of ["deliver", "celebrate", "stretch", "wave", "greet", "raise"] as const) {
      expect(folioRows[pose].loop).toBe(false);
      expect(folioRows[pose].fallback).toBe("idle");
    }
    expect(folioRows.ring.fallback).toBe("wait");
    expect(folioRows.stumble.fallback).toBe("work");
    for (const index of [-1, 0.5, Number.NaN, folioRows.work.frames])
      expect(() => folioFrame("work", index)).toThrow(RangeError);
  });
});

function eyeGlint(frame: IndexedFrame): { x: number; y: number } {
  const points = [...frame.indices.keys()].filter(
    (at) => at < 31 * frame.width && frame.indices[at] === lamplight,
  );
  expect(points.length).toBeGreaterThan(0);
  return {
    x: points.reduce((sum, at) => sum + (at % frame.width), 0) / points.length,
    y: points.reduce((sum, at) => sum + Math.floor(at / frame.width), 0) / points.length,
  };
}
