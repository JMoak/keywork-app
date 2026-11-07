import { describe, expect, it } from "vitest";
import { nudge, retarget, settled, snapped, spring, stepSpring } from "./spring.ts";

describe("half-life springs", () => {
  it("closes half the distance to the target in one half-life, from rest, within a few percent", () => {
    const halfLife = 60;
    let state = retarget(spring(0, halfLife), 1);
    for (let t = 0; t < halfLife; t += 1) state = stepSpring(state, 1);
    expect(state.value).toBeGreaterThan(0.3);
    expect(state.value).toBeLessThan(0.7);
    for (let t = 0; t < 10 * halfLife; t += 1) state = stepSpring(state, 1);
    expect(settled(state, 1e-2)).toBe(true);
  });

  it("lands in the same place at a different frame rate, so motion never depends on the frame", () => {
    const coarse = integrate(retarget(spring(0, 80), 1), 240, 16);
    const fine = integrate(retarget(spring(0, 80), 1), 240, 4);
    expect(Math.abs(coarse.value - fine.value)).toBeLessThan(0.02);
  });

  it("never overshoots when critically damped from rest", () => {
    let state = retarget(spring(0, 50), 1);
    let peak = 0;
    for (let t = 0; t < 1000; t++) {
      state = stepSpring(state, 1);
      peak = Math.max(peak, state.value);
    }
    expect(peak).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("takes an impulse and settles back, and can be snapped under reduced motion", () => {
    const kicked = nudge(spring(1, 60), -0.01);
    expect(kicked.velocity).toBe(-0.01);
    const later = integrate(kicked, 2000, 16);
    expect(settled(later, 1e-3)).toBe(true);
    expect(snapped(retarget(spring(0, 60), 1))).toMatchObject({ value: 1, velocity: 0 });
    expect(stepSpring(kicked, 0)).toBe(kicked);
    expect(retarget(kicked, kicked.target)).toBe(kicked);
  });
});

function integrate(initial: ReturnType<typeof spring>, total: number, step: number) {
  let state = initial;
  for (let elapsed = 0; elapsed < total; elapsed += step) state = stepSpring(state, step);
  return state;
}
