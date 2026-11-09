import { emptyYard, type YardState } from "@keywork-app/habitat";
import { createRoot, createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ChangesAt, soonestWakeMs, wakeWhenTheYardChanges } from "./wake.ts";

beforeEach(() => vi.useFakeTimers({ now: 0 }));
afterEach(() => vi.useRealTimers());

describe("the yard's own wake", () => {
  it("wakes exactly when the kernel says the yard next changes by itself, and not before", () => {
    const run = wakeOver((_yard, at) => (at < 120_000 ? 120_000 : undefined));
    vi.advanceTimersByTime(119_999);
    expect(run.wakes()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(run.wakes()).toBe(1);
    vi.advanceTimersByTime(600_000);
    expect(run.wakes()).toBe(1);
    run.dispose();
  });

  it("reschedules whenever the yard changes, keeping only the newest wake", () => {
    let next = 60_000;
    const run = wakeOver(() => next);
    next = 10_000;
    run.change();
    vi.advanceTimersByTime(10_000);
    expect(run.wakes()).toBe(1);
    run.dispose();
  });

  it("asks again after a wake that changed nothing, so a later moment is never lost", () => {
    const moments = [5_000, 9_000];
    const run = wakeOver((_yard, at) => moments.find((moment) => moment > at));
    vi.advanceTimersByTime(9_000);
    expect(run.wakes()).toBe(2);
    run.dispose();
  });

  it("never wakes sooner than its floor, even for a moment already past", () => {
    const run = wakeOver((_yard, at) => (at < soonestWakeMs ? 0 : undefined));
    vi.advanceTimersByTime(soonestWakeMs - 1);
    expect(run.wakes()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(run.wakes()).toBe(1);
    run.dispose();
  });

  it("sleeps for good once it is disposed", () => {
    const run = wakeOver(() => 1_000);
    run.dispose();
    vi.advanceTimersByTime(5_000);
    expect(run.wakes()).toBe(0);
  });
});

function wakeOver(changesAt: ChangesAt) {
  return createRoot((dispose) => {
    const [yard, setYard] = createSignal<YardState>(emptyYard);
    let wakes = 0;
    wakeWhenTheYardChanges({
      yard,
      changesAt,
      now: () => Date.now(),
      wake: () => {
        wakes += 1;
      },
    });
    return {
      wakes: () => wakes,
      change: () => setYard({ ...emptyYard, decisions: [] }),
      dispose,
    };
  });
}
