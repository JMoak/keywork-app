import { describe, expect, it } from "vitest";
import {
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

  it("falls back to VP9 in software for the text-heavy low-bitrate relay preset", () => {
    expect(prefersHardware(presetFor("direct", 1440), 2560, 1440, 30)).toBe(true);
    expect(prefersHardware(presetFor("local", 2160), 3840, 2160, 30)).toBe(true);
    expect(prefersHardware(relayPreset, 2560, 1440, 15)).toBe(false);
    expect(prefersHardware(relayPreset, 3840, 2160, 30)).toBe(true);
    const relayed = orderCodecs(codecs, machine, false).map((codec) => codec.mimeType);
    expect(relayed[0]).toBe("video/VP9");
  });
});
