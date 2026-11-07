export interface FrameAges {
  readonly captured?: number | undefined;
  readonly received?: number | undefined;
  readonly presented: number;
  readonly displayed: number;
}

export interface Spread {
  readonly p50: number;
  readonly p95: number;
  readonly count: number;
}

export const frameStages = [
  "glassToCapture",
  "captureToReceive",
  "receiveToPresent",
  "presentToGlass",
] as const;

export type FrameStage = (typeof frameStages)[number];

export interface RtcSnapshot {
  readonly at: number;
  readonly [counter: string]: number | string | boolean | undefined;
}

export interface StatsWindow {
  readonly from: number;
  readonly to: number;
}

export interface SenderAverages {
  readonly encodeMs: number | undefined;
  readonly sendDelayMs: number | undefined;
  readonly encoder: string | undefined;
}

export interface ReceiverAverages {
  readonly jitterBufferMs: number | undefined;
  readonly jitterTargetMs: number | undefined;
  readonly decodeMs: number | undefined;
  readonly decoder: string | undefined;
}

export interface StageReport {
  readonly frames: Partial<Record<FrameStage, Spread>>;
  readonly sender: SenderAverages;
  readonly receiver: ReceiverAverages;
  readonly networkMs: number | undefined;
}

export function spreadOf(samples: readonly number[]): Spread {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? Number.NaN;
  return { p50: at(0.5), p95: at(0.95), count: sorted.length };
}

export function stagesOf(frame: FrameAges): Partial<Record<FrameStage, number>> {
  const { captured, received, presented, displayed } = frame;
  return {
    ...(captured !== undefined && { glassToCapture: captured }),
    ...(captured !== undefined &&
      received !== undefined && { captureToReceive: received - captured }),
    ...(received !== undefined && { receiveToPresent: presented - received }),
    presentToGlass: displayed - presented,
  };
}

export function frameSpreads(frames: readonly FrameAges[]): Partial<Record<FrameStage, Spread>> {
  const perFrame = frames.map(stagesOf);
  const spreads: Partial<Record<FrameStage, Spread>> = {};
  for (const stage of frameStages) {
    const samples = perFrame.flatMap((stages) => stages[stage] ?? []);
    if (samples.length > 0) spreads[stage] = spreadOf(samples);
  }
  return spreads;
}

export function senderAverages(
  snapshots: readonly RtcSnapshot[],
  window: StatsWindow,
): SenderAverages {
  const delta = deltaWithin(snapshots, window);
  return {
    encodeMs: perEach(delta, "totalEncodeTime", "framesEncoded"),
    sendDelayMs: perEach(delta, "totalPacketSendDelay", "packetsSent"),
    encoder: lastText(within(snapshots, window), "encoderImplementation"),
  };
}

export function receiverAverages(
  snapshots: readonly RtcSnapshot[],
  window: StatsWindow,
): ReceiverAverages {
  const delta = deltaWithin(snapshots, window);
  return {
    jitterBufferMs: perEach(delta, "jitterBufferDelay", "jitterBufferEmittedCount"),
    jitterTargetMs: perEach(delta, "jitterBufferTargetDelay", "jitterBufferEmittedCount"),
    decodeMs: perEach(delta, "totalDecodeTime", "framesDecoded"),
    decoder: lastText(within(snapshots, window), "decoderImplementation"),
  };
}

export function stageReport(
  frames: readonly FrameAges[],
  sender: readonly RtcSnapshot[],
  receiver: readonly RtcSnapshot[],
  window: StatsWindow,
): StageReport {
  const spreads = frameSpreads(frames);
  const sent = senderAverages(sender, window);
  const transit = spreads.captureToReceive?.p50;
  return {
    frames: spreads,
    sender: sent,
    receiver: receiverAverages(receiver, window),
    networkMs:
      transit === undefined || sent.encodeMs === undefined || sent.sendDelayMs === undefined
        ? undefined
        : rounded(Math.max(0, transit - sent.encodeMs - sent.sendDelayMs)),
  };
}

type Delta = Readonly<Record<string, number>>;

function within(snapshots: readonly RtcSnapshot[], window: StatsWindow): RtcSnapshot[] {
  return snapshots.filter(({ at }) => at >= window.from && at <= window.to);
}

function deltaWithin(snapshots: readonly RtcSnapshot[], window: StatsWindow): Delta {
  const inside = within(snapshots, window);
  const first = inside[0];
  const last = inside.at(-1);
  if (first === undefined || last === undefined || first === last) return {};
  const delta: Record<string, number> = {};
  for (const [counter, value] of Object.entries(last)) {
    const before = first[counter];
    if (typeof value === "number" && typeof before === "number") delta[counter] = value - before;
  }
  return delta;
}

function perEach(delta: Delta, total: string, count: string): number | undefined {
  const sum = delta[total];
  const times = delta[count];
  if (sum === undefined || times === undefined || times <= 0) return undefined;
  return rounded((sum / times) * 1000);
}

function lastText(snapshots: readonly RtcSnapshot[], field: string): string | undefined {
  const value = snapshots.at(-1)?.[field];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function rounded(ms: number): number {
  return Math.round(ms * 10) / 10;
}
