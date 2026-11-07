import { describe, expect, it } from "vitest";
import {
  type CapturedFrame,
  captureSourceFor,
  type FramePoint,
  hexOf,
  judgeTransparency,
  marginSampleDip,
  plateRimDip,
  probePlate,
  probePointsFor,
  type Rect,
  type Rgb,
  readCapture,
  readingWhy,
  samplesOfBitmap,
  selfTestNeeded,
  uniformlyDimmed,
} from "./self-test.ts";
import { chromeMargin, companionWindowOptions } from "./window.ts";

describe("judgeTransparency", () => {
  it("reads the probe plate through a clear window", () => {
    expect(judgeTransparency([probePlate, { r: 10, g: 240, b: 12 }])).toBe("clear");
  });

  it("calls a black or grey box opaque", () => {
    expect(judgeTransparency([{ r: 0, g: 0, b: 0 }])).toBe("opaque");
    expect(
      judgeTransparency([
        { r: 128, g: 128, b: 128 },
        { r: 40, g: 44, b: 38 },
      ]),
    ).toBe("opaque");
  });

  it("stays unknown on anything else, including no samples", () => {
    expect(judgeTransparency([])).toBe("unknown");
    expect(judgeTransparency([probePlate, { r: 0, g: 0, b: 0 }])).toBe("unknown");
    expect(judgeTransparency([{ r: 200, g: 30, b: 30 }])).toBe("unknown");
  });
});

describe("selfTestNeeded", () => {
  it("runs on first launch, after a GPU change, and after an inconclusive run", () => {
    expect(selfTestNeeded(undefined, "a")).toBe(true);
    expect(selfTestNeeded({ result: "clear", gpu: "a", at: "t" }, "a")).toBe(false);
    expect(selfTestNeeded({ result: "opaque", gpu: "a", at: "t" }, "b")).toBe(true);
    expect(selfTestNeeded({ result: "unknown", gpu: "a", at: "t" }, "a")).toBe(true);
  });
});

describe("samples", () => {
  it("reads BGRA pixels and names the plate in hex", () => {
    const bgra = new Uint8Array([1, 2, 3, 255, 0, 255, 0, 255]);
    expect(
      samplesOfBitmap(bgra, 2, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    ).toEqual([
      { r: 3, g: 2, b: 1 },
      { r: 0, g: 255, b: 0 },
    ]);
    expect(hexOf(probePlate)).toBe("#00ff00");
  });
});

const display = {
  bounds: { x: 0, y: 0, width: 400, height: 300 },
  workArea: { x: 0, y: 0, width: 400, height: 260 },
};
const companionBounds = { x: 200, y: 100, width: 144, height: 120 };
const points = probePointsFor(companionBounds, display, 1);

function capture(paint: (x: number, y: number) => Rgb): CapturedFrame {
  return bitmap(display.bounds.width, display.bounds.height, paint);
}

function insideCompanion(x: number, y: number): boolean {
  return (
    x >= companionBounds.x &&
    y >= companionBounds.y &&
    x < companionBounds.x + companionBounds.width &&
    y < companionBounds.y + companionBounds.height
  );
}

function dim(color: Rgb, alpha: number): Rgb {
  const keep = 1 - alpha;
  return {
    r: Math.round(color.r * keep),
    g: Math.round(color.g * keep),
    b: Math.round(color.b * keep),
  };
}

const black: Rgb = { r: 0, g: 0, b: 0 };
const wallpaper: Rgb = { r: 40, g: 90, b: 160 };

describe("readCapture", () => {
  it("reads clear when the plate shows through the companion's margin", () => {
    expect(
      readCapture(
        capture(() => probePlate),
        points,
      ),
    ).toEqual({
      verdict: "clear",
      why: readingWhy.clear,
    });
  });

  it("reads opaque when the margin is black over a plate that reads true", () => {
    const frame = capture((x, y) => (insideCompanion(x, y) ? black : probePlate));
    expect(readCapture(frame, points)).toEqual({ verdict: "opaque", why: readingWhy.opaque });
  });

  it("is inconclusive, never opaque, when a system dim layer darkens the whole capture", () => {
    const behindDim = (x: number, y: number): Rgb => (insideCompanion(x, y) ? black : probePlate);
    for (const alpha of [0.4, 0.6, 0.85, 1]) {
      const frame = capture((x, y) => dim(behindDim(x, y), alpha));
      expect(readCapture(frame, points)).toEqual({ verdict: "unknown", why: readingWhy.dimmed });
    }
    expect(uniformlyDimmed([dim(probePlate, 0.5), dim(probePlate, 0.52)])).toBe(true);
    expect(uniformlyDimmed([dim(probePlate, 0.1), dim(probePlate, 0.9)])).toBe(false);
  });

  it("is inconclusive when something covers the plate", () => {
    const frame = capture((x, y) => (insideCompanion(x, y) ? black : wallpaper));
    expect(readCapture(frame, points)).toEqual({ verdict: "unknown", why: readingWhy.covered });
  });

  it("is inconclusive when the capture is denied or empty", () => {
    expect(readCapture(undefined, points)).toEqual({ verdict: "unknown", why: readingWhy.denied });
    expect(readCapture({ bgra: new Uint8Array(), width: 0, height: 0 }, points)).toEqual({
      verdict: "unknown",
      why: readingWhy.denied,
    });
  });

  it("samples the plate rim only inside the work area and scales to the capture", () => {
    const atBottom = probePointsFor({ x: 200, y: 140, width: 144, height: 120 }, display, 1);
    expect(atBottom.reference).toHaveLength(3);
    const doubled = probePointsFor(companionBounds, display, 2);
    expect(doubled.probe[0]).toEqual({ x: 416, y: 216 });
    expect(doubled.reference).toHaveLength(4);
  });
});

describe("why the shown window read opaque on moak-main", () => {
  const consoleRoot: Rgb = { r: 49, g: 51, b: 68 };
  const overPlate = (margin: Rgb) =>
    capture((x, y) => (insideCompanion(x, y) ? margin : probePlate));

  it("the renderer's own background: the console's root paints the margin, and cleared it reads clear", () => {
    expect(readCapture(overPlate(consoleRoot), points)).toEqual({
      verdict: "opaque",
      why: readingWhy.opaque,
    });
    expect(readCapture(overPlate(probePlate), points)).toEqual({
      verdict: "clear",
      why: readingWhy.clear,
    });
  });

  it("not a composition frame: Windows draws no frame, border, shadow or corner over the probe band", () => {
    const options = companionWindowOptions({
      platform: "win32",
      bounds: companionBounds,
      preload: "preload/companion.js",
    });
    expect(options).toMatchObject({
      frame: false,
      thickFrame: false,
      hasShadow: false,
      roundedCorners: false,
      transparent: true,
    });
    for (const point of points.probe) {
      expect(point.x - companionBounds.x).toBeGreaterThanOrEqual(marginSampleDip);
      expect(point.y - companionBounds.y).toBeGreaterThanOrEqual(marginSampleDip);
    }
  });

  it("not the plate under the window: the reference sits on the rim beside it, the probe in the unpainted margin", () => {
    const plate = grown(companionBounds, plateRimDip);
    for (const point of points.reference) {
      expect(within(point, companionBounds)).toBe(false);
      expect(within(point, plate)).toBe(true);
    }
    for (const point of points.probe) {
      expect(within(point, companionBounds)).toBe(true);
      expect(point.x).toBeLessThan(companionBounds.x + chromeMargin);
    }
  });

  it("not the wrong display: the capture is the companion's own display, scaled at 133 percent", () => {
    const sources = [{ display_id: "7" }, { display_id: "9" }];
    expect(captureSourceFor(sources, 9)).toBe(sources[1]);
    expect(captureSourceFor(sources, 3)).toBeUndefined();
    expect(captureSourceFor([{ display_id: "" }], 3)).toEqual({ display_id: "" });

    const right = {
      bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
      workArea: { x: 1920, y: 0, width: 1920, height: 1044 },
    };
    const companion = { x: 3600, y: 800, width: 144, height: 180 };
    const ratio = 4 / 3;
    const scaled = probePointsFor(companion, right, ratio);
    const frame = (margin: Rgb): CapturedFrame =>
      bitmap(2560, 1440, (x, y) => {
        const dip = { x: x / ratio + right.bounds.x, y: y / ratio + right.bounds.y };
        return within(dip, companion) ? margin : probePlate;
      });
    expect(readCapture(frame(probePlate), scaled).verdict).toBe("clear");
    expect(readCapture(frame(consoleRoot), scaled).verdict).toBe("opaque");
  });
});

function grown(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  };
}

function within(point: FramePoint, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}

function bitmap(
  width: number,
  height: number,
  paint: (x: number, y: number) => Rgb,
): CapturedFrame {
  const bgra = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = paint(x, y);
      bgra.set([color.b, color.g, color.r, 255], (y * width + x) * 4);
    }
  }
  return { bgra, width, height };
}
