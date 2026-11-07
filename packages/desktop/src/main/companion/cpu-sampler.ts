import type { Tier } from "./channels.ts";
import { privateMemoryBudgetMb, tierBudgets } from "./tiers.ts";

export interface CpuSample {
  tier: Tier;
  mainPercent: number;
  rendererPercent: number | undefined;
  rendererPrivateMb: number | undefined;
  wakeupsPerSecond: number | undefined;
}

export interface ProcessMetricLike {
  pid: number;
  cpu: { percentCPUUsage: number };
  memory: { workingSetSize: number; privateBytes?: number };
}

export interface SamplerPorts {
  every(ms: number, beat: () => void): () => void;
  mainUsage(): { percentCPUUsage: number };
  metrics(): readonly ProcessMetricLike[];
  logicalProcessors(): number;
  rendererPid(): number | undefined;
  tier(): Tier;
  wakeupsSinceLast(): number | undefined;
  log(line: string): void;
}

export const sampleEveryMs = 10_000;

export function startCpuSampler(ports: SamplerPorts, everyMs = sampleEveryMs): () => void {
  ports.mainUsage();
  ports.metrics();
  return ports.every(everyMs, () => ports.log(sampleLine(takeSample(ports, everyMs))));
}

export function takeSample(ports: SamplerPorts, everyMs: number): CpuSample {
  const pid = ports.rendererPid();
  const renderer = ports.metrics().find((metric) => metric.pid === pid);
  const wakeups = ports.wakeupsSinceLast();
  const processors = ports.logicalProcessors();
  return {
    tier: ports.tier(),
    mainPercent: perCore(ports.mainUsage().percentCPUUsage, processors),
    rendererPercent:
      renderer === undefined ? undefined : perCore(renderer.cpu.percentCPUUsage, processors),
    rendererPrivateMb: renderer === undefined ? undefined : privateMb(renderer),
    wakeupsPerSecond: wakeups === undefined ? undefined : wakeups / (everyMs / 1000),
  };
}

// Electron divides Chromium's per-core figure by the logical processor count, so
// percentCPUUsage is a share of the whole machine; every budget here is per core.
export function perCore(machinePercent: number, logicalProcessors: number): number {
  return machinePercent * Math.max(1, logicalProcessors);
}

export function sampleLine(sample: CpuSample): string {
  const budget = tierBudgets[sample.tier];
  const parts = [
    `companion ${sample.tier}`,
    `cpu of one core: main ${percent(sample.mainPercent)}, renderer ${percent(sample.rendererPercent)} of ${percent(budget.cpuPercent)}`,
    `wakeups ${perSecond(sample.wakeupsPerSecond)} of ${perSecond(budget.wakeupsPerSecond)}`,
    `private ${megabytes(sample.rendererPrivateMb)} of ${privateMemoryBudgetMb} MB`,
  ];
  const breaches = breachesOf(sample);
  return breaches.length === 0
    ? parts.join(" · ")
    : `${parts.join(" · ")} · OVER ${breaches.join(", ")}`;
}

export function breachesOf(sample: CpuSample): string[] {
  const budget = tierBudgets[sample.tier];
  const over: string[] = [];
  if (sample.rendererPercent !== undefined && sample.rendererPercent > budget.cpuPercent) {
    over.push("cpu");
  }
  if (sample.wakeupsPerSecond !== undefined && sample.wakeupsPerSecond > budget.wakeupsPerSecond) {
    over.push("wakeups");
  }
  if (sample.rendererPrivateMb !== undefined && sample.rendererPrivateMb > privateMemoryBudgetMb) {
    over.push("memory");
  }
  return over;
}

function privateMb(metric: ProcessMetricLike): number {
  const kilobytes = metric.memory.privateBytes ?? metric.memory.workingSetSize;
  return Math.round(kilobytes / 1024);
}

function percent(value: number | undefined): string {
  if (value === undefined) return "?";
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "any";
}

function perSecond(value: number | undefined): string {
  if (value === undefined) return "?";
  return Number.isFinite(value) ? `${value.toFixed(1)}/s` : "any";
}

function megabytes(value: number | undefined): string {
  return value === undefined ? "?" : `${value} MB`;
}
