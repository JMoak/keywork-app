import type { Setting } from "@keywork-app/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { projectAll } from "../world/project.ts";
import { emptyHabitat } from "../world/types.ts";
import { foldBackAfterMs } from "./fold-back.ts";
import { breakpointWaitMs, digestOf, moveByHand, stepYard } from "./step.ts";
import { aSetting, askedIn, calm, isoAt, noon, proposed } from "./testing.ts";
import { type YardContext, type YardSetting, type YardState, yardOf } from "./types.ts";

const asked: YardContext = { ...calm, ...askedIn("s1", noon - 30 * second) };

function yardOfSettings(settings: readonly Partial<Setting>[]): YardState {
  const stream = settings.map((overrides, index) =>
    proposed(
      index + 1,
      aSetting({
        id: `n${index + 1}`,
        at: isoAt(noon + index * second),
        what: { kind: "note", ref: `note ${index + 1}` },
        ...overrides,
      }),
    ),
  );
  return yardOf(projectAll(emptyHabitat(), stream));
}

function shownOf(yard: YardState): Record<string, string> {
  return Object.fromEntries(Object.values(yard.settings).map((s) => [s.id, s.shown]));
}

function reasonsOf(yard: YardState): string[] {
  return yard.decisions.map((decision) => `${decision.id} ${decision.reason}`);
}

const oneUnfold = (): YardState => yardOfSettings([{ rung: "unfold" }]);

describe("deciding at the keeper's breakpoint", () => {
  it("leaves an unfold undecided while the keeper writes, then decides it once", () => {
    const writing = stepYard(oneUnfold(), { ...asked, draftOpen: true }, noon + 10 * second);
    expect(shownOf(writing)).toEqual({ n1: "glyph" });
    expect(writing.decisions).toEqual([]);
    expect(writing.budget.played).toEqual([]);
    const sent = stepYard(writing, asked, noon + 40 * second);
    expect(shownOf(sent)).toEqual({ n1: "unfold" });
    expect(reasonsOf(sent)).toEqual(["n1 you asked, it shows"]);
    expect(reasonsOf(stepYard(sent, { ...asked, streaming: true }, noon + minute))).toEqual(
      reasonsOf(sent),
    );
  });

  it("decides as things stand once two minutes have passed, and never again", () => {
    const streaming = { ...asked, streaming: true };
    const waited = stepYard(oneUnfold(), streaming, noon + breakpointWaitMs - 1);
    expect(shownOf(waited)).toEqual({ n1: "glyph" });
    const bound = stepYard(waited, streaming, noon + breakpointWaitMs);
    expect(shownOf(bound)).toEqual({ n1: "card" });
    expect(bound.decisions).toEqual([
      expect.objectContaining({ verdict: "hold", reason: "while a reply arrives" }),
    ]);
    expect(shownOf(stepYard(bound, asked, noon + breakpointWaitMs + second))).toEqual({
      n1: "card",
    });
  });

  it("sets a card out at once while the keeper writes", () => {
    const yard = yardOfSettings([{ rung: "card" }, { rung: "unfold" }]);
    const writing = stepYard(yard, { ...asked, draftOpen: true }, noon + 10 * second);
    expect(shownOf(writing)).toEqual({ n1: "card", n2: "glyph" });
  });
});

describe("the digest at the keeper's return", () => {
  const away = stepYard(
    yardOfSettings([{ rung: "unfold" }, { rung: "unfold", creature: "vey" }, { rung: "card" }]),
    { ...asked, visible: false },
    noon + 10 * second,
  );

  it("lists what folded while the keeper was away only once they are back", () => {
    expect(shownOf(away)).toEqual({ n1: "card", n2: "card", n3: "card" });
    expect(digestOf(away)).toEqual([]);
    expect(digestOf(away, noon + 5 * second)).toEqual([]);
    const back = digestOf(away, noon + 20 * second);
    expect(back.map((setting) => setting.id)).toEqual(["n2", "n1"]);
  });

  it("treats do not disturb and quiet hours as being away, and leaves a plain card out", () => {
    for (const quiet of [{ doNotDisturb: true }, { quietHours: true }]) {
      const held = stepYard(
        yardOfSettings([{ rung: "unfold" }, { rung: "card" }]),
        { ...asked, ...quiet },
        noon + 10 * second,
      );
      expect(digestOf(held, noon + minute).map((setting) => setting.id)).toEqual(["n1"]);
    }
  });

  it("lists a cooled-down unfold beside the budget's folds, return or not", () => {
    const cooled = stepYard(
      yardOfSettings([{ rung: "unfold" }, { rung: "unfold" }]),
      asked,
      noon + 10 * second,
    );
    expect(reasonsOf(cooled)).toEqual([
      "n1 you asked, it shows",
      "n2 its owner just opened another",
    ]);
    expect(digestOf(cooled).map((setting) => setting.id)).toEqual(["n2"]);
  });
});

describe("folding back an unfold the keeper left alone", () => {
  const unfolded = stepYard(oneUnfold(), asked, noon + 10 * second);

  it("folds back to its card ten minutes after it unfolded, still live", () => {
    expect(shownOf(stepYard(unfolded, asked, noon + 10 * second + foldBackAfterMs - 1))).toEqual({
      n1: "unfold",
    });
    const later = stepYard(unfolded, asked, noon + 10 * second + foldBackAfterMs);
    expect(later.settings.n1).toMatchObject({ shown: "card", state: "live" });
    expect(later.settings.n1?.unfolded).toBeUndefined();
    expect(later.decisions.at(-1)).toMatchObject({
      id: "n1",
      verdict: "reduce",
      rung: "card",
      reason: "closed again",
    });
  });

  it("folds back as soon as the keeper looks at another thread", () => {
    const moved = stepYard(unfolded, { ...asked, focusedThread: "s2" }, noon + 20 * second);
    expect(shownOf(moved)).toEqual({ n1: "card" });
  });

  it("never folds back a pinned unfold, one the keeper raised, or a stage", () => {
    const pinned = withSetting(unfolded, "n1", { state: "pinned" });
    const raised = moveByHand(stepYard(yardOfSettings([{}]), asked, noon), "n1", "unfold", noon);
    const staged = moveByHand(unfolded, "n1", "stage", noon + 20 * second);
    const muchLater = { ...asked, focusedThread: "s2" };
    for (const yard of [pinned, raised, staged]) {
      const shown = yard.settings.n1?.shown;
      expect(stepYard(yard, muchLater, noon + 2 * foldBackAfterMs).settings.n1?.shown).toBe(shown);
    }
  });
});

describe("ring slots in the yard", () => {
  it("gives each unfold the lowest free slot and keeps it until it folds", () => {
    const owners = (creature: string): Partial<Setting> => ({ rung: "unfold", creature });
    const two = stepYard(yardOfSettings([owners("a"), owners("b")]), asked, noon + 10 * second);
    expect(slotsOf(two)).toEqual({ n1: 0, n2: 1 });
    const lowered = moveByHand(two, "n1", "card", noon + 20 * second);
    expect(slotsOf(lowered)).toEqual({ n2: 1 });
    const raised = moveByHand(lowered, "n1", "unfold", noon + 30 * second);
    expect(slotsOf(raised)).toEqual({ n1: 0, n2: 1 });
    expect(raised.settings.n1?.unfolded).toMatchObject({ byHand: true, at: noon + 30 * second });
    const staged = moveByHand(raised, "n2", "stage", noon + 40 * second);
    expect(slotsOf(staged)).toEqual({ n1: 0, n2: 1 });
  });

  it("never spends the budget on the keeper's own moves", () => {
    const yard = stepYard(yardOfSettings([{}, {}]), asked, noon);
    const raised = moveByHand(moveByHand(yard, "n1", "unfold", noon), "n2", "stage", noon);
    expect(raised.budget).toBe(yard.budget);
  });
});

describe("the rail holds still while the keeper is in it", () => {
  const settled = stepYard(
    yardOfSettings([{ what: { kind: "diff", ref: "d" } }, { what: { kind: "note", ref: "n" } }]),
    calm,
    noon + 10 * second,
  );

  it("keeps every depth and every unfold while the rail has focus, and catches up after", () => {
    const unfolded = stepYard(oneUnfold(), asked, noon + 10 * second);
    const muchLater = noon + 2 * foldBackAfterMs;
    const still = stepYard(settled, { ...calm, railFocused: true }, muchLater);
    expect(still).toBe(settled);
    expect(stepYard(unfolded, { ...asked, railFocused: true }, muchLater)).toBe(unfolded);
    const released = stepYard(settled, calm, muchLater);
    expect(released.settings.n1?.depth).toBeLessThan(settled.settings.n1?.depth ?? 0);
    expect(shownOf(stepYard(unfolded, asked, muchLater))).toEqual({ n1: "card" });
  });

  it("still sets new arrivals out, behind everything already on the rail", () => {
    const arrived = projectAll({ ...emptyHabitat(), yard: settled }, [
      proposed(
        3,
        aSetting({ id: "n3", at: isoAt(noon + minute), what: { kind: "diff", ref: "x" } }),
      ),
    ]);
    const still = stepYard(yardOf(arrived), { ...calm, railFocused: true }, noon + minute);
    expect(still.settings.n3).toMatchObject({ shown: "card", depth: 0 });
    expect(still.settings.n1?.depth).toBe(settled.settings.n1?.depth);
  });
});

const signalArb = fc.record({
  after: fc.integer({ min: 0, max: 3 * minute }),
  draftOpen: fc.boolean(),
  streaming: fc.boolean(),
});

describe("a breakpoint, for any run of steps", () => {
  it("decides an asked unfold exactly once, and by two minutes after it arrived", () => {
    fc.assert(
      fc.property(fc.array(signalArb, { minLength: 1, maxLength: 8 }), (signals) => {
        const steps = signals.toSorted((a, b) => a.after - b.after);
        let yard = oneUnfold();
        for (const { after, draftOpen, streaming } of steps) {
          const before = yard;
          yard = stepYard(yard, { ...asked, draftOpen, streaming }, noon + after);
          const decided = yard.decisions.filter((decision) => decision.id === "n1");
          expect(decided.length).toBeLessThanOrEqual(1);
          if (before.decisions.length > 0) expect(yard.decisions).toEqual(before.decisions);
          if (after >= breakpointWaitMs) expect(decided).toHaveLength(1);
          if (decided.length === 1 && !draftOpen && !streaming && before.decisions.length === 0) {
            expect(yard.settings.n1?.shown).toBe("unfold");
          }
        }
      }),
    );
  });
});

function withSetting(yard: YardState, id: string, change: Partial<YardSetting>): YardState {
  const held = yard.settings[id];
  return held === undefined
    ? yard
    : { ...yard, settings: { ...yard.settings, [id]: { ...held, ...change } } };
}

function slotsOf(yard: YardState): Record<string, number> {
  return Object.fromEntries(
    Object.values(yard.settings).flatMap((setting) =>
      setting.unfolded === undefined ? [] : [[setting.id, setting.unfolded.slot]],
    ),
  );
}
