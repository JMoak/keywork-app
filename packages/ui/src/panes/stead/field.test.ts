import type { PowerTier } from "@keywork-app/habitat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  browserFieldHost,
  type FieldPicture,
  interactHoldMs,
  steadField,
  tierAt,
} from "./field.ts";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", undefined);
  vi.stubGlobal("cancelAnimationFrame", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the stead field's tier", () => {
  it("rests when unfocused and nothing moves, and wakes to interact on input", () => {
    const at = 50_000;
    expect(tierAt(at, Number.NEGATIVE_INFINITY, false, true)).toBe("rest");
    expect(tierAt(at, Number.NEGATIVE_INFINITY, false, false)).toBe("ambient");
    expect(tierAt(at, at - interactHoldMs / 2, false, true)).toBe("interact");
    expect(tierAt(at, at - interactHoldMs / 2, true, true)).toBe("hidden");
  });
});

describe("the stead field's wakes", () => {
  it("spaces rest wakes a second apart even when every pose asks for a change each 100 ms", () => {
    const tiers: PowerTier[] = [];
    const field = steadField(browserFieldHost(), sensing({ resting: true }), (now, tier) => {
      tiers.push(tier);
      return picture(now + 100, true);
    });
    field.redraw();
    const mounted = field.wakes();
    vi.advanceTimersByTime(10_000);
    expect(field.tier()).toBe("rest");
    expect(new Set(tiers)).toEqual(new Set(["rest"]));
    expect(field.frames()).toBe(0);
    expect(field.wakes() - mounted).toBeLessThanOrEqual(10);
    field.stop();
  });

  it("leaves rest for ambient the moment a figure moves, and returns once all stand still", async () => {
    let moving = false;
    const field = steadField(browserFieldHost(), sensing({ resting: true }), (now) =>
      picture(now + 100, !moving),
    );
    field.redraw();
    expect(field.tier()).toBe("rest");
    moving = true;
    field.request();
    await Promise.resolve();
    await Promise.resolve();
    expect(field.tier()).toBe("ambient");
    const walking = field.wakes();
    vi.advanceTimersByTime(1000);
    expect(field.wakes() - walking).toBeGreaterThan(5);
    moving = false;
    vi.advanceTimersByTime(200);
    await Promise.resolve();
    expect(field.tier()).toBe("rest");
    field.stop();
  });

  it("schedules nothing while hidden", () => {
    const field = steadField(browserFieldHost(), sensing({ resting: true, hidden: true }), (now) =>
      picture(now + 100, true),
    );
    field.redraw();
    vi.advanceTimersByTime(10_000);
    expect(field.tier()).toBe("hidden");
    expect(field.wakes()).toBe(0);
    field.stop();
  });
});

function sensing(at: { resting: boolean; hidden?: boolean }) {
  return {
    hidden: () => at.hidden ?? false,
    resting: () => at.resting,
    lastInputAt: () => Number.NEGATIVE_INFINITY,
  };
}

function picture(nextWakeAt: number, still: boolean): FieldPicture {
  return { nextWakeAt, still };
}
