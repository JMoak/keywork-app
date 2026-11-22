import { describe, expect, it } from "vitest";
import { type PoseName, poseNames, type Skin } from "../../pose/skin.ts";
import { opaqueCount, sliceSkin } from "../atlas.ts";
import { carterAirborne, carterSkin } from "../carter/index.ts";
import { joinerAirborne, joinerSkin } from "../joiner/index.ts";
import { kidSkin } from "../kid/index.ts";
import { transparent } from "../legend.ts";
import { groundContact, outlineSeals } from "../loader.ts";
import { centered, stamped, symmetric } from "./draw.ts";

interface Authored {
  readonly id: string;
  readonly build: () => Skin;
  readonly airborne: Readonly<Partial<Record<PoseName, readonly number[]>>>;
}

const species: readonly Authored[] = [
  { id: "carter", build: carterSkin, airborne: carterAirborne },
  { id: "joiner", build: joinerSkin, airborne: joinerAirborne },
];

function frame(skin: Skin, pose: PoseName, index: number) {
  return sliceSkin(skin).frame(pose, index);
}

function everyFrame(skin: Skin): { pose: PoseName; index: number }[] {
  return poseNames.flatMap((pose) =>
    Array.from({ length: skin.rows[pose].frames }, (_, index) => ({ pose, index })),
  );
}

function differing(one: Uint8Array, other: Uint8Array): number {
  return one.reduce((sum, value, at) => sum + (value === other[at] ? 0 : 1), 0);
}

describe.each(species)("the $id", ({ id, build, airborne }) => {
  const skin = build();

  it("keeps the kid's cell, ground line, beats, loops and fallbacks, so the pose graph is one", () => {
    const kid = kidSkin();
    expect(skin.cell).toEqual(kid.cell);
    expect(skin.groundLine).toBe(kid.groundLine);
    expect(skin.rows).toEqual(kid.rows);
    expect(skin.gaze).toEqual(kid.gaze);
  });

  it("stands on the ground line in every frame but the declared airborne ones", () => {
    expect(groundContact(skin, airborne)).toEqual([]);
  });

  it("seals every frame: only the outline touches air", () => {
    expect(outlineSeals(skin)).toEqual([]);
  });

  it("draws every frame, in the thirteen creature indices only", () => {
    for (const { pose, index } of everyFrame(skin)) {
      const drawn = frame(skin, pose, index);
      expect(opaqueCount(drawn), `${pose} ${index}`).toBeGreaterThan(200);
      expect(Math.max(...drawn.indices), `${pose} ${index}`).toBeLessThanOrEqual(12);
    }
  });

  it("is told from the other species by its silhouette alone", () => {
    const own = frame(skin, "idle", 0).indices.map((value) => (value === transparent ? 0 : 1));
    for (const other of [
      kidSkin(),
      ...species.filter((each) => each.id !== id).map((each) => each.build()),
    ]) {
      const theirs = frame(other, "idle", 0).indices.map((value) =>
        value === transparent ? 0 : 1,
      );
      expect(differing(own, theirs), other.id).toBeGreaterThan(150);
    }
  });
});

describe("the drawing helpers", () => {
  it("centres and stacks symmetric rows", () => {
    expect(centered(7, "ccc")).toBe("..ccc..");
    expect(symmetric(5, [1, 3, 5], "c")).toEqual(["..c..", ".ccc.", "ccccc"]);
  });

  it("refuses a row that cannot centre", () => {
    expect(() => centered(6, "ccc")).toThrow("does not centre in 6 columns");
    expect(() => centered(3, "ccccc")).toThrow("does not centre in 3 columns");
  });

  it("stamps glyphs in place and refuses a stamp that leaves the drawing", () => {
    expect(stamped(["ccccc", "ccccc"], [[1, 1, "lsl"]])).toEqual(["ccccc", "clslc"]);
    expect(() => stamped(["ccc"], [[0, 2, "ll"]])).toThrow("leaves the drawing");
    expect(() => stamped(["ccc"], [[1, 0, "l"]])).toThrow("leaves the drawing");
  });
});
