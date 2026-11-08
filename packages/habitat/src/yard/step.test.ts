import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { projectAll } from "../world/project.ts";
import { emptyHabitat } from "../world/types.ts";
import { unfoldBudget } from "./gate.ts";
import { digestOf, moveByHand, stepYard, withYardStep } from "./step.ts";
import { aSetting, askedIn, calm, isoAt, noon, proposed } from "./testing.ts";
import { type YardContext, type YardRule, type YardState, yardOf } from "./types.ts";

const asked: YardContext = { ...calm, ...askedIn("s1", noon - 30 * second) };

const eachItsOwn = (index: number): string => `creature-${index + 1}`;

function yardWith(
  count: number,
  rung: "card" | "unfold" = "unfold",
  creatureOf: (index: number) => string = () => "bea",
): YardState {
  const settings = Array.from({ length: count }, (_, index) =>
    proposed(
      index + 1,
      aSetting({
        id: `n${index + 1}`,
        creature: creatureOf(index),
        rung,
        at: isoAt(noon + index * second),
        what: { kind: "note", ref: `note ${index + 1}` },
      }),
    ),
  );
  return yardOf(projectAll(emptyHabitat(), settings));
}

describe("stepping the yard", () => {
  it("decides each waiting setting once, records why, and scores its depth", () => {
    const stepped = stepYard(yardWith(1), asked, noon + 2 * second);
    expect(stepped.settings.n1).toMatchObject({ shown: "unfold", depth: 8 });
    expect(stepped.decisions).toEqual([
      expect.objectContaining({ id: "n1", rung: "unfold", reason: "you asked, it shows" }),
    ]);
    expect(stepped.budget.played).toEqual([noon + 2 * second]);
    expect(stepYard(stepped, asked, noon + 2 * second)).toBe(stepped);
    const again = stepYard(stepped, asked, noon + 3 * second);
    expect(again.decisions).toHaveLength(1);
  });

  it("unfolds six in ten minutes, then holds the rest as cards and lists them in the digest", () => {
    const stepped = stepYard(yardWith(8, "unfold", eachItsOwn), asked, noon + 10 * second);
    const rungs = Object.values(stepped.settings).map((setting) => setting.shown);
    expect(rungs.filter((rung) => rung === "unfold")).toHaveLength(unfoldBudget.unfolds);
    expect(digestOf(stepped).map((setting) => setting.id)).toEqual(["n8", "n7"]);
    const raised = moveByHand(stepped, "n7", "unfold", noon + 20 * second);
    expect(digestOf(raised).map((setting) => setting.id)).toEqual(["n8"]);
  });

  it("holds everything as cards while the keeper is away, and never re-decides on return", () => {
    const away = stepYard(yardWith(2), { ...asked, visible: false }, noon + 10 * second);
    expect(Object.values(away.settings).map((setting) => setting.shown)).toEqual(["card", "card"]);
    const back = stepYard(away, asked, noon + 20 * second);
    expect(Object.values(back.settings).map((setting) => setting.shown)).toEqual(["card", "card"]);
    expect(back.decisions).toEqual(away.decisions);
  });

  it("carries the rules it decided under", () => {
    const rule: YardRule = { creature: "bea", kind: "note", rung: "lantern", lasts: "always" };
    const ruled = stepYard(yardWith(1, "card"), { ...calm, rules: [rule] }, noon);
    expect(ruled.rules).toEqual([rule]);
    expect(ruled.settings.n1?.shown).toBe("lantern");
    expect(stepYard(ruled, { ...calm, rules: [{ ...rule }] }, noon)).toBe(ruled);
  });

  it("moves a setting by the keeper's hand, past every gate, and keeps one stage", () => {
    const yard = stepYard(yardWith(2, "card"), calm, noon);
    const staged = moveByHand(yard, "n1", "stage", noon + minute);
    expect(staged.settings.n1?.shown).toBe("stage");
    expect(staged.decisions.at(-1)).toMatchObject({ id: "n1", verdict: "play", reason: "by hand" });
    const restaged = moveByHand(staged, "n2", "stage", noon + 2 * minute);
    expect(restaged.settings.n1?.shown).toBe("unfold");
    expect(restaged.settings.n2?.shown).toBe("stage");
    expect(restaged.decisions.at(-2)).toMatchObject({ id: "n1", verdict: "reduce" });
    expect(moveByHand(restaged, "n2", "stage", noon)).toBe(restaged);
    expect(moveByHand(restaged, "missing", "card", noon)).toBe(restaged);
  });

  it("returns the very same habitat when stepping changes nothing", () => {
    const state = emptyHabitat();
    expect(withYardStep(state, calm, noon)).toBe(state);
    const set = projectAll(state, [proposed(1, aSetting())]);
    const stepped = withYardStep(set, calm, noon);
    expect(yardOf(stepped).settings["set-1"]?.shown).toBe("card");
    expect(withYardStep(stepped, calm, noon)).toBe(stepped);
  });
});
