import { describe, expect, it } from "vitest";
import { framePacer, glideFrameMs, type PacerClock, timerLatenessOn } from "./pacer.ts";

interface Loop extends PacerClock {
  slept: number[];
  deferred: number;
  turns(count: number, turnMs?: number): void;
  spend(ms: number): void;
}

function loop(): Loop {
  let now = 0;
  let queue: Array<() => void> = [];
  let timers: Array<{ due: number; run: () => void }> = [];
  const clock: Loop = {
    slept: [],
    deferred: 0,
    now: () => now,
    defer: (run) => {
      clock.deferred += 1;
      queue.push(run);
    },
    sleep: (run, ms) => {
      clock.slept.push(ms);
      timers.push({ due: now + ms, run });
    },
    spend: (ms) => {
      now += ms;
    },
    turns: (count, turnMs = 0.25) => {
      for (let turn = 0; turn < count; turn += 1) {
        now += turnMs;
        const ready = queue;
        queue = [];
        for (const run of ready) run();
        const woken = timers.filter((timer) => timer.due <= now);
        timers = timers.filter((timer) => timer.due > now);
        for (const timer of woken) timer.run();
      }
    },
  };
  return clock;
}

function gapsOf(stamps: number[]): number[] {
  return stamps.slice(1).map((at, index) => at - (stamps[index] ?? at));
}

describe("framePacer", () => {
  it("ticks once a frame, spending the wait in the event loop where timers wake too late", () => {
    const clock = loop();
    const ticks: number[] = [];
    framePacer(clock, { frameMs: 8, timerLatenessMs: 16 })(() => ticks.push(clock.now()));
    clock.turns(400);
    expect(clock.slept).toEqual([]);
    expect(ticks.length).toBeGreaterThanOrEqual(11);
    for (const gap of gapsOf(ticks)) {
      expect(gap).toBeGreaterThanOrEqual(8);
      expect(gap).toBeLessThan(8.5);
    }
  });

  it("sleeps most of the frame where a timer wakes on time, and only yields for the last of it", () => {
    const clock = loop();
    const ticks: number[] = [];
    framePacer(clock, { frameMs: 8, timerLatenessMs: 1 })(() => ticks.push(clock.now()));
    clock.turns(400);
    expect(ticks.length).toBeGreaterThanOrEqual(11);
    expect(clock.slept.length).toBeGreaterThanOrEqual(ticks.length);
    expect(clock.deferred).toBeLessThan(ticks.length * 8);
    for (const gap of gapsOf(ticks)) expect(gap).toBeLessThan(8.5);
  });

  it("ticks back to back when one tick costs more than a frame", () => {
    const clock = loop();
    const ticks: number[] = [];
    framePacer(clock, { frameMs: 8, timerLatenessMs: 16 })(() => {
      ticks.push(clock.now());
      clock.spend(11);
    });
    clock.turns(40);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const gap of gapsOf(ticks)) {
      expect(gap).toBeGreaterThanOrEqual(11);
      expect(gap).toBeLessThan(11.5);
    }
  });

  it("stops ticking and stops yielding once it is stopped", () => {
    const clock = loop();
    let ticks = 0;
    const stop = framePacer(clock, { frameMs: 8, timerLatenessMs: 16 })(() => {
      ticks += 1;
    });
    clock.turns(100);
    const before = ticks;
    stop();
    clock.turns(1);
    const deferred = clock.deferred;
    clock.turns(100);
    expect(ticks).toBe(before);
    expect(clock.deferred).toBe(deferred);
  });
});

describe("timerLatenessOn", () => {
  it("is longer than a frame on Windows and a millisecond elsewhere", () => {
    expect(timerLatenessOn("win32")).toBeGreaterThan(glideFrameMs);
    expect(timerLatenessOn("darwin")).toBe(1);
    expect(timerLatenessOn("linux")).toBe(1);
  });
});
