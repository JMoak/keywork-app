import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { StageReport } from "../../packages/screen/src/latency.ts";
import { repoRoot } from "../lib/repo-files.ts";
import type { MachineLoad } from "./machine-load.ts";

export const recordingFile = "scripts/textures/screen-latency.json";

export const glassToGlassKey = "T9.screenGlassToGlassP50Ms";

export interface Size {
  readonly width: number | undefined;
  readonly height: number | undefined;
}

export interface FixedConditions {
  readonly display: unknown;
  readonly captured: Size | undefined;
  readonly encoded: Size | undefined;
  readonly codec: string | undefined;
  readonly warmupFrames: number | undefined;
  readonly probes: number | undefined;
}

export const fixedConditions = {
  captured: { width: 3840, height: 2160 },
  encoded: { width: 2560, height: 1440 },
  codec: "video/H265",
  warmupFrames: 60,
  probes: 150,
} as const;

export const fixedConditionsEnv: Readonly<Record<string, string>> = {
  KEYWORK_SCREEN_PERF_CODEC: fixedConditions.codec,
  KEYWORK_LOOPBACK_WARMUP_FRAMES: String(fixedConditions.warmupFrames),
  KEYWORK_LOOPBACK_PROBES: String(fixedConditions.probes),
};

export interface GlassToGlass {
  readonly p50: number;
  readonly p95: number;
  readonly count: number;
}

export interface ScreenLatencyRecording {
  readonly measuredAt: string;
  readonly conditions: string;
  readonly electron: string | undefined;
  readonly capture: { readonly width: number | undefined; readonly height: number | undefined };
  readonly codec: string | undefined;
  readonly pair: string | undefined;
  readonly glassToGlassMs: GlassToGlass;
  readonly budgetMs: number | undefined;
  readonly run: string;
  readonly fixed?: FixedConditions;
  readonly stages?: StageReport;
  readonly load?: MachineLoad;
}

export function screenLatencyOf(recording: unknown): Record<string, number> {
  const glass = glassToGlassOf(recording);
  if (glass === undefined) {
    throw new Error(`${recordingFile} must carry glassToGlassMs { p50, p95, count }`);
  }
  return { [glassToGlassKey]: Math.round(glass.p50) };
}

export async function recordedScreenLatency(root = repoRoot): Promise<Record<string, number>> {
  return screenLatencyOf(JSON.parse(await readFile(join(root, recordingFile), "utf8")));
}

export function recordingOf(
  run: unknown,
  conditions: string,
  runFile: string,
): ScreenLatencyRecording {
  const glass = glassToGlassOf(run);
  if (glass === undefined) throw new Error(`${runFile} carries no glass-to-glass measurement`);
  const fields = run as Record<string, unknown>;
  const stats = statsOf(fields.stats);
  return {
    measuredAt: stringOf(fields.measuredAt) ?? new Date().toISOString(),
    conditions,
    electron: stringOf(fields.electron),
    capture: {
      width: numberOf(recordOf(fields.capture).width),
      height: numberOf(recordOf(fields.capture).height),
    },
    codec: stringOf(stats.codec),
    pair: pairWord(recordOf(stats.pair)),
    glassToGlassMs: glass,
    budgetMs: numberOf(fields.budgetMs),
    run: runFile,
    ...("warmupFrames" in fields && { fixed: fixedOf(fields, stringOf(stats.codec)) }),
    ...("stages" in fields && { stages: fields.stages as StageReport }),
  };
}

export function conditionsMissed(recording: ScreenLatencyRecording): string[] {
  const fixed = recording.fixed;
  if (fixed === undefined) return ["the run names no fixed conditions"];
  return [
    sizeMissed("capture", fixed.captured, fixedConditions.captured),
    sizeMissed("encoded size", fixed.encoded, fixedConditions.encoded),
    fixed.codec === fixedConditions.codec
      ? undefined
      : `codec ${fixed.codec ?? "unknown"}, not ${fixedConditions.codec}`,
    fixed.warmupFrames === fixedConditions.warmupFrames
      ? undefined
      : `${fixed.warmupFrames ?? 0} warm-up frames discarded, not ${fixedConditions.warmupFrames}`,
    fixed.probes === fixedConditions.probes
      ? undefined
      : `${fixed.probes ?? 0} probes, not ${fixedConditions.probes}`,
  ].filter((missed): missed is string => missed !== undefined);
}

export function stageLines(stages: StageReport): string[] {
  const { frames, sender, receiver, networkMs } = stages;
  const spread = (name: string, stage: keyof StageReport["frames"]): string => {
    const measured = frames[stage];
    return measured === undefined
      ? `${name}: not reported`
      : `${name}: p50 ${whole(measured.p50)} ms, p95 ${whole(measured.p95)} ms`;
  };
  return [
    spread("glass to capture (compose and capture)", "glassToCapture"),
    spread("capture to receive (encode, pacer, network)", "captureToReceive"),
    `  encode ${sender.encodeMs ?? "?"} ms (${sender.encoder ?? "encoder unknown"}), pacer ${sender.sendDelayMs ?? "?"} ms, network ${networkMs ?? "?"} ms`,
    spread("receive to present (jitter buffer, decode)", "receiveToPresent"),
    `  jitter buffer ${receiver.jitterBufferMs ?? "?"} ms, decode ${receiver.decodeMs ?? "?"} ms`,
    spread("present to glass (compositor)", "presentToGlass"),
  ];
}

export function stageMovedMost(
  last: StageReport | undefined,
  now: StageReport | undefined,
): string | undefined {
  if (last === undefined || now === undefined) return undefined;
  const moves = frameStages.flatMap(([name, stage]) => {
    const before = last.frames[stage]?.p50;
    const after = now.frames[stage]?.p50;
    return before === undefined || after === undefined ? [] : [{ name, before, after }];
  });
  const most = moves.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before))[0];
  if (most === undefined) return undefined;
  return `moved most since the last recording: ${most.name}, p50 ${whole(most.before)} to ${whole(most.after)} ms`;
}

const frameStages: ReadonlyArray<readonly [string, keyof StageReport["frames"]]> = [
  ["glass to capture", "glassToCapture"],
  ["capture to receive", "captureToReceive"],
  ["receive to present", "receiveToPresent"],
  ["present to glass", "presentToGlass"],
];

function fixedOf(fields: Record<string, unknown>, codec: string | undefined): FixedConditions {
  return {
    display: fields.display,
    captured: sizeOf(fields.captured),
    encoded: sizeOf(fields.encoded),
    codec,
    warmupFrames: numberOf(fields.warmupFrames),
    probes: numberOf(fields.probes),
  };
}

function sizeOf(candidate: unknown): Size | undefined {
  const size = recordOf(candidate);
  const width = numberOf(size.width);
  const height = numberOf(size.height);
  return width === undefined && height === undefined ? undefined : { width, height };
}

function sizeMissed(name: string, measured: Size | undefined, fixed: Size): string | undefined {
  if (measured?.width === fixed.width && measured?.height === fixed.height) return undefined;
  const seen = measured === undefined ? "unknown" : `${measured.width}x${measured.height}`;
  return `${name} ${seen}, not ${fixed.width}x${fixed.height}`;
}

function whole(ms: number): number {
  return Math.round(ms);
}

function glassToGlassOf(candidate: unknown): GlassToGlass | undefined {
  const glass = recordOf(recordOf(candidate).glassToGlassMs);
  const { p50, p95, count } = glass;
  if (![p50, p95, count].every((value) => numberOf(value) !== undefined)) return undefined;
  return { p50: p50 as number, p95: p95 as number, count: count as number };
}

function statsOf(reported: unknown): Record<string, unknown> {
  return recordOf(recordOf(reported).stats);
}

function pairWord(pair: Record<string, unknown>): string | undefined {
  const local = stringOf(recordOf(pair.local).type);
  const remote = stringOf(recordOf(pair.remote).type);
  return local === undefined || remote === undefined ? undefined : `${local}/${remote}`;
}

function recordOf(candidate: unknown): Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null
    ? (candidate as Record<string, unknown>)
    : {};
}

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}
