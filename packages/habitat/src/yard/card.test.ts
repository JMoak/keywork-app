import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { projectAll } from "../world/project.ts";
import { emptyHabitat } from "../world/types.ts";
import { yardCard } from "./card.ts";
import { admitUnfold, unfoldBudget, unfoldsSpent } from "./gate.ts";
import { yardIds } from "./place.ts";
import { stepYard } from "./step.ts";
import { aSetting, askedIn, calm, isoAt, noon, proposed } from "./testing.ts";
import { emptyYard, type YardBudget, type YardOwner, type YardState, yardOf } from "./types.ts";

const bea: YardOwner = { kind: "creature", slug: "bea" };

function withBudget(budget: YardBudget): YardState {
  return { ...emptyYard, budget };
}

describe("the yard's own card", () => {
  it("reads an untouched yard as every unfold free now, with nothing decided", () => {
    expect(yardCard(emptyYard, noon)).toEqual({
      id: yardIds.card,
      used: 0,
      limit: unfoldBudget.unfolds,
      windowMs: unfoldBudget.windowMs,
      nextFreeAt: noon,
      cooldowns: [],
      decisions: [],
    });
  });

  it("shows the unfolds spent, the cooling owners and the last decisions after a step", () => {
    const stream = [
      proposed(1, aSetting({ id: "a", rung: "unfold", at: isoAt(noon) })),
      proposed(2, aSetting({ id: "b", rung: "unfold", at: isoAt(noon + second) })),
    ];
    const context = { ...calm, ...askedIn("s1", noon - 30 * second) };
    const yard = stepYard(yardOf(projectAll(emptyHabitat(), stream)), context, noon + 5 * second);
    const card = yardCard(yard, noon + 10 * second);
    expect(card.used).toBe(1);
    expect(card.nextFreeAt).toBe(noon + 10 * second);
    expect(card.cooldowns).toEqual([
      { owner: bea, until: noon + 5 * second + unfoldBudget.cooldownMs },
    ]);
    expect(card.decisions).toBe(yard.decisions);
    expect(card.decisions.map((decision) => decision.reason)).toEqual([
      "you asked, it shows",
      "unfold cooldown",
    ]);
    expect(yardCard(yard, noon + 5 * second + unfoldBudget.cooldownMs).cooldowns).toEqual([]);
  });

  it("names when the next unfold is free once the ceiling is reached", () => {
    const six = Array.from({ length: 6 }, (_, index) => noon - 9 * minute + index * minute);
    const card = yardCard(withBudget({ played: six }), noon);
    expect(card.used).toBe(6);
    expect(card.nextFreeAt).toBe(noon + minute);
  });
});

describe("the yard's own card, for any budget", () => {
  it("frees an unfold exactly at the time it names", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 20 * minute }), { maxLength: 12 }), (agos) => {
        const budget = agos
          .toSorted((a, b) => b - a)
          .reduce<YardBudget>(
            (held, ago) => admitUnfold(held, noon - ago, { owner: bea, outside: false }),
            { played: [] },
          );
        const card = yardCard(withBudget(budget), noon);
        expect(card.nextFreeAt).toBeGreaterThanOrEqual(noon);
        expect(card.used).toBe(unfoldsSpent(budget, noon));
        expect(unfoldsSpent(budget, card.nextFreeAt)).toBeLessThan(unfoldBudget.unfolds);
        if (card.used < card.limit) expect(card.nextFreeAt).toBe(noon);
        else {
          expect(unfoldsSpent(budget, card.nextFreeAt - 1)).toBeGreaterThanOrEqual(
            unfoldBudget.unfolds,
          );
        }
      }),
    );
  });
});
