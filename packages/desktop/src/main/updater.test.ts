import { describe, expect, it } from "vitest";
import {
  checkIntervalMs,
  launchCheckDelayMs,
  runUpdater,
  scheduleOf,
  shouldCheck,
  type UpdateReady,
  type UpdateSource,
} from "./updater.ts";

const hour = 60 * 60 * 1000;

describe("shouldCheck", () => {
  it("checks when nothing has been checked yet", () => {
    expect(shouldCheck(0, undefined)).toBe(true);
  });

  it("waits six hours between checks", () => {
    expect(shouldCheck(5 * hour, 0)).toBe(false);
    expect(shouldCheck(6 * hour, 0)).toBe(true);
    expect(shouldCheck(6 * hour + 1, 0)).toBe(true);
  });
});

describe("scheduleOf", () => {
  it("delays the launch check so startup stays quiet", () => {
    expect(scheduleOf(1000, undefined)).toEqual({ dueInMs: launchCheckDelayMs });
  });

  it("measures the next check from the last one and never goes negative", () => {
    expect(scheduleOf(2 * hour, 0)).toEqual({ dueInMs: 4 * hour });
    expect(scheduleOf(9 * hour, 0)).toEqual({ dueInMs: 0 });
  });
});

describe("runUpdater", () => {
  function harness() {
    let clock = 0;
    let checks = 0;
    let downloaded: ((update: UpdateReady) => void) | undefined;
    let accept: (() => void) | undefined;
    const announced: UpdateReady[] = [];
    const logged: string[] = [];
    const timers: { run: () => void; at: number }[] = [];
    const source: UpdateSource = {
      autoDownload: false,
      autoInstallOnAppQuit: true,
      checkForUpdates: async () => {
        checks += 1;
      },
      onDownloaded: (listener) => {
        downloaded = listener;
      },
      onError: () => undefined,
    };
    const updater = runUpdater({
      source,
      announce: (update) => announced.push(update),
      onAccept: (listener) => {
        accept = listener;
      },
      schedule: (run, delayMs) => {
        const timer = { run, at: clock + delayMs };
        timers.push(timer);
        return () => timers.splice(timers.indexOf(timer), 1);
      },
      now: () => clock,
      log: (line) => logged.push(line),
    });
    const advanceTo = (time: number): void => {
      clock = time;
      for (const timer of [...timers].filter((candidate) => candidate.at <= time)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.run();
      }
    };
    return {
      source,
      updater,
      announced,
      advanceTo,
      checks: () => checks,
      nextDueAt: () => timers[0]?.at,
      download: (update: UpdateReady) => downloaded?.(update),
      accept: () => accept?.(),
    };
  }

  it("downloads silently and never installs until the user accepts", () => {
    const { source, download, announced, accept } = harness();
    expect(source.autoDownload).toBe(true);
    expect(source.autoInstallOnAppQuit).toBe(false);
    download({ version: "0.2.0" });
    expect(announced).toEqual([{ version: "0.2.0" }]);
    expect(source.autoInstallOnAppQuit).toBe(false);
    accept();
    expect(source.autoInstallOnAppQuit).toBe(true);
  });

  it("checks once after the launch delay and then every six hours", () => {
    const { advanceTo, checks, nextDueAt, updater } = harness();
    expect(nextDueAt()).toBe(launchCheckDelayMs);
    advanceTo(launchCheckDelayMs);
    expect(checks()).toBe(1);
    expect(updater.lastCheckedAt).toBe(launchCheckDelayMs);
    expect(nextDueAt()).toBe(launchCheckDelayMs + checkIntervalMs);
    advanceTo(launchCheckDelayMs + checkIntervalMs);
    expect(checks()).toBe(2);
  });

  it("stops checking once stopped", () => {
    const { advanceTo, checks, nextDueAt, updater } = harness();
    updater.stop();
    expect(nextDueAt()).toBeUndefined();
    advanceTo(launchCheckDelayMs + checkIntervalMs);
    expect(checks()).toBe(0);
  });
});
