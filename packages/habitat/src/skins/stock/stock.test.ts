import { describe, expect, it } from "vitest";
import { type PoseName, poseNames, type Skin } from "../../pose/skin.ts";
import { mirrorFrame, opaqueCount, sliceSkin } from "../atlas.ts";
import { carterAirborne, carterSkin } from "../carter/index.ts";
import { loadSkin, skinIds } from "../index.ts";
import { joinerAirborne, joinerSkin } from "../joiner/index.ts";
import { kidSkin } from "../kid/index.ts";
import {
  groundBase,
  groundHighlight,
  groundLight,
  groundShadow,
  identityHighlight,
  lamplight,
  outline,
  transparent,
} from "../legend.ts";
import { groundContact, outlineSeals, validateAtlas } from "../loader.ts";
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

const groundRamp = new Set([groundShadow, groundBase, groundLight, groundHighlight]);

function frame(skin: Skin, pose: PoseName, index: number) {
  return sliceSkin(skin).frame(pose, index);
}

function everyFrame(skin: Skin): { pose: PoseName; index: number }[] {
  return poseNames.flatMap((pose) =>
    Array.from({ length: skin.rows[pose].frames }, (_, index) => ({ pose, index })),
  );
}

function topOpaqueRow(skin: Skin, pose: PoseName, index: number): number {
  const { width, indices } = frame(skin, pose, index);
  return Math.floor(indices.findIndex((value) => value !== transparent) / width);
}

function count(skin: Skin, pose: PoseName, index: number, wanted: (value: number) => boolean) {
  return frame(skin, pose, index).indices.reduce((sum, value) => sum + (wanted(value) ? 1 : 0), 0);
}

function differing(one: Uint8Array, other: Uint8Array): number {
  return one.reduce((sum, value, at) => sum + (value === other[at] ? 0 : 1), 0);
}

describe("the registry", () => {
  it("offers the carter and the joiner beside the kid, each loading sound", () => {
    expect(skinIds()).toEqual(["kid", "carter", "joiner", "placeholder"]);
    for (const { id } of species) {
      const loaded = loadSkin(id);
      expect(loaded.ok, id).toBe(true);
    }
  });
});

describe.each(species)("the $id", ({ id, build, airborne }) => {
  const skin = build();

  it("builds the same bytes twice and passes atlas validation", () => {
    expect(skin.id).toBe(id);
    expect(build().atlas.indices).toEqual(skin.atlas.indices);
    expect(validateAtlas(skin)).toEqual([]);
  });

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

  it("keeps the crown clear for the glyph while it stands and waits", () => {
    for (const pose of ["idle", "wait", "work", "read"] as const) {
      for (let index = 0; index < skin.rows[pose].frames; index += 1) {
        expect(topOpaqueRow(skin, pose, index), `${pose} ${index}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("never draws past the top of the cell, outline included", () => {
    for (const { pose, index } of everyFrame(skin)) {
      const drawn = frame(skin, pose, index);
      const topRow = drawn.indices.subarray(0, drawn.width);
      expect(
        [...topRow].every((value) => value === transparent || value === outline),
        `${pose} ${index}`,
      ).toBe(true);
    }
  });

  it("mirrors walk-left into walk-right and looks eight distinct ways", () => {
    for (let index = 0; index < skin.rows["walk-left"].frames; index += 1) {
      const left = frame(skin, "walk-left", index);
      const right = frame(skin, "walk-right", index);
      const mirrored = mirrorFrame(left).indices;
      expect(differing(right.indices.subarray(1), mirrored.subarray(0, -1)), `${index}`).toBe(0);
    }
    const gazes = new Set(
      Array.from({ length: 8 }, (_, index) => frame(skin, "look", index).indices.join("")),
    );
    expect(gazes.size).toBe(8);
  });

  it("breathes and blinks at idle and returns to the model pose", () => {
    const model = frame(skin, "idle", 0).indices;
    expect(frame(skin, "idle", 5).indices).toEqual(model);
    for (const index of [1, 2, 3]) {
      expect(differing(frame(skin, "idle", index).indices, model), `${index}`).toBeGreaterThan(0);
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

describe("the carter's signals", () => {
  const skin = carterSkin();

  it("stands tall-eared at idle and lays its ears flat when blocked", () => {
    expect(topOpaqueRow(skin, "idle", 0)).toBeLessThanOrEqual(3);
    expect(topOpaqueRow(skin, "blocked", 0)).toBeGreaterThanOrEqual(12);
  });

  it("carries the crate in its panniers: more ground-ramp ink than at idle", () => {
    const worn = (pose: PoseName) => count(skin, pose, 0, (value) => groundRamp.has(value));
    expect(worn("carry")).toBeGreaterThan(worn("idle") + 40);
  });

  it("naps on its feet, inside the idle footprint, with its ears out sideways", () => {
    const widthOf = (pose: PoseName): number => {
      const { width, indices } = frame(skin, pose, 0);
      const columns = [...indices.keys()]
        .filter((at) => indices[at] !== transparent)
        .map((at) => at % width);
      return Math.max(...columns) - Math.min(...columns) + 1;
    };
    expect(topOpaqueRow(skin, "nap", 0)).toBeGreaterThan(topOpaqueRow(skin, "idle", 0));
    expect(widthOf("nap")).toBeLessThanOrEqual(widthOf("idle") + 4);
  });
});

describe("the joiner's signals", () => {
  const skin = joinerSkin();

  it("wears the stripe from crown to nose in the highlight tone, never across the eyes", () => {
    const drawn = frame(skin, "idle", 0);
    const centre = Array.from(
      { length: 15 },
      (_, row) => drawn.indices[(10 + row) * drawn.width + 24],
    );
    expect(centre.every((value) => value === identityHighlight)).toBe(true);
    const eyeRow = [...drawn.indices.subarray(16 * drawn.width, 17 * drawn.width)];
    expect(eyeRow.slice(16, 22)).not.toContain(identityHighlight - 1);
    expect(eyeRow.slice(22, 27).every((value) => value === identityHighlight)).toBe(true);
  });

  it("tucks a pencil behind its ear to read and carve, and at no other time", () => {
    const lit = (pose: PoseName) => count(skin, pose, 0, (value) => value === lamplight);
    expect(lit("read")).toBeGreaterThan(0);
    expect(lit("carve")).toBeGreaterThan(0);
    expect(lit("idle")).toBe(0);
    expect(lit("wait")).toBe(0);
  });

  it("covers its eyes when blocked, then drops its paws to its lap", () => {
    const hiding = frame(skin, "blocked", 0).indices;
    const dropped = frame(skin, "blocked", 4).indices;
    expect(differing(hiding, dropped)).toBeGreaterThan(100);
    expect(frame(skin, "blocked", 1).indices).toEqual(hiding);
  });

  it("naps as one low round shape, lower than half the cell", () => {
    expect(topOpaqueRow(skin, "nap", 0)).toBeGreaterThanOrEqual(36);
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
