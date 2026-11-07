import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loopbackRunFile,
  loopbackRunFileEnv,
  loopbackRunsDir,
} from "../../packages/desktop/src/main/screen/loopback/run-file.ts";
import { repoRoot } from "../lib/repo-files.ts";
import { parseRatchets, ratchetsFile, regressions } from "./ratchets.ts";
import {
  conditionsMissed,
  fixedConditions,
  fixedConditionsEnv,
  glassToGlassKey,
  recordedScreenLatency,
  recordingFile,
  recordingOf,
  screenLatencyOf,
  stageLines,
  stageMovedMost,
} from "./screen-latency.ts";

const busyRun = {
  measuredAt: "2026-11-06T08:35:48.964Z",
  electron: "45.2.3",
  capture: { width: 2560, height: 1440 },
  stats: {
    stats: {
      codec: "video/H265",
      pair: { local: { type: "host" }, remote: { type: "host" }, rttMs: 0 },
    },
  },
  glassToGlassMs: { p50: 216.7, p95: 300.1, count: 150 },
  budgetMs: 120,
};

describe("the screen's glass-to-glass ratchet", () => {
  it("reads the recording's p50 as whole milliseconds", () => {
    expect(screenLatencyOf({ glassToGlassMs: { p50: 133.8, p95: 367.1, count: 150 } })).toEqual({
      [glassToGlassKey]: 134,
    });
    expect(() => screenLatencyOf({ glassToGlassMs: { p50: "fast" } })).toThrow("glassToGlassMs");
  });

  it("holds the committed recording at the committed ratchet", async () => {
    const ratchets = parseRatchets(JSON.parse(readFileSync(join(repoRoot, ratchetsFile), "utf8")));
    expect(ratchets[glassToGlassKey]?.better).toBe("lower");
    expect(regressions(ratchets, await recordedScreenLatency())).toEqual([]);
  });

  it("records a loopback run with its conditions, codec and candidate pair", () => {
    expect(recordingOf(busyRun, "idle", "artifacts/screen/runs/perf-1.json")).toEqual({
      measuredAt: "2026-11-06T08:35:48.964Z",
      conditions: "idle",
      electron: "45.2.3",
      capture: { width: 2560, height: 1440 },
      codec: "video/H265",
      pair: "host/host",
      glassToGlassMs: { p50: 216.7, p95: 300.1, count: 150 },
      budgetMs: 120,
      run: "artifacts/screen/runs/perf-1.json",
    });
    expect(() => recordingOf({ measuredAt: "now" }, "idle", "run.json")).toThrow("run.json");
  });
});

const stages = {
  frames: {
    glassToCapture: { p50: 79.4, p95: 87.2, count: 150 },
    captureToReceive: { p50: 16.8, p95: 69.1, count: 150 },
    receiveToPresent: { p50: 0.4, p95: 4.2, count: 150 },
    presentToGlass: { p50: 16.6, p95: 24.1, count: 150 },
  },
  sender: { encodeMs: 12.7, sendDelayMs: 4.3, encoder: "NVIDIA HEVC Encoder MFT" },
  receiver: { jitterBufferMs: 11, jitterTargetMs: 74.7, decodeMs: 0.5, decoder: undefined },
  networkMs: 0,
};

const fixedRun = {
  ...busyRun,
  display: { label: "LG TV SSCR2", scaleFactor: 2, pixels: { width: 3840, height: 2160 } },
  captured: { width: 3840, height: 2160 },
  encoded: { width: 2560, height: 1440 },
  warmupFrames: 60,
  probes: 150,
  stages,
};

describe("perf:screen's fixed conditions", () => {
  it("pins the codec, the warm-up and the probe count for the loopback run it starts", () => {
    expect(fixedConditionsEnv).toEqual({
      KEYWORK_SCREEN_PERF_CODEC: "video/H265",
      KEYWORK_LOOPBACK_WARMUP_FRAMES: "60",
      KEYWORK_LOOPBACK_PROBES: "150",
    });
  });

  it("records the display, sizes, codec, warm-up, probes and stages a fixed run carries", () => {
    const recording = recordingOf(fixedRun, "idle", "artifacts/screen/runs/perf-2.json");
    expect(recording.fixed).toEqual({
      display: fixedRun.display,
      captured: fixedConditions.captured,
      encoded: fixedConditions.encoded,
      codec: "video/H265",
      warmupFrames: 60,
      probes: 150,
    });
    expect(recording.stages).toEqual(stages);
    expect(conditionsMissed(recording)).toEqual([]);
  });

  it("refuses to record a run under any other conditions, and says which", () => {
    expect(conditionsMissed(recordingOf(busyRun, "idle", "run.json"))).toEqual([
      "the run names no fixed conditions",
    ]);
    const other = recordingOf(
      {
        ...fixedRun,
        captured: { width: 2560, height: 1440 },
        warmupFrames: 0,
        stats: { stats: { codec: "video/VP9" } },
      },
      "idle",
      "run.json",
    );
    expect(conditionsMissed(other)).toEqual([
      "capture 2560x1440, not 3840x2160",
      "codec video/VP9, not video/H265",
      "0 warm-up frames discarded, not 60",
    ]);
  });

  it("names the stage that moved most since the last recording", () => {
    const later = {
      ...stages,
      frames: { ...stages.frames, glassToCapture: { p50: 129.8, p95: 141.8, count: 150 } },
    };
    expect(stageMovedMost(stages, later)).toBe(
      "moved most since the last recording: glass to capture, p50 79 to 130 ms",
    );
    expect(stageMovedMost(undefined, later)).toBeUndefined();
  });

  it("names where the time goes, stage by stage", () => {
    expect(stageLines(stages)).toEqual([
      "glass to capture (compose and capture): p50 79 ms, p95 87 ms",
      "capture to receive (encode, pacer, network): p50 17 ms, p95 69 ms",
      "  encode 12.7 ms (NVIDIA HEVC Encoder MFT), pacer 4.3 ms, network 0 ms",
      "receive to present (jitter buffer, decode): p50 0 ms, p95 4 ms",
      "  jitter buffer 11 ms, decode 0.5 ms",
      "present to glass (compositor): p50 17 ms, p95 24 ms",
    ]);
  });
});

describe("the loopback acceptance's run file", () => {
  const at = new Date("2026-11-06T08:35:48.964Z");

  it("lands beside the recording, never over it, unless the keeper names it", () => {
    const runFile = loopbackRunFile(repoRoot, {}, at);
    expect(relative(repoRoot, runFile).replaceAll("\\", "/")).toBe(
      `${loopbackRunsDir}/loopback-2026-11-06T08-35-48-964Z.json`,
    );
    expect(runFile).not.toBe(join(repoRoot, recordingFile));
  });

  it("follows a run file the perf script names", () => {
    const named = join(repoRoot, loopbackRunsDir, "perf-1.json");
    expect(loopbackRunFile(repoRoot, { [loopbackRunFileEnv]: named }, at)).toBe(named);
  });
});
