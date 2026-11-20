import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultPaletteRoles,
  type PoseName,
  poseNames,
  type Row,
  type Skin,
} from "../pose/skin.ts";
import { clearSliceCache, contentHash, sliceCacheSize, sliceSkin } from "./atlas.ts";

beforeEach(clearSliceCache);

describe("atlas cache identity", () => {
  it("clamps identical pixels using each skin's own row declaration in either load order", () => {
    const full = sample();
    const short = {
      ...full,
      rows: { ...full.rows, idle: { frames: 1, ms: [100], loop: true } },
    };
    for (const ordered of [
      [full, short],
      [short, full],
    ]) {
      clearSliceCache();
      ordered.forEach(sliceSkin);
      expect([...sliceSkin(full).frame("idle", 1).indices]).toEqual([2, 2]);
      expect([...sliceSkin(short).frame("idle", 1).indices]).toEqual([1, 1]);
    }
  });

  it("preserves distinct manifest identity even when pixels and frame counts match", () => {
    const first = sample("sample", { width: 2, height: 2 });
    const variants: Skin[] = [
      { ...first, id: "another" },
      { ...first, displayName: "Another name" },
      { ...first, groundLine: 2 },
      { ...first, material: "leaf" },
      { ...first, material: "porcelain" },
      { ...first, material: "sandstone" },
      { ...first, palette: { ...first.palette, identity: [2, 3, 4] } },
      { ...first, palette: { ...first.palette, ground: [6, 7, 8] } },
      { ...first, palette: { ...first.palette, outline: 8 } },
      { ...first, palette: { ...first.palette, accent: [10, 11] } },
      { ...first, gaze: { row: poseNames.indexOf("look"), directions: 8 } },
      { ...first, rows: { ...first.rows, idle: { ...first.rows.idle, ms: [200, 300] } } },
      {
        ...first,
        rows: { ...first.rows, idle: { ...first.rows.idle, loop: false, fallback: "work" } },
      },
    ];
    const original = sliceSkin(first);
    for (const variant of variants) {
      const sliced = sliceSkin(variant);
      expect(sliced === original).toBe(false);
      expect(sliced.skin).toEqual(variant);
    }
  });

  it("shares equivalent manifests regardless of row object insertion order", () => {
    const first = sample();
    const reversed = {
      ...sample(),
      rows: Object.fromEntries(Object.entries(first.rows).reverse()) as Skin["rows"],
    };
    expect(sliceSkin(first)).toBe(sliceSkin(reversed));
    expect(sliceCacheSize()).toBe(1);
  });

  it("compares actual pixels when the short content hashes collide", () => {
    const first = sample();
    const second = sample();
    first.atlas.indices.set([4, 8, 10, 13, 2, 2, 13, 2]);
    second.atlas.indices.set([5, 15, 12, 8, 14, 15, 14, 13]);
    expect(contentHash(first.atlas)).toBe(contentHash(second.atlas));
    expect(sliceSkin(first) === sliceSkin(second)).toBe(false);
    expect([...sliceSkin(first).frame("idle", 0).indices]).toEqual([4, 8]);
    expect([...sliceSkin(second).frame("idle", 0).indices]).toEqual([5, 15]);
  });

  it("normalizes fractional and non-finite frame requests to a finite set of cells", () => {
    const sliced = sliceSkin(sample());
    expect(sliced.frame("idle", 0.75)).toBe(sliced.frame("idle", 0));
    expect(sliced.frame("idle", 1.75)).toBe(sliced.frame("idle", 1));
    expect(sliced.frame("idle", Number.NaN)).toBe(sliced.frame("idle", 0));
    expect(sliced.frame("idle", Number.NEGATIVE_INFINITY)).toBe(sliced.frame("idle", 0));
    expect(sliced.frame("idle", Number.POSITIVE_INFINITY)).toBe(sliced.frame("idle", 1));
  });
});

describe("atlas cache retention", () => {
  it("retains at most 32 recent skins and refreshes an identity hit's recency", () => {
    const first = sample("skin-0");
    const oldest = sample("skin-1");
    const kept = sliceSkin(first);
    const removed = sliceSkin(oldest);
    for (let index = 2; index < 32; index += 1) sliceSkin(sample(`skin-${index}`));
    expect(sliceCacheSize()).toBe(32);
    expect(sliceSkin(first)).toBe(kept);
    sliceSkin(sample("skin-32"));
    expect(sliceCacheSize()).toBe(32);
    expect(sliceSkin(sample("skin-0"))).toBe(kept);
    expect(sliceSkin(sample("skin-1")) === removed).toBe(false);
    expect(sliceCacheSize()).toBe(32);
  });

  it("reserves room for both the atlas and all of its eventual frame pixels within 32 MiB", () => {
    for (let index = 0; index < 4; index += 1) {
      sliceSkin(sample(`large-${index}`, { width: 256, height: 128 }));
    }
    expect(sliceCacheSize()).toBeLessThanOrEqual(3);
    expect(sliceCacheSize()).toBeGreaterThan(0);
  });

  it("slices oversized skins without retaining them in the shared cache", () => {
    const skin = sample("oversized", { width: 512, height: 256 });
    const sliced = sliceSkin(skin);
    expect(sliced.frame("idle", 0).indices[0]).toBe(1);
    expect(sliceCacheSize()).toBe(0);
    expect(sliceSkin(skin)).toBe(sliced);
  });

  it("clears both content and identity lookups", () => {
    const skin = sample();
    const previous = sliceSkin(skin);
    clearSliceCache();
    expect(sliceCacheSize()).toBe(0);
    expect(sliceSkin(skin)).not.toBe(previous);
    expect(sliceCacheSize()).toBe(1);
  });
});

function sample(id = "sample", cell = { width: 2, height: 1 }): Skin {
  const columns = 8;
  const width = cell.width * columns;
  const height = cell.height * poseNames.length;
  const indices = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      indices.fill(
        column + 1,
        row * width + column * cell.width,
        row * width + (column + 1) * cell.width,
      );
    }
  }
  return {
    id,
    displayName: "Sample",
    cell,
    atlas: { width, height, indices },
    palette: defaultPaletteRoles,
    rows: Object.fromEntries(
      poseNames.map((pose): [PoseName, Row] => {
        const frames = pose === "look" ? 8 : 2;
        return [pose, { frames, ms: Array.from({ length: frames }, () => 100), loop: true }];
      }),
    ) as Skin["rows"],
    groundLine: 1,
  };
}
