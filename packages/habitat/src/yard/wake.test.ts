import type { Rung, Setting, SettingKind } from "@keywork-app/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hour, minute, second } from "../clock/clock.ts";
import { projectAll } from "../world/project.ts";
import { emptyHabitat } from "../world/types.ts";
import { yardCard } from "./card.ts";
import { unfoldBudget } from "./gate.ts";
import { breakpointWaitMs, foldBackAfterMs, moveByHand, nextChangeAt, stepYard } from "./step.ts";
import { aSetting, askedIn, calm, isoAt, noon, proposed } from "./testing.ts";
import { emptyYard, type YardContext, type YardRule, type YardState, yardOf } from "./types.ts";

const asked: YardContext = { ...calm, ...askedIn("s1", noon - 30 * second) };

function yardWith(settings: readonly Setting[], start: YardState = emptyYard): YardState {
  const stream = settings.map((setting, index) => proposed(index + 1, setting));
  return yardOf(projectAll({ ...emptyHabitat(), yard: start }, stream));
}

const unfoldAtNoon = aSetting({ id: "u", rung: "unfold", at: isoAt(noon) });

describe("the next moment the yard changes by itself", () => {
  it("is never for a yard with nothing waiting, cooling or in the window", () => {
    expect(nextChangeAt(emptyYard, noon)).toBeUndefined();
    const card = stepYard(yardWith([aSetting()]), asked, noon);
    expect(nextChangeAt(card, noon)).toBeUndefined();
  });

  it("is a deferred unfold's two-minute bound", () => {
    const waiting = stepYard(yardWith([unfoldAtNoon]), { ...asked, draftOpen: true }, noon);
    expect(nextChangeAt(waiting, noon + 10 * second)).toBe(noon + breakpointWaitMs);
  });

  it("walks an unfold's cooldown end, then its fold-back and its budget window", () => {
    const unfolded = stepYard(yardWith([unfoldAtNoon]), asked, noon);
    expect(nextChangeAt(unfolded, noon)).toBe(noon + unfoldBudget.cooldownMs);
    const cooled = noon + unfoldBudget.cooldownMs;
    expect(nextChangeAt(unfolded, cooled)).toBe(noon + foldBackAfterMs);
    expect(foldBackAfterMs).toBe(unfoldBudget.windowMs);
    expect(nextChangeAt(unfolded, noon + foldBackAfterMs)).toBeUndefined();
  });

  it("never wakes for a raise by the keeper's hand, which spends nothing and never folds back", () => {
    const raised = moveByHand(
      stepYard(yardWith([aSetting()]), asked, noon),
      "set-1",
      "unfold",
      noon,
    );
    expect(nextChangeAt(raised, noon)).toBeUndefined();
  });

  it("names only moments after the one asked about", () => {
    const unfolded = stepYard(yardWith([unfoldAtNoon]), asked, noon);
    expect(nextChangeAt(unfolded, noon + hour)).toBeUndefined();
  });
});

function view(yard: YardState, at: number) {
  const card = yardCard(yard, at);
  return {
    settings: Object.values(yard.settings)
      .map(({ depth: _depth, ...shown }) => shown)
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    decisions: yard.decisions,
    ruledThings: yard.ruledThings,
    card: {
      used: card.used,
      cooldowns: card.cooldowns,
      free: card.nextFreeAt > at ? card.nextFreeAt : "now",
    },
  };
}

interface DrawnSetting {
  readonly creature: string | null;
  readonly sessionId: string;
  readonly kind: SettingKind;
  readonly rung: Rung;
  readonly arrives: number;
}

const settingArb: fc.Arbitrary<DrawnSetting> = fc.record({
  creature: fc.constantFrom("bea", "vey", null),
  sessionId: fc.constantFrom("s1", "s2"),
  kind: fc.constantFrom<SettingKind>("note", "diff", "file"),
  rung: fc.constantFrom<Rung>("card", "unfold", "unfold", "stage"),
  arrives: fc.integer({ min: 0, max: 3 * minute }),
});

const scenarioArb = fc.record({
  first: fc.array(settingArb, { maxLength: 5 }),
  second: fc.array(settingArb, { maxLength: 5 }),
  firstStep: fc.integer({ min: 0, max: 3 * minute }),
  gap: fc.integer({ min: 0, max: 12 * minute }),
  spoke: fc.integer({ min: -2 * minute, max: 6 * minute }),
  visible: fc.boolean(),
  draftOpen: fc.boolean(),
  streaming: fc.boolean(),
  rules: fc.array(
    fc.record({
      creature: fc.constantFrom("bea", "vey", null),
      kind: fc.constantFrom<SettingKind>("note", "diff", "file"),
      rung: fc.constantFrom<Rung>("lantern", "unfold", "stage"),
      lasts: fc.constantFrom<YardRule["lasts"]>("always", "while-present"),
    }),
    { maxLength: 2 },
  ),
});

function settingsOf(drawn: readonly DrawnSetting[], prefix: string, base: number): Setting[] {
  return drawn.map((shape, index) =>
    aSetting({
      id: `${prefix}${index}`,
      creature: shape.creature,
      sessionId: shape.sessionId,
      rung: shape.rung,
      what: { kind: shape.kind, ref: `${prefix}${index}` },
      at: isoAt(base + shape.arrives),
    }),
  );
}

describe("the next moment the yard changes, for any yard stepped under one context", () => {
  it("changes the yard exactly then, and not a moment before", () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        const context: YardContext = {
          ...calm,
          visible: scenario.visible,
          focusedThread: "s1",
          keeperSpokeAt: { s1: noon + scenario.spoke },
          draftOpen: scenario.draftOpen,
          streaming: scenario.streaming,
          railFocused: false,
          rules: scenario.rules,
        };
        const firstAt = noon + scenario.firstStep;
        const lastAt = firstAt + scenario.gap;
        const first = stepYard(yardWith(settingsOf(scenario.first, "a", noon)), context, firstAt);
        const yard = stepYard(
          yardWith(settingsOf(scenario.second, "b", firstAt), first),
          context,
          lastAt,
        );
        const settled = view(yard, lastAt);
        const next = nextChangeAt(yard, lastAt);
        if (next === undefined) {
          expect(view(stepYard(yard, context, lastAt + hour), lastAt + hour)).toEqual(settled);
          return;
        }
        expect(next).toBeGreaterThan(lastAt);
        expect(view(stepYard(yard, context, next - 1), next - 1)).toEqual(settled);
        expect(view(stepYard(yard, context, next), next)).not.toEqual(settled);
      }),
      { numRuns: 300 },
    );
  });
});
