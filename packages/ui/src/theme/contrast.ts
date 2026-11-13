export function apcaLc(inkHex: string, groundHex: string): number {
  const ink = softenNearBlack(screenLuminance(inkHex));
  const ground = softenNearBlack(screenLuminance(groundHex));
  const polarity =
    ground > ink
      ? ground ** darkInkGroundExponent - ink ** darkInkExponent
      : ground ** lightInkGroundExponent - ink ** lightInkExponent;
  const magnitude = Math.abs(polarity) * contrastScale;
  return magnitude < lowContrastClip ? 0 : (magnitude - lowContrastOffset) * 100;
}

export function wcagContrast(inkHex: string, groundHex: string): number {
  const [lighter, darker] = [relativeLuminance(inkHex), relativeLuminance(groundHex)].sort(
    (left, right) => right - left,
  ) as [number, number];
  return (lighter + wcagFlare) / (darker + wcagFlare);
}

export function linearChannel(channel: number): number {
  const unit = channel / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

export type ContrastPolarity = "dark-on-light" | "light-on-dark";

export function contrastPolarity(inkHex: string, groundHex: string): ContrastPolarity {
  return screenLuminance(inkHex) < screenLuminance(groundHex) ? "dark-on-light" : "light-on-dark";
}

export function hexChannels(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Expected a #rrggbb color, got "${hex}"`);
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

const darkInkGroundExponent = 0.56;
const darkInkExponent = 0.57;
const lightInkGroundExponent = 0.65;
const lightInkExponent = 0.62;
const contrastScale = 1.14;
const lowContrastClip = 0.1;
const lowContrastOffset = 0.027;
const nearBlackThreshold = 0.022;
const nearBlackExponent = Math.SQRT2;
const wcagFlare = 0.05;

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexChannels(hex).map(linearChannel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function screenLuminance(hex: string): number {
  const [r, g, b] = hexChannels(hex);
  return 0.2126729 * gamma(r) + 0.7151522 * gamma(g) + 0.072175 * gamma(b);
}

function gamma(channel: number): number {
  return (channel / 255) ** 2.4;
}

function softenNearBlack(luminance: number): number {
  if (luminance >= nearBlackThreshold) return luminance;
  return luminance + (nearBlackThreshold - luminance) ** nearBlackExponent;
}
