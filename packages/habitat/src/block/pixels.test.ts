import { describe, expect, it } from "vitest";
import { atRest, levelEye, quarterTurn, raisedEye, restCamera } from "./camera.ts";
import { drawList, viewOf } from "./draw-list.ts";
import { kits } from "./kits/index.ts";
import { deviceMatrix } from "./raster.ts";
import { blockScene } from "./scene.ts";
import { noon, sketchPartnerships, sketchTown } from "./testing.ts";

describe("whole pixels at rest", () => {
  it("lands every art pixel on whole device pixels at every quarter turn, level and raised", () => {
    for (const kit of kits) {
      for (const count of [1, 2, 5, 9, 16, 30]) {
        const world = blockScene(sketchTown(count), {
          kit,
          appearance: "night",
          now: noon,
          partnerships: sketchPartnerships(count),
        }).world;
        for (const quarter of [0, 1, 2, 3, 4, -1, 7]) {
          for (const eye of [levelEye, raisedEye]) {
            for (const [width, height] of [
              [1008, 580],
              [641, 397],
              [1920, 1080],
            ] as const) {
              const view = viewOf(world, width, height, eye);
              const list = drawList(world, restCamera(quarter, eye), view, 12_345);
              expect(list.atRest).toBe(true);
              const off = list.quads.filter(
                (quad) => !deviceMatrix(quad, view.scale, true).every(Number.isInteger),
              );
              const stretched = list.quads.filter(
                (quad) => !quad.matrix.slice(0, 4).every(Number.isInteger),
              );
              expect(off.length + stretched.length, `${kit.id} ${count} q${quarter} k${eye}`).toBe(
                0,
              );
            }
          }
        }
      }
    }
  }, 60_000);

  it("knows a camera between rest positions, or resting on a corner, is not at rest", () => {
    expect(atRest({ angle: quarterTurn * 0.5, eye: raisedEye })).toBe(false);
    expect(atRest(restCamera(1, raisedEye, true))).toBe(false);
    expect(atRest({ angle: quarterTurn, eye: raisedEye * 0.5 })).toBe(false);
    expect(atRest({ angle: quarterTurn * 3 + 1e-9, eye: levelEye })).toBe(true);
  });
});
