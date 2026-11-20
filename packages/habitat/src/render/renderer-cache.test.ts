import { describe, expect, it } from "vitest";
import { type IndexedBitmap, poseNames, type Skin } from "../pose/skin.ts";
import { mirrorFrame, sliceSkin } from "../skins/atlas.ts";
import { folioSkin } from "../skins/folio/index.ts";
import {
  alphaMask,
  createRasterSurface,
  mirrors,
  type PaintSurface,
  paintIndexed,
} from "./raster.ts";
import { createRenderer, type RenderPose } from "./renderer.ts";

describe("indexed frame painting and alpha retention", () => {
  const skin = folioSkin();
  const coat = ["#112233", "#dec790", "#997453", "transparent", "#34685e", "#ffeeba"];
  const full = Array.from({ length: 16 }, (_, i) => `#${(0x224466 + i * 0x080804).toString(16)}`);
  const rest: RenderPose = { clip: "idle", frame: 0, facing: "right" };

  it("matches the reference pixels for changing palettes, facing, scale, offsets and directional rows", () => {
    const render = createRenderer(skin);
    const sliced = sliceSkin(skin);
    for (const clip of ["idle", "blocked", "look", "walk-right"] as const) {
      for (const facing of ["left", "right"] as const) {
        const cell = sliced.frame(clip, 2);
        const expected = mirrors(clip, facing) ? mirrorFrame(cell) : cell;
        for (const [palette, scale] of [
          [coat, 1],
          [full, 3],
        ] as const) {
          const frame = render({ clip, facing, frame: 2 }, palette, { scale });
          const actual = createRasterSurface(frame.width + 3, frame.height + 1);
          const reference = createRasterSurface(frame.width + 3, frame.height + 1);
          frame.paint(actual, 3, -1);
          paintIndexed(reference, expected, palette, scale, 3, -1);
          expect(
            Buffer.from(actual.raster().rgba).equals(Buffer.from(reference.raster().rgba)),
          ).toBe(true);
          expect(
            Buffer.from(frame.alpha).equals(Buffer.from(alphaMask(expected, scale).bits)),
          ).toBe(true);
        }
      }
    }
  });

  it("shares normalized frames across renderers and keeps the slicer's clamping behavior", () => {
    const first = createRenderer(skin);
    const next = createRenderer(skin);
    const last = skin.rows.idle.frames - 1;
    for (const [input, normalized] of [
      [-Infinity, 0],
      [Number.NaN, 0],
      [1.9, 1],
      [last + 80000, last],
      [Infinity, last],
    ] as const) {
      const reference = first({ ...rest, facing: "left", frame: normalized }, coat, { scale: 2 });
      const frame = next({ ...rest, facing: "left", frame: input }, full, { scale: 1.9 });
      expect(frame.indexed).toBe(reference.indexed);
      expect(frame.alpha).toBe(reference.alpha);
    }
    const look = first({ ...rest, clip: "look" }, coat, { scale: 1 });
    expect(next({ ...rest, clip: "look", facing: "left" }, full, { scale: 1 }).alpha).toBe(
      look.alpha,
    );
  });

  it("reuses the compiled paint across theme, scale and renderer changes without reading source pixels", () => {
    const unique = { ...skin, id: "ink-read-test" };
    const cell = sliceSkin(unique).frame("idle", 0);
    const original = cell.indices;
    let reads = 0;
    const traced = new Proxy(original, {
      get(target, key) {
        if (typeof key === "string" && /^\d+$/.test(key)) reads += 1;
        return Reflect.get(target, key, target);
      },
    });
    Object.defineProperty(cell, "indices", { configurable: true, value: traced });
    try {
      createRenderer(unique)(rest, coat, { scale: 1 }).paint(counter());
      expect(reads).toBeGreaterThan(0);
      reads = 0;
      const palette: string[] = [...full];
      const frame = createRenderer(unique)(rest, palette, { scale: 4 });
      frame.paint(counter());
      palette.fill("transparent");
      const blank = counter();
      frame.paint(blank);
      expect(blank.draws).toBe(0);
      expect(frame.alpha.includes(1)).toBe(true);
      expect(reads).toBe(0);
    } finally {
      Object.defineProperty(cell, "indices", { configurable: true, value: original });
    }
  });

  it("allocates scaled masks only on demand and evicts by bytes without invalidating a caller's frame", () => {
    const render = createRenderer({ ...skin, id: "mask-byte-test" });
    const draw = (frame: number) => render({ ...rest, frame }, coat, { scale: 32 });
    const first = draw(0);
    const bits = first.alpha;
    const next = draw(1);
    next.paint(counter());
    expect(draw(0).alpha).toBe(bits);
    expect(next.alpha.byteLength).toBe(48 * 52 * 32 * 32);
    expect(draw(0).alpha).not.toBe(bits);
    expect(first.alpha).toBe(bits);
  });

  it("keeps 64 recently used small masks and evicts the least recently read one", () => {
    const unique = { ...skin, id: "mask-count-test" };
    const render = createRenderer(unique);
    const poses = poseNames.flatMap((clip) =>
      Array.from({ length: skin.rows[clip].frames }, (_, frame) => ({ ...rest, clip, frame })),
    );
    const alpha = (at: number) => render(poses[at] as RenderPose, coat, { scale: 1 }).alpha;
    const first = alpha(0);
    const second = alpha(1);
    for (let i = 2; i < 64; i += 1) alpha(i);
    expect(alpha(0)).toBe(first);
    alpha(64);
    expect(alpha(0)).toBe(first);
    expect(alpha(1)).not.toBe(second);
  });

  it.each([
    { name: "entry count", side: 4, distinct: 512 },
    { name: "retained bytes", side: 128, distinct: 102 },
  ])("bounds the shared drawing cache by $name", ({ side, distinct }) => {
    const width = side * 8;
    const height = side * poseNames.length;
    const indices = Uint8Array.from({ length: width * height }, (_, i) => 1 + (i % 2));
    const fixture = {
      ...skin,
      cell: { width: side, height: side },
      atlas: { width, height, indices },
      groundLine: side,
    };
    const first = createRenderer({ ...fixture, id: `first-${side}` });
    const mirrored = { ...rest, facing: "left" } as const;
    const kept = first(mirrored, full, { scale: 1 }).indexed;
    let inserted = 0;
    for (let batch = 0; inserted < distinct; batch += 1) {
      const render = createRenderer({ ...fixture, id: `batch-${side}-${batch}` });
      for (const clip of poseNames) {
        for (let frame = 0; frame < skin.rows[clip].frames && inserted < distinct; frame += 1) {
          render({ ...rest, clip, frame }, full, { scale: 1 });
          inserted += 1;
        }
      }
    }
    const reloaded = first(mirrored, full, { scale: 1 }).indexed;
    expect(reloaded).not.toBe(kept);
    expect(reloaded.indices).toEqual(kept.indices);
  });

  it("preserves long runs and full-width coordinates in larger cells", () => {
    const cell = { width: 300, height: 3 };
    const width = 8 * cell.width;
    const atlas: IndexedBitmap = {
      width,
      height: poseNames.length * cell.height,
      indices: new Uint8Array(width * cell.height * poseNames.length),
    };
    atlas.indices.fill(2, 0, 300);
    atlas.indices.fill(4, width + 291, width + 300);
    const larger: Skin = { ...skin, id: "long-run", cell, atlas, groundLine: 3 };
    const paint = counter();
    createRenderer(larger)(rest, full, { scale: 2 }).paint(paint);
    expect(paint.rects).toEqual([
      [0, 0, 600, 2],
      [582, 2, 18, 2],
    ]);
  });

  it("rejects unbounded dimensions before allocation and retains finite scale rounding", () => {
    const render = createRenderer(skin);
    for (const scale of [Infinity, -Infinity, NaN, Number.MAX_SAFE_INTEGER, 1000])
      expect(() => render(rest, coat, { scale })).toThrow(RangeError);
    expect(render(rest, coat, { scale: -3 }).width).toBe(48);
    expect(render(rest, coat, { scale: 2.5 }).height).toBe(156);
  });
});

function counter(): PaintSurface & { draws: number; rects: number[][] } {
  return {
    fillStyle: "",
    draws: 0,
    rects: [],
    fillRect(...rect) {
      this.draws += 1;
      this.rects.push(rect);
    },
    clearRect() {},
  };
}
