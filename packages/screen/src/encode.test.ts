import { describe, expect, it } from "vitest";
import {
  encodedBitrateCap,
  encodedHeightCap,
  megabit,
  orderCodecs,
  prefersHardware,
  presetFor,
  relayPreset,
  scaleToEncodedCap,
} from "./media.ts";

const codecs = [
  { mimeType: "video/VP8", clockRate: 90000 },
  { mimeType: "video/H265", clockRate: 90000 },
  { mimeType: "video/H264", clockRate: 90000 },
  { mimeType: "video/VP9", clockRate: 90000 },
];

const machine = [
  { mimeType: "video/H265", supported: true, powerEfficient: true },
  { mimeType: "video/H264", supported: true, powerEfficient: false },
  { mimeType: "video/VP9", supported: true, powerEfficient: false },
  { mimeType: "video/VP8", supported: true, powerEfficient: false },
];

describe("the encoded stream", () => {
  it("captures at native resolution and scales the encoding to at most 1440p", () => {
    expect(encodedHeightCap).toBe(1440);
    expect(scaleToEncodedCap(2160)).toBe(1.5);
    expect(scaleToEncodedCap(1440)).toBe(1);
    expect(scaleToEncodedCap(1080)).toBe(1);
    expect(presetFor("direct", 2160).scaleResolutionDownBy).toBe(1.5);
    expect(presetFor("local", 4320).scaleResolutionDownBy).toBe(3);
    expect(presetFor("direct", 1440).maxBitrate).toBe(8 * megabit);
    expect(relayPreset.scaleResolutionDownBy).toBe(2);
  });

  it("holds 8 Mbps at the 1440p encode cap whatever the capture height", () => {
    expect(encodedBitrateCap).toBe(8 * megabit);
    for (const path of ["local", "direct", "peer-relay", "unknown"] as const) {
      for (const captureHeight of [1080, 1440, 2160]) {
        const preset = presetFor(path, captureHeight);
        expect({ path, captureHeight, maxBitrate: preset.maxBitrate }).toEqual({
          path,
          captureHeight,
          maxBitrate: 8 * megabit,
        });
        expect(captureHeight / preset.scaleResolutionDownBy).toBeLessThanOrEqual(encodedHeightCap);
      }
    }
  });

  it("prefers the hardware codec the machine reports as power efficient, H.265 included", () => {
    const ordered = orderCodecs(codecs, machine, true).map((codec) => codec.mimeType);
    expect(ordered).toEqual(["video/H265", "video/VP9", "video/H264", "video/VP8"]);
  });

  it("falls back to VP9 in software for the text-heavy low-bitrate relay preset", () => {
    expect(prefersHardware(presetFor("direct", 1440), 2560, 1440, 30)).toBe(true);
    expect(prefersHardware(presetFor("local", 2160), 3840, 2160, 30)).toBe(true);
    expect(prefersHardware(relayPreset, 2560, 1440, 15)).toBe(false);
    expect(prefersHardware(relayPreset, 3840, 2160, 30)).toBe(true);
    const relayed = orderCodecs(codecs, machine, false).map((codec) => codec.mimeType);
    expect(relayed[0]).toBe("video/VP9");
  });
});
