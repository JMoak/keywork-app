import { describe, expect, it } from "vitest";
import { breachesOf, perCore, sampleLine, startCpuSampler, takeSample } from "./cpu-sampler.ts";

describe("sampleLine", () => {
  it("prints each tier against its budget and flags breaches", () => {
    expect(
      sampleLine({
        tier: "ambient",
        mainPercent: 0.12,
        rendererPercent: 0.4,
        rendererPrivateMb: 42,
        wakeupsPerSecond: 12,
      }),
    ).toBe(
      "companion ambient · cpu of one core: main 0.12%, renderer 0.40% of 1.00% · wakeups 12.0/s of 16.0/s · private 42 MB of 80 MB",
    );
    const over = sampleLine({
      tier: "rest",
      mainPercent: 0,
      rendererPercent: 0.5,
      rendererPrivateMb: 90,
      wakeupsPerSecond: 3,
    });
    expect(over.endsWith("· OVER cpu, wakeups, memory")).toBe(true);
    expect(
      breachesOf({
        tier: "hidden",
        mainPercent: 0,
        rendererPercent: undefined,
        rendererPrivateMb: undefined,
        wakeupsPerSecond: undefined,
      }),
    ).toEqual([]);
  });
});

describe("startCpuSampler", () => {
  it("primes the counters, samples from one owner every period, and stops cleanly", () => {
    const logs: string[] = [];
    let beat: (() => void) | undefined;
    let stopped = false;
    let usageCalls = 0;
    let wakeups = 120;
    const stop = startCpuSampler(
      {
        every: (ms, fn) => {
          expect(ms).toBe(10_000);
          beat = fn;
          return () => {
            stopped = true;
          };
        },
        mainUsage: () => {
          usageCalls += 1;
          return { percentCPUUsage: 0.2 };
        },
        metrics: () => [
          {
            pid: 7,
            cpu: { percentCPUUsage: 0.3 },
            memory: { workingSetSize: 60_000, privateBytes: 40_960 },
          },
        ],
        logicalProcessors: () => 1,
        rendererPid: () => 7,
        tier: () => "ambient",
        wakeupsSinceLast: () => {
          const count = wakeups;
          wakeups = 0;
          return count;
        },
        log: (line) => {
          logs.push(line);
        },
      },
      10_000,
    );
    expect(usageCalls).toBe(1);
    beat?.();
    expect(logs).toEqual([
      "companion ambient · cpu of one core: main 0.20%, renderer 0.30% of 1.00% · wakeups 12.0/s of 16.0/s · private 40 MB of 80 MB",
    ]);
    stop();
    expect(stopped).toBe(true);
  });
});

describe("per-core CPU", () => {
  it("reads Electron's share of a 24-processor machine as percent of one core", () => {
    const sample = takeSample(
      {
        every: () => () => undefined,
        mainUsage: () => ({ percentCPUUsage: 0.0125 }),
        metrics: () => [
          { pid: 7, cpu: { percentCPUUsage: 0.01 }, memory: { workingSetSize: 51_200 } },
        ],
        logicalProcessors: () => 24,
        rendererPid: () => 7,
        tier: () => "rest",
        wakeupsSinceLast: () => 8,
        log: () => undefined,
      },
      10_000,
    );
    expect(sample.mainPercent).toBeCloseTo(0.3);
    expect(sample.rendererPercent).toBeCloseTo(0.24);
    expect(sampleLine(sample)).toBe(
      "companion rest · cpu of one core: main 0.30%, renderer 0.24% of 0.20% · wakeups 0.8/s of 1.0/s · private 50 MB of 80 MB · OVER cpu",
    );
  });

  it("never scales by less than one processor", () => {
    expect(perCore(0.5, 0)).toBe(0.5);
    expect(perCore(0.5, 1)).toBe(0.5);
    expect(perCore(0.5, 8)).toBe(4);
  });
});
