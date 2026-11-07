import { describe, expect, it } from "vitest";
import {
  defaultCell,
  defaultPaletteRoles,
  fallbackOf,
  poseNames,
  referenceRows,
  rowDuration,
  type Skin,
  validateRows,
  validateSkin,
} from "./skin.ts";

describe("the reference rows", () => {
  it("name every pose, time every frame, and hold the last frame as a beat", () => {
    expect(validateRows(referenceRows)).toEqual([]);
    for (const name of poseNames) {
      const row = referenceRows[name];
      const last = row.ms[row.frames - 1] ?? 0;
      const first = row.ms[0] ?? 0;
      expect(last, name).toBeGreaterThanOrEqual(first);
      if (name !== "look") expect(last / first, name).toBeGreaterThanOrEqual(1.14);
    }
  });

  it("keep the calm idle loop and the Codex cycle lengths", () => {
    expect(rowDuration(referenceRows.idle)).toBe(6600);
    expect(rowDuration(referenceRows.work)).toBe(820);
    expect(rowDuration(referenceRows.wait)).toBe(1010);
    expect(rowDuration(referenceRows.celebrate)).toBe(1030);
    expect(rowDuration(referenceRows.blocked)).toBe(1220);
    expect(rowDuration(referenceRows["walk-left"])).toBe(1060);
  });

  it("send every one-shot back to a loop", () => {
    expect(fallbackOf(referenceRows, "celebrate")).toBe("idle");
    expect(fallbackOf(referenceRows, "ring")).toBe("wait");
    expect(fallbackOf(referenceRows, "stumble")).toBe("work");
    expect(fallbackOf(referenceRows, "work")).toBe("work");
  });

  it("refuse rows that lie about their frames or never settle", () => {
    const broken = {
      ...referenceRows,
      wave: { frames: 4, ms: [140, 140], loop: false, fallback: "greet" as const },
      greet: { frames: 4, ms: [140, 140, 140, 280], loop: false, fallback: "wave" as const },
      nap: { frames: 0, ms: [], loop: true },
    };
    expect(validateRows(broken)).toEqual([
      "nap: a row needs at least one frame",
      "wave: 2 timings for 4 frames",
      "wave: its fallbacks never reach a loop",
      "greet: its fallbacks never reach a loop",
    ]);
    const unnamed = { ...referenceRows, stretch: { frames: 1, ms: [100], loop: false } };
    expect(validateRows(unnamed)).toEqual(["stretch: a one-shot names its fallback"]);
    const nowhere = {
      ...referenceRows,
      stretch: { frames: 1, ms: [100], loop: false, fallback: "gone" as "idle" },
    };
    expect(validateRows(nowhere)).toEqual([
      "stretch: fallback gone is not a row",
      "stretch: its fallbacks never reach a loop",
    ]);
  });
});

describe("a skin", () => {
  const columns = 8;
  const skin: Skin = {
    id: "ridge-tinker",
    displayName: "Ridge tinker",
    cell: defaultCell,
    atlas: {
      width: defaultCell.width * columns,
      height: defaultCell.height * poseNames.length,
      indices: new Uint8Array(defaultCell.width * columns * defaultCell.height * poseNames.length),
    },
    palette: defaultPaletteRoles,
    rows: referenceRows,
    groundLine: 48,
  };

  it("passes when the atlas matches the declared grid", () => {
    expect(validateSkin(skin)).toEqual([]);
  });

  it("is rejected when the atlas, the palette or the ground line disagree with the manifest", () => {
    const indices = new Uint8Array(10);
    indices[3] = 16;
    expect(
      validateSkin({
        ...skin,
        id: "Ridge_Tinker",
        atlas: { width: 10, height: 1, indices },
        groundLine: 0,
      }),
    ).toEqual([
      "atlas width 10 is not 8 cells of 48",
      "atlas height 1 is not 21 rows of 52",
      "atlas uses a palette index at or above 16",
      "ground line 0 is outside the cell",
      "skin id Ridge_Tinker is not kebab-case",
    ]);
    expect(validateSkin({ ...skin, atlas: { ...skin.atlas, indices: new Uint8Array(3) } })).toEqual(
      ["atlas holds 3 indices for a 384x1092 grid"],
    );
  });
});
