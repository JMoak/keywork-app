import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  type Illustration,
  type IllustrationPlacement,
  validateIllustration,
} from "@keywork-app/habitat/render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { artworkFor } from "./artwork.ts";
import { createIllustrationLibrary, paintIllustration } from "./illustrations.ts";

const art: Illustration = {
  id: "ink",
  src: "ink.png",
  source: { width: 4, height: 1 },
  footprint: { width: 4, height: 1, groundLine: 1 },
  anchor: { x: 0.5, y: 1 },
  facing: "right",
};
const image = { naturalWidth: 4, naturalHeight: 1 } as HTMLImageElement;
const placement: IllustrationPlacement = {
  crop: { x: 1, y: 0, width: 2, height: 1 },
  destination: { x: 10, y: 20, width: 30, height: 15 },
  mirrored: true,
};

afterEach(() => vi.restoreAllMocks());

describe("the illustration library", () => {
  it.each(["folio", "tessera", "cairn"])(
    "matches the imported %s PNG's actual dimensions and full-color alpha channel",
    async (skin) => {
      const manifest = artworkFor(skin);
      if (!manifest) throw new Error("Missing creature artwork");
      validateIllustration(manifest);
      const file = basename(new URL(manifest.src, "https://app.invalid").pathname);
      expect(file).toBe(`${skin}.png`);
      const bytes = await readFile(join(import.meta.dirname, "assets", "illustrations", file));
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.toString("ascii", 12, 16)).toBe("IHDR");
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
        manifest.source.width,
        manifest.source.height,
      ]);
      expect(bytes[25]).toBe(6);
    },
  );

  it("deduplicates in-flight decoding across aliases and crops while honoring a new source URL", async () => {
    const decode = vi.fn(async () => image);
    const library = createIllustrationLibrary(decode);
    const [first, alias] = await Promise.all([
      library.load(art),
      library.load({ ...art, id: "detail", still: placement.crop }),
    ]);
    expect(alias).toBe(first);
    expect(await library.load(art)).toBe(first);
    expect(decode).toHaveBeenCalledExactlyOnceWith(art.src);
    expect(await library.load({ ...art, src: "revised.png" })).not.toBe(first);
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("releases reservations on decode failure or corrupt dimensions, allowing a later retry", async () => {
    const decode = vi
      .fn<() => Promise<HTMLImageElement>>()
      .mockRejectedValueOnce(new Error("file unavailable"))
      .mockResolvedValueOnce({ naturalWidth: 3, naturalHeight: 1 } as HTMLImageElement)
      .mockResolvedValueOnce(image);
    const library = createIllustrationLibrary(decode, { entries: 1, bytes: 20 });
    await expect(library.load(art)).rejects.toThrow("file unavailable");
    await expect(library.load(art)).rejects.toThrow("dimensions differ");
    expect((await library.load(art)).image).toBe(image);
    await expect(library.load({ ...art, source: { width: 2049, height: 1 } })).rejects.toThrow();
    expect(decode).toHaveBeenCalledTimes(3);
  });

  it.each([
    { entries: 2, bytes: 100 },
    { entries: 10, bytes: 40 },
  ])("retains recently used images within the entry and byte limits %o", async (limits) => {
    const library = createIllustrationLibrary(async () => image, limits);
    const other = { ...art, src: "other.png" };
    const kept = await library.load(art);
    const expired = await library.load(other);
    await library.load(art);
    await library.load({ ...art, src: "third.png" });
    expect(await library.load(art)).toBe(kept);
    expect(await library.load(other)).not.toBe(expired);
  });

  it("reserves capacity before starting native decodes and will not evict a shared pending load", async () => {
    let complete: ((image: HTMLImageElement) => void) | undefined;
    const decode = vi.fn(
      () =>
        new Promise<HTMLImageElement>((resolve) => {
          complete = resolve;
        }),
    );
    const library = createIllustrationLibrary(decode, { entries: 2, bytes: 20 });
    const first = library.load(art);
    const duplicate = library.load(art);
    await expect(library.load({ ...art, src: "other.png" })).rejects.toThrow("capacity");
    expect(decode).toHaveBeenCalledTimes(1);
    complete?.(image);
    expect(await duplicate).toBe(await first);
    const next = library.load({ ...art, src: "other.png" });
    await Promise.resolve();
    complete?.(image);
    expect((await next).image).toBe(image);
    await expect(library.load({ ...art, source: { width: 5, height: 1 } })).rejects.toThrow(
      "budget",
    );
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it("paints native colors with the crop and reflection used by hit testing, without reading alpha", async () => {
    const read = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    const asset = await createIllustrationLibrary(async () => image).load(art);
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    };
    paintIllustration(context as unknown as CanvasRenderingContext2D, asset, placement);
    expect(context.translate).toHaveBeenCalledWith(40, 20);
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
    expect(context.drawImage).toHaveBeenCalledWith(image, 1, 0, 2, 1, 0, 0, 30, 15);
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe("high");
    expect(context.restore).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    context.drawImage.mockImplementation(() => {
      throw new Error("lost canvas");
    });
    expect(() =>
      paintIllustration(context as unknown as CanvasRenderingContext2D, asset, placement),
    ).toThrow("lost canvas");
    expect(context.restore).toHaveBeenCalledTimes(2);
  });

  it("samples native partial transparency lazily, reusing one source plane for crops, sizes and facings", async () => {
    const rgba = new Uint8ClampedArray(16);
    rgba[7] = 8;
    rgba[11] = 126;
    rgba[15] = 255;
    const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: rgba })) };
    const read = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const asset = await createIllustrationLibrary(async () => image).load(art);
    expect(asset.alphaAt(placement, { x: 9.99, y: 20 })).toBe(0);
    expect(read).not.toHaveBeenCalled();
    expect(asset.alphaAt(placement, { x: 10, y: 20 })).toBe(126);
    expect(asset.alphaAt(placement, { x: 39.99, y: 34.99 })).toBe(8);
    expect(asset.alphaAt({ ...placement, mirrored: false }, { x: 10, y: 20 })).toBe(8);
    const full = {
      ...placement,
      crop: { x: 0, y: 0, width: 4, height: 1 },
      destination: { x: 0, y: 0, width: 400, height: 100 },
      mirrored: false,
    };
    expect(asset.alphaAt(full, { x: 10, y: 20 })).toBe(0);
    expect(asset.alphaAt(full, { x: 399, y: 99 })).toBe(255);
    expect(context.getImageData).toHaveBeenCalledExactlyOnceWith(0, 0, 4, 1);
  });
});
