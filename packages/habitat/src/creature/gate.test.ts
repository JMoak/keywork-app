import { describe, expect, it } from "vitest";
import { minute } from "../clock/clock.ts";
import type { Beat } from "../pose/pose.ts";
import {
  admit,
  ambientBudget,
  decide,
  decisionLogLimit,
  emptyBudget,
  type GateContext,
  recorded,
} from "./gate.ts";

const shown: GateContext = {
  visible: true,
  focused: true,
  fullscreen: false,
  doNotDisturb: false,
  tier: "ambient",
  reducedMotion: false,
  quietHours: false,
};

const fidget: Beat = { clip: "stretch", lane: "ambient" };
const nap: Beat = { clip: "nap", lane: "ambient", walkTo: "hay" };
const work: Beat = { clip: "work", lane: "agent", walkTo: "bench" };
const bell: Beat = { clip: "ring", lane: "needs-you", walkTo: "porch" };
const hover: Beat = { clip: "greet", lane: "input" };

function verdict(beat: Beat, context: Partial<GateContext> = {}, budget = emptyBudget) {
  const decision = decide({ beat, reason: "test" }, { ...shown, ...context }, budget, 1000);
  return `${decision.verdict}:${decision.reason}`;
}

describe("the decision gate", () => {
  it("plays an ambient beat on a shown, calm stead and records why", () => {
    expect(verdict(fidget)).toBe("play:test");
    const decision = decide({ beat: fidget, reason: "idle stretch" }, shown, emptyBudget, 1000);
    expect(decision).toEqual({
      at: 1000,
      lane: "ambient",
      clip: "stretch",
      verdict: "play",
      reason: "idle stretch",
    });
  });

  it("holds ambient and input beats when the creature is not shown, but keeps agent state honest", () => {
    for (const context of [{ visible: false }, { tier: "hidden" as const }]) {
      expect(verdict(fidget, context)).toBe("hold:not shown");
      expect(verdict(hover, context)).toBe("hold:not shown");
      expect(verdict(work, context)).toBe("play:test");
      expect(verdict(bell, context)).toBe("play:test");
    }
  });

  it("holds every fidget under reduced motion and snaps the large ones, so state still changes", () => {
    expect(verdict(fidget, { reducedMotion: true })).toBe("hold:reduced motion");
    expect(verdict(work, { reducedMotion: true })).toBe("reduce:test · snapped");
    expect(verdict({ clip: "wait", lane: "needs-you" }, { reducedMotion: true })).toBe("play:test");
    expect(verdict(hover, { reducedMotion: true })).toBe("reduce:test · snapped");
  });

  it("keeps the peripheral vision quiet in fullscreen, do not disturb and quiet hours, and lets the rest tier live", () => {
    expect(verdict(fidget, { fullscreen: true })).toBe("hold:fullscreen");
    expect(verdict(fidget, { doNotDisturb: true })).toBe("hold:do not disturb");
    expect(verdict(bell, { fullscreen: true, doNotDisturb: true })).toBe("play:test");
    expect(verdict({ clip: "look", lane: "ambient", walkTo: "mill" }, { quietHours: true })).toBe(
      "hold:quiet hours",
    );
    expect(verdict(nap, { quietHours: true })).toBe("play:test");
    expect(verdict(fidget, { tier: "rest" })).toBe("play:test");
    expect(verdict(nap, { tier: "rest" })).toBe("play:test");
  });

  it("spends a frequency budget of eight ambient beats per five minutes", () => {
    let budget = emptyBudget;
    for (let i = 0; i < ambientBudget.beats; i++) budget = admit(budget, 1000 + i);
    expect(verdict(fidget, {}, budget)).toBe("hold:ambient budget");
    expect(verdict(work, {}, budget)).toBe("play:test");
    const later = admit(budget, 1000 + 6 * minute);
    expect(later.played).toEqual([1000 + 6 * minute]);
  });

  it("keeps a bounded log of decisions", () => {
    let log = recorded([], decide({ beat: fidget, reason: "0" }, shown, emptyBudget, 0));
    for (let i = 1; i < decisionLogLimit + 10; i++) {
      log = recorded(log, decide({ beat: fidget, reason: `${i}` }, shown, emptyBudget, i));
    }
    expect(log).toHaveLength(decisionLogLimit);
    expect(log[0]?.reason).toBe("10");
  });
});
