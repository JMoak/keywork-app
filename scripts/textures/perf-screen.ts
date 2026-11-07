import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  loopbackRunFileEnv,
  loopbackRunsDir,
} from "../../packages/desktop/src/main/screen/loopback/run-file.ts";
import { repoRoot } from "../lib/repo-files.ts";
import {
  busyPercentBetween,
  busyPercentOver,
  cpuTimes,
  type MachineLoad,
  otherLoad,
  processRows,
  recordingDecision,
} from "./machine-load.ts";
import {
  conditionsMissed,
  fixedConditionsEnv,
  recordingFile,
  recordingOf,
  type ScreenLatencyRecording,
  stageLines,
  stageMovedMost,
} from "./screen-latency.ts";

const loopbackAcceptance = "packages/desktop/src/main/screen/loopback";
const quietBeforeMs = 5000;

if (import.meta.main) {
  const forced = process.argv.includes("--record");
  const beforeBusyPercent = await busyPercentOver(quietBeforeMs);
  const othersBefore = await othersNow();
  const runFile = join(repoRoot, loopbackRunsDir, `perf-${Date.now()}.json`);
  const duringFrom = cpuTimes();
  const exit = await runAcceptance(runFile);
  const duringBusyPercent = busyPercentBetween(duringFrom, cpuTimes());
  const others = [...new Set([...othersBefore, ...(await othersNow())])];
  const load: MachineLoad = { beforeBusyPercent, duringBusyPercent, others };

  const run = await readFile(runFile, "utf8").catch(() => undefined);
  if (run === undefined) {
    console.error(`perf:screen: the loopback run wrote no measurement (exit ${exit})`);
    process.exit(1);
  }
  const decision = recordingDecision(load, forced);
  const measured = recordingOf(
    JSON.parse(run),
    decision.idle ? "idle" : `under load: ${decision.reason}`,
    relative(repoRoot, runFile).replaceAll("\\", "/"),
  );
  const recording: ScreenLatencyRecording = { ...measured, load };
  const missed = conditionsMissed(recording);
  if (missed.length > 0) {
    console.error(
      `perf:screen: not the fixed conditions, so nothing is recorded: ${missed.join("; ")}`,
    );
    process.exit(1);
  }
  report(recording, await lastRecording());
  if (!decision.write) {
    console.error(
      `perf:screen: ${recordingFile} left as it was, because ${decision.reason}; run again on an idle machine, or pass --record to write it anyway`,
    );
    process.exit(1);
  }
  await writeFile(join(repoRoot, recordingFile), `${JSON.stringify(recording, null, 2)}\n`, "utf8");
  console.log(
    `perf:screen: wrote ${recordingFile} (${decision.reason}), which T9 in check:textures reads`,
  );
}

function runAcceptance(runFile: string): Promise<number | null> {
  const acceptance = spawn(process.execPath, ["run", "test", "--", loopbackAcceptance], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...fixedConditionsEnv,
      KEYWORK_SCREEN_LOOPBACK: "1",
      [loopbackRunFileEnv]: runFile,
    },
  });
  return new Promise((resolve) => acceptance.on("exit", (code) => resolve(code)));
}

async function othersNow(): Promise<string[]> {
  return otherLoad(await processRows(), process.pid);
}

async function lastRecording(): Promise<ScreenLatencyRecording | undefined> {
  const text = await readFile(join(repoRoot, recordingFile), "utf8").catch(() => undefined);
  return text === undefined ? undefined : (JSON.parse(text) as ScreenLatencyRecording);
}

function report(recording: ScreenLatencyRecording, last: ScreenLatencyRecording | undefined): void {
  for (const line of recording.stages === undefined ? [] : stageLines(recording.stages)) {
    console.log(`perf:screen: ${line}`);
  }
  const moved = stageMovedMost(last?.stages, recording.stages);
  if (moved !== undefined) console.log(`perf:screen: ${moved}`);
  const { p50, p95, count } = recording.glassToGlassMs;
  const { beforeBusyPercent, duringBusyPercent, others } = recording.load ?? {};
  console.log(
    `perf:screen: glass-to-glass p50 ${p50} ms, p95 ${p95} ms over ${count} probes (budget ${recording.budgetMs} ms); CPU ${beforeBusyPercent}% busy before, ${duringBusyPercent}% during; other load: ${others?.join(", ") || "none"}`,
  );
}
