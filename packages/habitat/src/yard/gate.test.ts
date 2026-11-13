import type { Rung } from "@keywork-app/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { type Budget, decisionLogLimit, emptyBudget } from "../creature/gate.ts";
import {
  admitUnfold,
  decideShow,
  recordedShow,
  showReasons,
  unfoldBudget,
  unfoldsSpent,
} from "./gate.ts";
import { askedIn, aYardSetting, calm, isoAt, noon } from "./testing.ts";
import { rankOf, type YardContext, type YardRule, type YardSetting } from "./types.ts";

function decided(
  setting: Partial<YardSetting>,
  context: Partial<YardContext> = {},
  budget: Budget = emptyBudget,
): string {
  const decision = decideShow(aYardSetting(setting), { ...calm, ...context }, budget, noon);
  return `${decision.verdict}:${decision.rung}:${decision.reason}`;
}

const asked = askedIn("s1", noon - 90 * second);

function spentBudget(unfolds: number, at = noon): Budget {
  return { played: Array.from({ length: unfolds }, (_, index) => at - index * minute) };
}

describe("the show gate", () => {
  it("plays a card or a lantern as proposed and keeps the whole decision", () => {
    expect(decided({ rung: "card" })).toBe("play:card:as proposed");
    expect(decided({ rung: "lantern" })).toBe("play:lantern:as proposed");
    expect(decideShow(aYardSetting({ id: "d1", rung: "card" }), calm, emptyBudget, noon)).toEqual({
      at: noon,
      id: "d1",
      creature: "bea",
      kind: "note",
      proposed: "card",
      rung: "card",
      verdict: "play",
      reason: "as proposed",
    });
  });

  it("holds an unfold on the rail as a card unless the keeper asked", () => {
    expect(decided({ rung: "unfold" })).toBe("hold:card:a card unless you asked");
    expect(decided({ rung: "unfold", sessionId: "s2" }, asked)).toBe(
      "hold:card:a card unless you asked",
    );
  });

  it("unfolds within two minutes of the keeper's last message in the thread they are looking at", () => {
    expect(decided({ rung: "unfold" }, asked)).toBe("play:unfold:you asked, it shows");
    expect(decided({ rung: "unfold" }, askedIn("s1", noon - 2 * minute))).toBe(
      "play:unfold:you asked, it shows",
    );
    expect(decided({ rung: "unfold" }, askedIn("s1", noon - 2 * minute - 1))).toBe(
      "hold:card:a card unless you asked",
    );
    expect(decided({ rung: "unfold" }, askedIn("s1", noon + second))).toBe(
      "hold:card:a card unless you asked",
    );
  });

  it("unfolds a diff or a report delivered in the focused thread without being asked", () => {
    const focused = { focusedThread: "s1" };
    for (const kind of ["diff", "report"] as const) {
      expect(decided({ rung: "unfold", what: { kind, ref: "r" } }, focused)).toBe(
        "play:unfold:a delivery in your thread",
      );
      expect(decided({ rung: "unfold", what: { kind, ref: "r" }, sessionId: "s2" }, focused)).toBe(
        "hold:card:a card unless you asked",
      );
    }
    expect(decided({ rung: "unfold", what: { kind: "file", ref: "a.ts" } }, focused)).toBe(
      "hold:card:a card unless you asked",
    );
  });

  it("gives cards only when hidden, in do not disturb or in quiet hours, never for its own fullscreen (item 15)", () => {
    expect(decided({ rung: "unfold" }, { ...asked, fullscreen: true })).toBe(
      "play:unfold:you asked, it shows",
    );
    const cases: readonly [Partial<YardContext>, string][] = [
      [{ visible: false }, "not shown"],
      [{ tier: "hidden" }, "not shown"],
      [{ doNotDisturb: true }, "do not disturb"],
      [{ quietHours: true }, "quiet hours"],
    ];
    for (const [context, reason] of cases) {
      expect(decided({ rung: "unfold" }, { ...asked, ...context })).toBe(`hold:card:${reason}`);
      expect(decided({ rung: "card" }, { ...asked, ...context })).toBe("play:card:as proposed");
    }
  });

  it("spends six unfolds per ten minutes, then holds the rest as cards", () => {
    expect(decided({ rung: "unfold" }, asked, spentBudget(5))).toBe(
      "play:unfold:you asked, it shows",
    );
    expect(decided({ rung: "unfold" }, asked, spentBudget(6))).toBe(
      "hold:card:too many opened lately",
    );
    const tenMinutesOn = { played: spentBudget(6).played.map((time) => time - 9 * minute) };
    expect(unfoldsSpent(tenMinutesOn, noon)).toBe(1);
    expect(decided({ rung: "unfold" }, asked, tenMinutesOn)).toBe(
      "play:unfold:you asked, it shows",
    );
  });

  it("never stages without a rule, and stages by a rule", () => {
    expect(decided({ rung: "stage" }, asked)).toBe("reduce:unfold:the whole view needs your say");
    expect(decided({ rung: "stage" })).toBe("hold:card:a card unless you asked");
    const stageRule: YardRule = { creature: "bea", kind: "note", rung: "stage", lasts: "always" };
    expect(decided({ rung: "card" }, { rules: [stageRule] })).toBe("play:stage:your rule");
    expect(decided({ rung: "stage" }, { rules: [stageRule], fullscreenElsewhere: true })).toBe(
      "hold:card:another app fullscreen",
    );
    expect(decided({ rung: "stage" }, { rules: [stageRule] }, spentBudget(6))).toBe(
      "hold:card:too many opened lately",
    );
  });

  it("follows the keeper's latest matching rule, up or down, and a while-present rule only while present", () => {
    const rule = (rung: Rung, lasts: YardRule["lasts"] = "always"): YardRule => ({
      creature: "bea",
      kind: "note",
      rung,
      lasts,
    });
    expect(decided({ rung: "unfold" }, { ...asked, rules: [rule("lantern")] })).toBe(
      "reduce:lantern:your rule",
    );
    expect(decided({ rung: "card" }, { rules: [rule("lantern"), rule("unfold")] })).toBe(
      "play:unfold:your rule",
    );
    expect(decided({ rung: "card" }, { rules: [{ ...rule("unfold"), creature: "vey" }] })).toBe(
      "play:card:as proposed",
    );
    const hiddenWithRule = { visible: false, rules: [rule("lantern", "while-present")] };
    expect(decided({ rung: "card" }, hiddenWithRule)).toBe("play:card:as proposed");
    expect(decided({ rung: "card" }, { rules: [rule("lantern", "while-present")] })).toBe(
      "reduce:lantern:your rule",
    );
  });

  it("treats a setting with no creature like any other setting of its thread", () => {
    expect(decided({ rung: "unfold", creature: null }, asked)).toBe(
      "play:unfold:you asked, it shows",
    );
    const threadRule: YardRule = { creature: null, kind: "note", rung: "lantern", lasts: "always" };
    expect(decided({ rung: "card", creature: null }, { rules: [threadRule] })).toBe(
      "reduce:lantern:your rule",
    );
    expect(decided({ rung: "card" }, { rules: [threadRule] })).toBe("play:card:as proposed");
  });

  it("keeps the last thirty-two decisions and admits only unfolds in the window", () => {
    const log = Array.from({ length: 40 }, (_, index) =>
      decideShow(aYardSetting({ id: `d${index}` }), calm, emptyBudget, noon + index),
    ).reduce(recordedShow, []);
    expect(log).toHaveLength(decisionLogLimit);
    expect(log[0]?.id).toBe("d8");
    expect(admitUnfold(spentBudget(3, noon - unfoldBudget.windowMs), noon).played).toEqual([noon]);
  });
});

const rungArb = fc.constantFrom<Rung>("glyph", "lantern", "card", "unfold", "stage");
const kindArb = fc.constantFrom("file", "diff", "report", "thread", "chore", "url", "note");

const settingArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 4 }),
  creature: fc.constantFrom("bea", "vey", null),
  sessionId: fc.constantFrom("s1", "s2"),
  kind: kindArb,
  rung: rungArb,
  state: fc.constantFrom("live", "seen", "pinned") as fc.Arbitrary<YardSetting["state"]>,
  offset: fc.integer({ min: -20 * minute, max: 20 * minute }),
});

const contextArb: fc.Arbitrary<YardContext> = fc.record({
  visible: fc.boolean(),
  focused: fc.boolean(),
  fullscreen: fc.boolean(),
  fullscreenElsewhere: fc.boolean(),
  doNotDisturb: fc.boolean(),
  tier: fc.constantFrom("interact", "active", "ambient", "rest", "hidden"),
  reducedMotion: fc.boolean(),
  quietHours: fc.boolean(),
  focusedThread: fc.constantFrom(undefined, "s1", "s2"),
  keeperSpokeAt: fc.dictionary(
    fc.constantFrom("s1", "s2"),
    fc.integer({ min: noon - 10 * minute, max: noon + minute }),
  ),
  rules: fc.array(
    fc.record({
      creature: fc.constantFrom("bea", "vey", null),
      kind: kindArb,
      rung: rungArb,
      lasts: fc.constantFrom("while-present", "always") as fc.Arbitrary<YardRule["lasts"]>,
    }),
    { maxLength: 4 },
  ),
});

const budgetArb: fc.Arbitrary<Budget> = fc.record({
  played: fc.array(fc.integer({ min: noon - 20 * minute, max: noon }), { maxLength: 9 }),
});

describe("the show gate, for any setting, context and budget", () => {
  it("answers, never with the glyph, and holds only on the rail", () => {
    fc.assert(
      fc.property(settingArb, contextArb, budgetArb, (drawn, context, budget) => {
        const setting = settingOf(drawn);
        const decision = decideShow(setting, context, budget, noon);
        expect(decision.rung).not.toBe("glyph");
        if (decision.verdict === "hold") expect(decision.rung).toBe("card");
        if (decision.verdict === "reduce") {
          expect(rankOf(decision.rung)).toBeLessThan(rankOf(setting.rung));
        }
        expect(decideShow(setting, context, budget, noon)).toEqual(decision);
      }),
    );
  });

  it("opens nothing past a card when the keeper is away, busy, or out of budget, and stages only by rule", () => {
    fc.assert(
      fc.property(settingArb, contextArb, budgetArb, (drawn, context, budget) => {
        const decision = decideShow(settingOf(drawn), context, budget, noon);
        const opened = rankOf(decision.rung) >= rankOf("unfold");
        const away = !context.visible || context.tier === "hidden";
        const busy = context.fullscreenElsewhere || context.doNotDisturb || context.quietHours;
        if (away || busy || unfoldsSpent(budget, noon) >= unfoldBudget.unfolds) {
          expect(opened).toBe(false);
        }
        if (decision.rung === "stage") expect(decision.reason).toBe(showReasons.rule);
      }),
    );
  });
});

function settingOf(drawn: {
  id: string;
  creature: string | null;
  sessionId: string;
  kind: YardSetting["what"]["kind"];
  rung: Rung;
  state: YardSetting["state"];
  offset: number;
}): YardSetting {
  return aYardSetting({
    id: drawn.id,
    creature: drawn.creature,
    sessionId: drawn.sessionId,
    what: { kind: drawn.kind, ref: "r" },
    rung: drawn.rung,
    state: drawn.state,
    until: "rests",
    at: isoAt(noon + drawn.offset),
  });
}
