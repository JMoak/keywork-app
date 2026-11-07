export const pathClasses = ["local", "direct", "relayed", "peer-relay", "derp", "unknown"] as const;

export type PathClass = (typeof pathClasses)[number];

export type SessionKind = "view" | "control";

export type PresetName = "text" | "motion" | "relay";

export interface SenderPreset {
  readonly name: PresetName;
  readonly contentHint: "detail" | "motion";
  readonly degradationPreference: RTCDegradationPreference;
  readonly maxBitrate: number;
  readonly maxFramerate: number;
  readonly scaleResolutionDownBy: number;
  readonly idealFrameRate: number;
}

export interface UdpPortRange {
  readonly min: number;
  readonly max: number;
}

export const webRtcUdpPorts: UdpPortRange = { min: 47_100, max: 47_199 };

export const disabledChromiumFeatures = ["WebRtcHideLocalIpsWithMdns"] as const;

// Chromium offers no way to cap a receiver's jitter buffer (jitterBufferTarget is only a floor)
// nor a sender's pacer queue, and on screen content both swing from run to run. The first trial
// renders each frame as soon as it decodes; the second paces video at 2.5 times the estimate
// and drains any queue within 50 ms.
export const forcedFieldTrials = [
  "WebRTC-ForcePlayoutDelay/min_ms:0,max_ms:0/",
  "WebRTC-Video-Pacing/factor:2.5,max_delay:50ms/",
] as const;

export const ipHandlingPolicy = "default";

export const megabit = 1_000_000;

export const encodedHeightCap = 1440;

export const encodedBitrateCap = 8 * megabit;

export function presetFor(path: PathClass, captureHeight: number): SenderPreset {
  if (path === "derp" || path === "relayed") return relayPreset;
  return {
    name: "text",
    contentHint: "detail",
    degradationPreference: "maintain-resolution",
    maxBitrate: encodedBitrateCap,
    maxFramerate: 30,
    scaleResolutionDownBy: scaleToEncodedCap(captureHeight),
    idealFrameRate: 30,
  };
}

export function samePreset(preset: SenderPreset, held: SenderPreset | undefined): boolean {
  return (
    held !== undefined &&
    (Object.keys(preset) as (keyof SenderPreset)[]).every((field) => preset[field] === held[field])
  );
}

export function scaleToEncodedCap(captureHeight: number, cap = encodedHeightCap): number {
  return Math.max(1, captureHeight / cap);
}

export const motionPreset: SenderPreset = {
  name: "motion",
  contentHint: "motion",
  degradationPreference: "maintain-framerate",
  maxBitrate: 20 * megabit,
  maxFramerate: 60,
  scaleResolutionDownBy: 1,
  idealFrameRate: 60,
};

export const relayPreset: SenderPreset = {
  name: "relay",
  contentHint: "detail",
  degradationPreference: "maintain-resolution",
  maxBitrate: 1.5 * megabit,
  maxFramerate: 15,
  scaleResolutionDownBy: 2,
  idealFrameRate: 15,
};

export function jitterBufferTargetFor(kind: SessionKind): number | null {
  return kind === "control" ? 0 : null;
}

export interface CodecCapability {
  readonly mimeType: string;
  readonly clockRate: number;
  readonly sdpFmtpLine?: string | undefined;
}

export interface CodecEfficiency {
  readonly mimeType: string;
  readonly supported: boolean;
  readonly powerEfficient: boolean;
}

export function orderCodecs<Codec extends CodecCapability>(
  codecs: readonly Codec[],
  efficiency: readonly CodecEfficiency[],
  preferHardware: boolean,
): Codec[] {
  const rank = (codec: Codec): number => {
    const mime = codec.mimeType.toLowerCase();
    const media = mediaRank.indexOf(mime);
    if (media === -1) return supportRank;
    const measured = efficiency.find((entry) => entry.mimeType.toLowerCase() === mime);
    if (measured !== undefined && !measured.supported) return supportRank - 1;
    if (preferHardware && measured?.powerEfficient === true) return media - mediaRank.length;
    return media;
  };
  return codecs
    .map((codec, index) => ({ codec, index, rank: rank(codec) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.codec);
}

export function isDemanding(width: number, height: number, frameRate: number): boolean {
  return width * height > 2560 * 1440 || frameRate > 30;
}

export function prefersHardware(
  preset: Pick<SenderPreset, "name">,
  width: number,
  height: number,
  frameRate: number,
): boolean {
  return preset.name !== "relay" || isDemanding(width, height, frameRate);
}

const mediaRank = ["video/vp9", "video/av1", "video/h264", "video/h265", "video/vp8"];

const supportRank = 100;

export function mergeFeatureList(
  existing: string | undefined,
  features: readonly string[],
): string {
  const present = (existing ?? "")
    .split(",")
    .map((feature) => feature.trim())
    .filter((feature) => feature !== "");
  return [...new Set([...present, ...features])].join(",");
}

export function mergeFieldTrials(existing: string | undefined, trials: readonly string[]): string {
  return trials.reduce((held, trial) => {
    const name = trial.split("/")[0] ?? trial;
    return held.split("/").includes(name) ? held : `${held}${trial}`;
  }, existing ?? "");
}
