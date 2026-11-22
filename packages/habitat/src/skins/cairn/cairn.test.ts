import { describe, expect, it } from "vitest";
import { poseNames } from "../../pose/skin.ts";
import { sliceSkin } from "../atlas.ts";
import { outlineSeals } from "../loader.ts";
import { cairnFrame, cairnRows, cairnSkin } from "./index.ts";

describe("Cairn's authored atlas", () => {
  const skin = cairnSkin();
  const sliced = sliceSkin(skin);

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
