import { describe, expect, it } from "vitest";
import {
  busyPercentBetween,
  idleLimits,
  type MachineLoad,
  otherLoad,
  type ProcessRow,
  posixRows,
  recordingDecision,
  windowsRows,
} from "./machine-load.ts";

const idle: MachineLoad = { beforeBusyPercent: 6.2, duringBusyPercent: 14.5, others: [] };

describe("perf:screen records the ratchet only on an idle machine", () => {
  it("writes an idle run and says so", () => {
    expect(recordingDecision(idle, false)).toEqual({
      idle: true,
      write: true,
      reason: "the machine was idle",
    });
    expect(recordingDecision(idle, true)).toEqual(recordingDecision(idle, false));
  });

  it("leaves the recording alone when the CPU was busy before or during the probes, and says how busy", () => {
    const before = { ...idle, beforeBusyPercent: 41.3 };
    expect(recordingDecision(before, false)).toEqual({
      idle: false,
      write: false,
      reason: `the CPU was 41.3% busy before the probes (idle is at most ${idleLimits.beforeBusyPercent}%)`,
    });
    const during = { ...idle, duringBusyPercent: 63 };
    expect(recordingDecision(during, false).write).toBe(false);
    expect(recordingDecision(during, false).reason).toContain("63% busy during the probes");
  });

  it("leaves the recording alone while another electron or test run shares the machine", () => {
    const shared = { ...idle, others: ["electron (pid 5336)", "bun test (pid 30892)"] };
    expect(recordingDecision(shared, false)).toEqual({
      idle: false,
      write: false,
      reason: "other load ran beside it: electron (pid 5336), bun test (pid 30892)",
    });
  });

  it("writes under load only when --record forces it, naming the load", () => {
    const busy = { ...idle, beforeBusyPercent: 41.3, others: ["vitest (pid 41204)"] };
    const decision = recordingDecision(busy, true);
    expect(decision).toMatchObject({ idle: false, write: true });
    expect(decision.reason).toMatch(/^--record, although the CPU was 41.3% busy/);
    expect(decision.reason).toContain("vitest (pid 41204)");
  });
});

describe("machine load", () => {
  it("reads the busy share of every core between two readings", () => {
    expect(busyPercentBetween({ idle: 100, total: 200 }, { idle: 850, total: 1200 })).toBe(25);
    expect(busyPercentBetween({ idle: 5, total: 10 }, { idle: 5, total: 10 })).toBe(0);
  });

  it("names other electron, vitest, playwright and bun test roots, never the perf run's own", () => {
    const rows: ProcessRow[] = [
      { pid: 100, ppid: 1, command: "bun scripts/textures/perf-screen.ts" },
      { pid: 101, ppid: 100, command: "bun run test -- packages/desktop/src/main/screen/loopback" },
      { pid: 102, ppid: 101, command: "node node_modules/vitest/vitest.mjs run loopback" },
      { pid: 103, ppid: 102, command: '"C:\\electron\\dist\\electron.exe" out/main.js' },
      { pid: 5336, ppid: 45, command: '"C:\\electron\\dist\\electron.exe" "--inspect=0" app' },
      { pid: 5337, ppid: 5336, command: '"C:\\electron\\dist\\electron.exe" --type=gpu-process' },
      {
        pid: 30892,
        ppid: 44,
        command: "C:\\bin\\bun.exe run test -- packages/cli/src/serve.test.ts",
      },
      { pid: 30893, ppid: 30892, command: "node vitest.mjs run packages/cli/src/serve.test.ts" },
      { pid: 23644, ppid: 43, command: "node @playwright/test/cli.js test --project perf" },
      { pid: 77, ppid: 1, command: "C:\\Discord\\Discord.exe --type=renderer" },
      { pid: 78, ppid: 1, command: "bun x tsc --build" },
    ];
    expect(otherLoad(rows, 100)).toEqual([
      "electron (pid 5336)",
      "bun test (pid 30892)",
      "playwright (pid 23644)",
    ]);
  });

  it("reads the process listing of Windows and of ps", () => {
    expect(
      windowsRows(
        '[{"ProcessId":4,"ParentProcessId":0,"CommandLine":null},{"ProcessId":9,"ParentProcessId":4,"CommandLine":"electron.exe ."}]',
      ),
    ).toEqual([
      { pid: 4, ppid: 0, command: "" },
      { pid: 9, ppid: 4, command: "electron.exe ." },
    ]);
    expect(windowsRows('{"ProcessId":9,"ParentProcessId":4,"CommandLine":"x"}')).toEqual([
      { pid: 9, ppid: 4, command: "x" },
    ]);
    expect(posixRows("  1     0 /sbin/init\n 42     1 node vitest.mjs run\n")).toEqual([
      { pid: 1, ppid: 0, command: "/sbin/init" },
      { pid: 42, ppid: 1, command: "node vitest.mjs run" },
    ]);
  });
});
