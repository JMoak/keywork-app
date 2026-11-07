import type { SelfTestRecord } from "./preferences.ts";
import type { TransparencyVerdict } from "./presence.ts";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface SelfTestReading {
  verdict: TransparencyVerdict;
  why: string;
}

export interface CapturedFrame {
  bgra: Uint8Array;
  width: number;
  height: number;
}

export interface FramePoint {
  x: number;
  y: number;
}

export interface ProbePoints {
  reference: readonly FramePoint[];
  probe: readonly FramePoint[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const probePlate: Rgb = { r: 0, g: 255, b: 0 };
export const marginSampleDip = 8;
export const plateRimDip = 16;

export const plateTolerance = 96;
export const neutralTolerance = 20;
export const dimTolerance = 48;
export const dimSpread = 0.15;

export const readingWhy = {
  denied: "the screen could not be captured",
  unsampled: "no point of the capture could be sampled",
  dimmed: "the whole capture is uniformly dimmed, so the plate reads darker than it was painted",
  covered: "something covers the plate where its color is known",
  clear: "the plate shows through the companion's transparent margin",
  opaque: "the companion's margin paints black or grey over a plate that reads true",
  mixed: "the margin reads neither the plate nor black",
} as const;

export function readCapture(
  frame: CapturedFrame | undefined,
  points: ProbePoints,
): SelfTestReading {
  if (frame === undefined || frame.width === 0 || frame.height === 0) {
    return inconclusive(readingWhy.denied);
  }
  const inside = (point: FramePoint): boolean =>
    point.x >= 0 && point.y >= 0 && point.x < frame.width && point.y < frame.height;
  return judgeCapture(
    samplesOfBitmap(frame.bgra, frame.width, points.reference.filter(inside)),
    samplesOfBitmap(frame.bgra, frame.width, points.probe.filter(inside)),
  );
}

export function probePointsFor(
  bounds: Rect,
  display: { bounds: Rect; workArea: Rect },
  ratio: number,
): ProbePoints {
  const rim = plateRimDip / 2;
  const middleX = bounds.x + bounds.width / 2;
  const middleY = bounds.y + bounds.height / 2;
  const reference = [
    { x: bounds.x - rim, y: middleY },
    { x: bounds.x + bounds.width + rim, y: middleY },
    { x: middleX, y: bounds.y - rim },
    { x: middleX, y: bounds.y + bounds.height + rim },
  ].filter((point) => within(point, display.workArea));
  const probe = [0, 2, 4].flatMap((dx) =>
    [0, 2, 4].map((dy) => ({
      x: bounds.x + marginSampleDip + dx,
      y: bounds.y + marginSampleDip + dy,
    })),
  );
  const toFrame = (point: FramePoint): FramePoint => ({
    x: (point.x - display.bounds.x) * ratio,
    y: (point.y - display.bounds.y) * ratio,
  });
  return { reference: reference.map(toFrame), probe: probe.map(toFrame) };
}

export function captureSourceFor<Source extends { display_id: string }>(
  sources: readonly Source[],
  displayId: number,
): Source | undefined {
  const matching = sources.find((source) => source.display_id === String(displayId));
  if (matching !== undefined) return matching;
  return sources.length === 1 ? sources[0] : undefined;
}

export function judgeCapture(reference: readonly Rgb[], probe: readonly Rgb[]): SelfTestReading {
  if (reference.length === 0 || probe.length === 0) return inconclusive(readingWhy.unsampled);
  if (!reference.every(nearPlate)) {
    return inconclusive(uniformlyDimmed(reference) ? readingWhy.dimmed : readingWhy.covered);
  }
  const verdict = judgeTransparency(probe);
  return { verdict, why: verdict === "unknown" ? readingWhy.mixed : readingWhy[verdict] };
}

export function uniformlyDimmed(samples: readonly Rgb[]): boolean {
  if (samples.length === 0) return false;
  const factors = samples.map(plateFactor);
  const darkest = Math.min(...factors);
  const brightest = Math.max(...factors);
  return (
    brightest - darkest <= dimSpread &&
    samples.every(
      (sample, at) => distance(sample, scaled(probePlate, factors[at] ?? 0)) <= dimTolerance,
    )
  );
}

export function judgeTransparency(samples: readonly Rgb[]): TransparencyVerdict {
  if (samples.length === 0) return "unknown";
  if (samples.every(nearPlate)) return "clear";
  if (samples.every(neutral)) return "opaque";
  return "unknown";
}

export function selfTestNeeded(record: SelfTestRecord | undefined, gpu: string): boolean {
  return record === undefined || record.gpu !== gpu || record.result === "unknown";
}

export function hexOf(color: Rgb): string {
  return `#${[color.r, color.g, color.b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function samplesOfBitmap(
  bgra: Uint8Array,
  width: number,
  points: readonly { x: number; y: number }[],
): Rgb[] {
  return points.map(({ x, y }) => {
    const at = (Math.round(y) * width + Math.round(x)) * 4;
    return { r: bgra[at + 2] ?? 0, g: bgra[at + 1] ?? 0, b: bgra[at] ?? 0 };
  });
}

function inconclusive(why: string): SelfTestReading {
  return { verdict: "unknown", why };
}

function plateFactor(sample: Rgb): number {
  const dot = sample.r * probePlate.r + sample.g * probePlate.g + sample.b * probePlate.b;
  const norm = probePlate.r ** 2 + probePlate.g ** 2 + probePlate.b ** 2;
  return Math.min(1, dot / norm);
}

function scaled(color: Rgb, factor: number): Rgb {
  return { r: color.r * factor, g: color.g * factor, b: color.b * factor };
}

function nearPlate(sample: Rgb): boolean {
  return distance(sample, probePlate) <= plateTolerance;
}

function neutral(sample: Rgb): boolean {
  const channels = [sample.r, sample.g, sample.b];
  return Math.max(...channels) - Math.min(...channels) <= neutralTolerance;
}

function distance(a: Rgb, b: Rgb): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

function within(point: FramePoint, area: Rect): boolean {
  return (
    point.x >= area.x &&
    point.y >= area.y &&
    point.x < area.x + area.width &&
    point.y < area.y + area.height
  );
}
