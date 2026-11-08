import type { SettingKind } from "@keywork-app/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { byDepth, depthHalfLife, depthOf, kindWeights, pinnedDepth } from "./depth.ts";
import { askedIn, aYardSetting, calm, isoAt, noon } from "./testing.ts";
import type { YardContext, YardSetting } from "./types.ts";

function depth(
  setting: Partial<YardSetting>,
  context: Partial<YardContext> = {},
  at = noon,
): number {
  return depthOf(aYardSetting(setting), { ...calm, ...context }, at);
}

describe("depth", () => {
  it("weighs deliveries above links and notes when they arrive together", () => {
    const kinds: readonly SettingKind[] = ["diff", "report", "chore", "url"];
    const depths = kinds.map((kind) => depth({ what: { kind, ref: "r" } }));
    expect(depths).toEqual([5, 4, 3, 2]);
    expect(depths).toEqual(kinds.map((kind) => kindWeights[kind]));
  });

  it("halves a setting's recency every ten minutes", () => {
    const diff = { what: { kind: "diff" as const, ref: "r" } };
    expect(depth(diff, {}, noon + depthHalfLife)).toBe(2.5);
    expect(depth(diff, {}, noon + 2 * depthHalfLife)).toBe(1.25);
    expect(depth(diff, {}, noon - minute)).toBe(5);
  });

  it("deepens what sits in the thread the keeper is looking at, most of all what they asked for", () => {
    const later = noon + 3 * depthHalfLife;
    expect(depth({}, {}, later)).toBe(0.25);
    expect(depth({}, { focusedThread: "s1" }, later)).toBe(4.25);
    expect(depth({}, askedIn("s1", noon - 30 * second), later)).toBe(6.25);
    expect(depth({}, askedIn("s2", noon - 30 * second), later)).toBe(0.25);
  });

  it("keeps pinned settings on top of everything unpinned", () => {
    const oldPinnedNote = depth({ state: "pinned" }, {}, noon + 10 * depthHalfLife);
    const freshAskedDiff = depth(
      { what: { kind: "diff", ref: "r" } },
      askedIn("s1", noon - second),
      noon,
    );
    expect(oldPinnedNote).toBeGreaterThan(freshAskedDiff);
    expect(oldPinnedNote).toBeGreaterThanOrEqual(pinnedDepth);
  });

  it("lets dismissed, withdrawn and seen settings leave the reckoning", () => {
    expect(depth({ state: "dismissed" })).toBe(0);
    expect(depth({ state: "withdrawn" })).toBe(0);
    expect(depth({ state: "seen", until: "rests" })).toBe(0);
    expect(depth({ state: "live", until: "rests" })).toBe(2);
  });

  it("orders by depth, then the newest, then the id", () => {
    const a = aYardSetting({ id: "a", depth: 2, at: isoAt(noon) });
    const b = aYardSetting({ id: "b", depth: 3, at: isoAt(noon - minute) });
    const c = aYardSetting({ id: "c", depth: 2, at: isoAt(noon + minute) });
    const d = aYardSetting({ id: "d", depth: 2, at: isoAt(noon) });
    expect([a, b, c, d].sort(byDepth).map((setting) => setting.id)).toEqual(["b", "c", "a", "d"]);
  });
});

const settingArb = fc.record({
  kind: fc.constantFrom<SettingKind>("file", "diff", "report", "thread", "chore", "url", "note"),
  sessionId: fc.constantFrom("s1", "s2"),
  pinned: fc.boolean(),
  age: fc.integer({ min: 0, max: 120 * minute }),
});

const contextArb = fc.record({
  focusedThread: fc.constantFrom(undefined, "s1", "s2"),
  spokeAt: fc.option(fc.integer({ min: noon - 2 * 60 * minute, max: noon }), { nil: undefined }),
});

describe("depth, for any setting and focus", () => {
  it("puts every pinned setting above every unpinned one and never grows with time", () => {
    fc.assert(
      fc.property(
        settingArb,
        settingArb,
        contextArb,
        fc.integer({ min: 0, max: 60 * minute }),
        (first, second, focus, later) => {
          const context: YardContext = {
            ...calm,
            focusedThread: focus.focusedThread,
            keeperSpokeAt: focus.spokeAt === undefined ? {} : { s1: focus.spokeAt },
          };
          const settingOf = (shape: typeof first, id: string): YardSetting =>
            aYardSetting({
              id,
              sessionId: shape.sessionId,
              what: { kind: shape.kind, ref: id },
              state: shape.pinned ? "pinned" : "live",
              at: isoAt(noon - shape.age),
            });
          const a = settingOf(first, "a");
          const b = settingOf(second, "b");
          if (first.pinned && !second.pinned) {
            expect(depthOf(a, context, noon)).toBeGreaterThan(depthOf(b, context, noon));
          }
          expect(depthOf(a, context, noon + later)).toBeLessThanOrEqual(depthOf(a, context, noon));
          expect(depthOf(a, context, noon + later)).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});
