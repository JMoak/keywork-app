import { hexChannels } from "./contrast.ts";

export function mixOklab(from: string, toward: string, amount: number): string {
  const blend = Math.min(Math.max(amount, 0), 1);
  const [l1, a1, b1] = oklabOf(from);
  const [l2, a2, b2] = oklabOf(toward);
  return hexOfOklab([l1 + (l2 - l1) * blend, a1 + (a2 - a1) * blend, b1 + (b2 - b1) * blend]);
}

type Oklab = readonly [number, number, number];

function oklabOf(hex: string): Oklab {
  const [r, g, b] = hexChannels(hex).map(linearOf) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function hexOfOklab([lightness, a, b]: Oklab): string {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${channels.map((channel) => byteOf(channel).toString(16).padStart(2, "0")).join("")}`;
}

function linearOf(channel: number): number {
  const unit = channel / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function byteOf(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}
