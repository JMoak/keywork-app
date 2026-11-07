import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { mulberry32 } from "../clock/random.ts";
import { whimsyOf } from "./creature.ts";
import {
  chooseIdle,
  cooldowns,
  type IdleKind,
  idleGap,
  type Mood,
  nextIdleDelay,
  type Opportunities,
} from "./idle.ts";
import { freshNeeds, needsAfter, relieved } from "./needs.ts";

const now = 1_000_000;

const quietStead: Opportunities = {
  crateArrived: false,
  treeExists: false,
  beyondGates: [],
  inspectables: [],
  pointerNear: false,
  nearThePorch: false,
};

function mood(overrides: Partial<Mood> = {}): Mood {
  return { needs: freshNeeds, whimsy: 0.6, recent: [], now, quietHours: false, ...overrides };
}

function tally(moodOf: () => Mood, where: Opportunities, runs = 300): Map<IdleKind, number> {
  const counts = new Map<IdleKind, number>();
  for (let seed = 1; seed <= runs; seed++) {
    const choice = chooseIdle(mulberry32(seed), moodOf(), where);
    if (choice !== undefined) counts.set(choice.kind, (counts.get(choice.kind) ?? 0) + 1);
  }
  return counts;
}

describe("the idle repertoire", () => {
  it("waits twenty to ninety seconds between activities, longer when every need is low", () => {
    for (let seed = 0; seed < 50; seed++) {
      const delay = nextIdleDelay(mulberry32(seed), freshNeeds);
      expect(delay).toBeGreaterThanOrEqual(idleGap.min);
      expect(delay).toBeLessThanOrEqual(idleGap.max);
    }
    const content = nextIdleDelay(() => 0.5, { rest: 0.05, curiosity: 0.05, order: 0.05 });
    const pressed = nextIdleDelay(() => 0.5, { rest: 0.9, curiosity: 0.9, order: 0.9 });
    expect(content).toBeGreaterThan(pressed);
  });

  it("naps far more often when rest presses, and never when rested unless the house is quiet", () => {
    const tired = tally(() => mood({ needs: { ...freshNeeds, rest: 0.9 } }), quietStead);
    const rested = tally(() => mood({ needs: { ...freshNeeds, rest: 0.1 } }), quietStead);
    expect(tired.get("rest") ?? 0).toBeGreaterThan(150);
    expect(rested.get("rest") ?? 0).toBe(0);
    const quiet = tally(
      () => mood({ needs: { ...freshNeeds, rest: 0.1 }, quietHours: true }),
      quietStead,
    );
    expect(quiet.get("rest") ?? 0).toBeGreaterThan(0);
  });

  it("only tidies after a crate arrived, only tends once a tree exists, only looks when the keeper is near", () => {
    const bare = tally(
      () => mood({ needs: { rest: 0.2, curiosity: 0.3, order: 0.9 } }),
      quietStead,
    );
    expect(bare.get("tidy") ?? 0).toBe(0);
    expect(bare.get("tend") ?? 0).toBe(0);
    expect(bare.get("look") ?? 0).toBe(0);
    const stocked = tally(() => mood({ needs: { rest: 0.2, curiosity: 0.3, order: 0.9 } }), {
      ...quietStead,
      crateArrived: true,
      treeExists: true,
      pointerNear: true,
    });
    expect(stocked.get("tidy") ?? 0).toBeGreaterThan(0);
    expect(stocked.get("tend") ?? 0).toBeGreaterThan(0);
    expect(stocked.get("look") ?? 0).toBeGreaterThan(0);
  });

  it("wanders through open gates and inspects what the stead offers, never a thing it does not have", () => {
    const curious = () => mood({ needs: { rest: 0.1, curiosity: 0.95, order: 0.1 }, whimsy: 0 });
    const home = chooseIdle(mulberry32(3), curious(), quietStead);
    expect(home?.kind).toBe("wander");
    expect(["tree", "fence", "mill", "storehouse"]).toContain(home?.target);
    const away = chooseIdle(mulberry32(3), curious(), {
      ...quietStead,
      beyondGates: ["parcel:spark"],
    });
    expect(away?.target).toBe("parcel:spark");
    const inspecting = tally(
      () =>
        mood({
          needs: { rest: 0.1, curiosity: 0.8, order: 0.1 },
          recent: [{ kind: "wander", at: now - 1000 }],
        }),
      { ...quietStead, inspectables: ["board", "mill"] },
    );
    expect(inspecting.get("inspect") ?? 0).toBeGreaterThan(0);
    expect(inspecting.get("wander") ?? 0).toBe(0);
  });

  it("never repeats the last activity at once, and honours each kind's cooldown", () => {
    const stretched = tally(
      () => mood({ recent: [{ kind: "stretch", at: now - 10 * minute }] }),
      quietStead,
    );
    expect(stretched.get("stretch") ?? 0).toBe(0);
    const satLately = tally(
      () =>
        mood({
          recent: [
            { kind: "sit", at: now - 30 * second },
            { kind: "stretch", at: now - 5 * second },
          ],
        }),
      quietStead,
    );
    expect(satLately.get("sit") ?? 0).toBe(0);
    expect(cooldowns.sit).toBe(2 * minute);
    const tiredAgain = chooseIdle(
      mulberry32(1),
      mood({
        needs: { ...freshNeeds, rest: 0.9 },
        whimsy: 0,
        recent: [{ kind: "rest", at: now - 20 * minute }],
      }),
      quietStead,
    );
    expect(tiredAgain?.kind).toBe("rest");
  });

  it("lives the same repertoire beside the crate as anywhere else, and sits on the step rather than the fence", () => {
    const lively = { needs: { rest: 0.9, curiosity: 0.9, order: 0.9 } };
    const away = { ...quietStead, crateArrived: true, treeExists: true };
    const near = tally(() => mood(lively), { ...away, nearThePorch: true });
    const far = tally(() => mood(lively), away);
    expect([...near.keys()].sort()).toEqual([...far.keys()].sort());
    expect(near.size).toBeGreaterThanOrEqual(4);
    expect(
      chooseIdle(
        mulberry32(2),
        mood({ whimsy: 0, needs: { rest: 0.1, curiosity: 0.1, order: 0.1 } }),
        { ...quietStead, nearThePorch: true },
      )?.target,
    ).toBe("porch");
  });

  it("gives whimsy its say: zero whimsy is a stable argmax, more whimsy widens the field", () => {
    const steady = new Set<IdleKind>();
    for (let seed = 1; seed <= 40; seed++) {
      steady.add(chooseIdle(mulberry32(seed), mood({ whimsy: 0 }), quietStead)?.kind as IdleKind);
    }
    expect(steady.size).toBe(1);
    const whimsical = tally(() => mood({ whimsy: 0.85 }), quietStead);
    expect(whimsical.size).toBeGreaterThanOrEqual(2);
    expect(whimsyOf("tinker")).toBe(whimsyOf("tinker"));
    expect(whimsyOf("tinker")).toBeGreaterThanOrEqual(0.35);
    expect(whimsyOf("tinker")).toBeLessThanOrEqual(0.85);
    expect(whimsyOf("tinker")).not.toBe(whimsyOf("smith"));
  });

  it("returns nothing when every candidate is cooling down", () => {
    const everything = (
      ["rest", "stretch", "wander", "inspect", "look", "tidy", "tend", "sit"] as const
    ).map((kind) => ({ kind, at: now - 1 }));
    expect(chooseIdle(mulberry32(1), mood({ recent: everything }), quietStead)).toBeUndefined();
  });
});

describe("needs", () => {
  it("rise slowly, faster at the bench, and only ever shape a choice", () => {
    const hourIdle = needsAfter(freshNeeds, 60 * minute, false, false);
    const hourWorking = needsAfter(freshNeeds, 60 * minute, true, false);
    expect(hourIdle.rest).toBeCloseTo(0.2 + 0.125, 3);
    expect(hourWorking.rest).toBeCloseTo(0.2 + 0.375, 3);
    expect(hourIdle.curiosity).toBeGreaterThan(hourWorking.curiosity);
    expect(hourIdle.order).toBe(freshNeeds.order);
    expect(needsAfter(freshNeeds, 60 * minute, false, true).order).toBeGreaterThan(
      freshNeeds.order,
    );
    expect(needsAfter(freshNeeds, 48 * 60 * minute, true, true)).toEqual({
      rest: 1,
      curiosity: 1,
      order: 1,
    });
    expect(needsAfter(freshNeeds, -5, false, false)).toEqual(freshNeeds);
  });

  it("are relieved by the activity that answers them", () => {
    const tired = { rest: 0.9, curiosity: 0.9, order: 0.9 };
    expect(relieved(tired, "rest").rest).toBeCloseTo(0.45);
    expect(relieved(tired, "wander").curiosity).toBeCloseTo(0.6);
    expect(relieved(tired, "tidy").order).toBeCloseTo(0.5);
    expect(relieved(tired, "tend").order).toBeCloseTo(0.5);
    expect(relieved(tired, "look").curiosity).toBeCloseTo(0.72);
    expect(relieved(tired, "sit").rest).toBeCloseTo(0.8);
    expect(relieved(tired, "stretch").rest).toBeCloseTo(0.82);
    expect(relieved(tired, "inspect").curiosity).toBeCloseTo(0.72);
  });
});
