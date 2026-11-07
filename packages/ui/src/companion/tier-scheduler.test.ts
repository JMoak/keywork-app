import { describe, expect, it } from "vitest";
import type { Tier } from "./port.ts";
import { cadenceOf, effectiveTier, type SchedulerHost, tierScheduler } from "./tier-scheduler.ts";

interface FakeHost extends SchedulerHost {
  advance(ms: number): void;
  frames: number;
}

function fakeHost(frameMs = 1000 / 60): FakeHost {
  let now = 0;
  interface Timer {
    due: number;
    fn: () => void;
  }
  const timers = new Set<Timer>();
  const host: FakeHost = {
    frames: 0,
    now: () => now,
    setTimeout: (fn, ms) => {
      const timer = { due: now + ms, fn };
      timers.add(timer);
      return timer;
    },
    clearTimeout: (handle) => timers.delete(handle as Timer),
    requestAnimationFrame: (fn) => {
      host.frames += 1;
      const timer = { due: now + frameMs, fn: () => fn(now) };
      timers.add(timer);
      return timer;
    },
    cancelAnimationFrame: (handle) => timers.delete(handle as Timer),
    random: () => 0.5,
    advance: (ms) => {
      const end = now + ms;
      for (;;) {
        const next = [...timers]
          .filter((timer) => timer.due <= end)
          .sort((a, b) => a.due - b.due)[0];
        if (next === undefined) break;
        timers.delete(next);
        now = next.due;
        next.fn();
      }
      now = end;
    },
  };
  return host;
}

const budgets: Record<Tier, number> = {
  interact: Number.POSITIVE_INFINITY,
  active: 35,
  ambient: 16,
  rest: 1,
  hidden: 0,
};

function wakeupsOver60s(
  tier: Tier,
  onBattery: boolean,
  nextChangeIn: number,
): { wakeups: number; draws: number } {
  const host = fakeHost();
  let draws = 0;
  const scheduler = tierScheduler(host, (now) => {
    draws += 1;
    return now + nextChangeIn;
  });
  scheduler.setTier(tier, onBattery);
  host.advance(60_000);
  return { wakeups: scheduler.takeWakeups(), draws };
}

describe("tierScheduler", () => {
  it("holds the ambient budget for 60 s even when the clip wants faster changes", () => {
    expect(wakeupsOver60s("ambient", false, 10).wakeups).toBeLessThanOrEqual(budgets.ambient * 60);
    expect(wakeupsOver60s("ambient", false, 66).wakeups).toBeLessThanOrEqual(budgets.ambient * 60);
    expect(wakeupsOver60s("ambient", true, 10).wakeups).toBeLessThanOrEqual(8 * 60);
    expect(wakeupsOver60s("ambient", false, 1680).wakeups).toBeLessThanOrEqual(60_000 / 1680 + 1);
  });

  it("holds the rest budget for 60 s: timers of a second or more, with tolerance", () => {
    const rest = wakeupsOver60s("rest", false, 100);
    expect(rest.wakeups).toBeLessThanOrEqual(budgets.rest * 60);
    expect(rest.wakeups).toBeGreaterThan(50);
  });

  it("schedules nothing at all when hidden or still", () => {
    expect(wakeupsOver60s("hidden", false, 10)).toEqual({ wakeups: 0, draws: 0 });
    const host = fakeHost();
    let draws = 0;
    const scheduler = tierScheduler(host, (now) => {
      draws += 1;
      return now + 100;
    });
    scheduler.setStill(true);
    scheduler.setTier("ambient", false);
    host.advance(60_000);
    expect(draws).toBe(1);
    expect(scheduler.takeWakeups()).toBe(0);
  });

  it("gates the active tier to its frame rate without a frame loop, and interacts at display rate", () => {
    const active = wakeupsOver60s("active", false, 0);
    expect(active.wakeups).toBeLessThanOrEqual(budgets.active * 60);
    expect(active.wakeups).toBeGreaterThan(25 * 60);
    const host = fakeHost();
    const scheduler = tierScheduler(host, (now) => now);
    scheduler.setTier("interact", false);
    host.advance(1000);
    expect(host.frames).toBeGreaterThanOrEqual(59);
    scheduler.stop();
    host.advance(1000);
    expect(host.frames).toBeLessThanOrEqual(62);
  });

  it("drops to hidden when the ceiling says so and lets the pointer win over rest", () => {
    expect(effectiveTier("hidden", "interact")).toBe("hidden");
    expect(effectiveTier("rest", "interact")).toBe("interact");
    expect(effectiveTier("rest", "active")).toBe("rest");
    expect(effectiveTier("ambient", "active")).toBe("active");
    expect(cadenceOf("rest", false)).toEqual({ minGapMs: 1000, tolerance: 0.1, frameLoop: false });
  });
});
