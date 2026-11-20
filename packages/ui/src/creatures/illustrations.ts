import {
  type Illustration,
  type IllustrationPlacement,
  type IllustrationPoint,
  illustrationPixel,
  validateIllustration,
} from "@keywork-app/habitat/render";

export interface DecodedIllustration {
  readonly image: HTMLImageElement;
  alphaAt(placement: IllustrationPlacement, point: IllustrationPoint): number;
}

export function createIllustrationLibrary(
  decode: (src: string) => Promise<HTMLImageElement> = decodeImage,
  limits = { entries: 12, bytes: 32 * 1024 * 1024 },
) {
  const entries = new Map<string, Entry>();
  let bytes = 0;

  async function load(art: Illustration): Promise<DecodedIllustration> {
    validateIllustration(art);
    const key = JSON.stringify([art.src, art.source.width, art.source.height]);
    const held = entries.get(key);
    if (held) {
      entries.delete(key);
      entries.set(key, held);
      return held.result;
    }
    const reservation = art.source.width * art.source.height * 5;
    if (reservation > limits.bytes || limits.entries < 1)
      throw new RangeError("Illustration exceeds the decode budget");
    while (bytes + reservation > limits.bytes || entries.size >= limits.entries) {
      const oldest = [...entries].find(([, entry]) => entry.ready);
      if (!oldest) throw new RangeError("Illustration decoder is at capacity");
      entries.delete(oldest[0]);
      bytes -= oldest[1].bytes;
    }
    const result = Promise.resolve()
      .then(() => decode(art.src))
      .then((image) => {
        if (image.naturalWidth !== art.source.width || image.naturalHeight !== art.source.height)
          throw new RangeError("Illustration image dimensions differ from its manifest");
        return decoded(image);
      });
    const entry: Entry = { bytes: reservation, ready: false, result };
    entries.set(key, entry);
    bytes += reservation;
    try {
      const asset = await result;
      entry.ready = true;
      return asset;
    } catch (error) {
      entries.delete(key);
      bytes -= reservation;
      throw error;
    }
  }
  return { load };
}

export const illustrationLibrary = createIllustrationLibrary();

export function paintIllustration(
  context: CanvasRenderingContext2D,
  asset: DecodedIllustration,
  placement: IllustrationPlacement,
): void {
  const { crop, destination, mirrored } = placement;
  context.save();
  try {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.translate(destination.x + (mirrored ? destination.width : 0), destination.y);
    if (mirrored) context.scale(-1, 1);
    context.drawImage(
      asset.image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      destination.width,
      destination.height,
    );
  } finally {
    context.restore();
  }
}

interface Entry {
  readonly bytes: number;
  readonly result: Promise<DecodedIllustration>;
  ready: boolean;
}

async function decodeImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  return image;
}

function decoded(image: HTMLImageElement): DecodedIllustration {
  let alpha: Uint8Array | undefined;
  return {
    image,
    alphaAt(placement, point) {
      const pixel = illustrationPixel(placement, point);
      if (!pixel) return 0;
      alpha ??= sourceAlpha(image);
      return alpha[pixel.y * image.naturalWidth + pixel.x] ?? 0;
    },
  };
}

function sourceAlpha(image: HTMLImageElement): Uint8Array {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("A canvas is required to read illustration transparency");
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const alpha = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i += 1) alpha[i] = data[i * 4 + 3] ?? 0;
    return alpha;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
