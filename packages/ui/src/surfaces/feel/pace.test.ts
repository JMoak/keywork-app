import { type MotionPrefs, mulberry32 } from "@keywork-app/habitat";
import { moods } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import type { Desk, ScreenRect, SurfaceShow } from "../port.ts";
import { arrivalPlan, type Cue, dealPlan, type Start } from "./choreography.ts";
import { pacedMs, pacedStarts, paceMetrics } from "./pace.ts";
import { inTurn } from "./patterns.ts";

const nine = inTurn(Array.from({ length: 9 }, (_, at) => `pane-${at}`));
const sixteen = inTurn(Array.from({ length: 16 }, (_, at) => `pane-${at}`));

const lastOf = (starts: readonly Start[]): number => Math.max(...starts.map((start) => start.atMs));
const idsOf = (starts: readonly Start[]): string[] => starts.map((start) => start.id);
const gapsOf = (starts: readonly Start[]): number[] =>
  starts.slice(1).map((start, at) => start.atMs - (starts[at]?.atMs ?? 0));

const area: ScreenRect = { x: 0, y: 0, width: 1920, height: 1040 };
const desk: Desk = {
  console: { x: 200, y: 100, width: 900, height: 700 },
  consoleMaximized: false,
  workArea: area,
  displays: [{ bounds: area, workArea: area, scaleFactor: 1 }],
  cursor: { x: 640, y: 480 },
};
const gliding: MotionPrefs = { reducedMotion: false, tier: "interact" };
const reduced: MotionPrefs = { reducedMotion: true, tier: "interact" };
const hidden: MotionPrefs = { reducedMotion: false, tier: "hidden" };

function showsFor(starts: readonly Start[]): SurfaceShow[] {
  return starts.map(({ id }, at) => ({
    id,
    bounds: { x: 1200 + at * 20, y: 100 + at * 20, width: 400, height: 300 },
    origin: "creature",
    focus: false,
    follows: true,
    backdrop: "backdrop",
    title: id,
  }));
}

function glides(cues: readonly Cue[]): number[] {
  return cues.flatMap((cue) => (cue.kind === "glide" ? [cue.glide.durationMs] : []));
}

describe("the pace a mood gives", () => {
  it("widens the gaps and lengthens the glide when calm, and closes both up when eager", () => {
    expect(lastOf(pacedStarts(nine, { mood: "calm" }))).toBeGreaterThan(lastOf(nine) * 1.5);
    expect(lastOf(pacedStarts(nine, { mood: "eager" }))).toBeLessThan(lastOf(nine) * 0.6);
    expect(pacedMs(200, { mood: "calm" })).toBe(350);
    expect(pacedMs(200, { mood: "eager" })).toBe(140);
    expect(idsOf(pacedStarts(nine, { mood: "calm" }))).toEqual(idsOf(nine));
  });

  it("brings everything at once when urgent, the lead a beat ahead of the rest", () => {
    const together = pacedStarts(nine, { mood: "urgent", lead: "pane-4" });
    expect(together[0]).toEqual({ id: "pane-4", atMs: 0 });
    expect(new Set(together.slice(1).map((start) => start.atMs))).toEqual(
      new Set([paceMetrics.leadAheadMs]),
    );
    expect(new Set(pacedStarts(nine, { mood: "urgent" }).map((start) => start.atMs))).toEqual(
      new Set([0]),
    );
  });

  it("varies the order and the rhythm when playful, within the same time, the same way for a seed", () => {
    const lively = pacedStarts(nine, { mood: "playful", random: mulberry32(7) });
    expect(idsOf(lively).toSorted()).toEqual(idsOf(nine).toSorted());
    expect(idsOf(lively)).not.toEqual(idsOf(nine));
    expect([lively[0]?.atMs, lastOf(lively)]).toEqual([0, lastOf(nine)]);
    expect(new Set(gapsOf(lively)).size).toBeGreaterThan(1);
    expect(lively.map((start) => start.atMs)).toEqual(
      lively.map((start) => start.atMs).toSorted((one, other) => one - other),
    );
    expect(pacedStarts(nine, { mood: "playful", random: mulberry32(7) })).toEqual(lively);
  });

  it("never keeps sixteen panes long, whatever the mood", () => {
    for (const mood of moods) {
      const starts = pacedStarts(sixteen, { mood, random: mulberry32(1) });
      expect([mood, lastOf(starts) + pacedMs(200, { mood }) <= 1200]).toEqual([mood, true]);
    }
  });
});

describe("a plan taking a pace", () => {
  it("glides longer and later when calm, and exactly as built with no mood", () => {
    const shows = showsFor(nine);
    const built = arrivalPlan(desk, shows, nine, gliding);
    const calm = arrivalPlan(desk, shows, nine, gliding, { mood: "calm" });
    expect(arrivalPlan(desk, shows, nine, gliding, { mood: "brisk" })).toEqual(built);
    expect(calm.endsAtMs).toBeGreaterThan(built.endsAtMs * 1.4);
    expect(Math.min(...glides(calm.cues))).toBeGreaterThan(Math.max(...glides(built.cues)));
  });

  it("gives way entirely to reduced motion and to the hidden tier", () => {
    const shows = showsFor(nine);
    const from = shows.map(({ id, bounds }) => ({ id, bounds }));
    const to = from.map(({ id, bounds }) => ({ id, bounds: { ...bounds, x: bounds.x - 300 } }));
    for (const mood of moods) {
      const pacing = { mood, lead: "pane-3", random: mulberry32(3) };
      for (const prefs of [reduced, hidden]) {
        expect(arrivalPlan(desk, shows, nine, prefs, pacing)).toEqual(
          arrivalPlan(desk, shows, nine, prefs),
        );
        expect(dealPlan(from, to, nine, prefs, pacing)).toEqual(dealPlan(from, to, nine, prefs));
      }
    }
  });
});
