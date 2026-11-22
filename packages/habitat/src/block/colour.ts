export type Channels = readonly [number, number, number];

export function channelsOf(hex: string): Channels {
  const digits = hex.trim().replace(/^#/, "");
  return [0, 2, 4].map(
    (at) => Number.parseInt(digits.slice(at, at + 2), 16) || 0,
  ) as unknown as Channels;
}

export function hexOf(channels: Channels): string {
  return `#${channels.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

export function mixHex(from: string, toward: string, share: number): string {
  const a = channelsOf(from);
  const b = channelsOf(toward);
  return hexOf(
    [0, 1, 2].map((at) =>
      Math.round((a[at] ?? 0) + ((b[at] ?? 0) - (a[at] ?? 0)) * share),
    ) as unknown as Channels,
  );
}

export function overHex(under: string, over: string, alpha: number): string {
  const a = channelsOf(under);
  const b = channelsOf(over);
  const opacity = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return hexOf(
    [0, 1, 2].map((at) => overChannel(a[at] ?? 0, b[at] ?? 0, opacity)) as unknown as Channels,
  );
}

export function overChannel(under: number, over: number, opacity: number): number {
  return Math.round((over * opacity) / 255) + ((under * (256 - opacity)) >> 8);
}
