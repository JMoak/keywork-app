import type { Rung } from "@keywork-app/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { emptyBudget } from "../creature/gate.ts";
import {
  admitUnfold,
  cooldownsOf,
  decideShow,
  outsideFocus,
  ruleFromHand,
  unfoldBudget,
  unfoldsOutsideSpent,
  unfoldsSpent,
} from "./gate.ts";
import { askedIn, aYardSetting, calm, isoAt, noon } from "./testing.ts";
import {
  ownerOf,
  rankOf,
  sameOwner,
  type YardBudget,
  type YardContext,
  type YardOwner,
  type YardRule,
  type YardSetting,
} from "./types.ts";

function decided(
  setting: Partial<YardSetting>,
  context: Partial<YardContext> = {},
  budget: YardBudget = emptyBudget,
): string {
  const decision = decideShow(aYardSetting(setting), { ...calm, ...context }, budget, noon);
  return `${decision.verdict}:${decision.rung}:${decision.reason}`;
}

const asked = askedIn("s1", noon - 90 * second);
const bea: YardOwner = { kind: "creature", slug: "bea" };
const vey: YardOwner = { kind: "creature", slug: "vey" };
const threadOne: YardOwner = { kind: "thread", sessionId: "s1" };

function unfoldedBy(owner: YardOwner, at: number, outside = false): YardBudget {
  return admitUnfold(emptyBudget, at, { owner, outside });
}

describe("the layered unfold budget", () => {
  it("cools an owner for two minutes after its last unfold, unless the keeper spoke there since", () => {
    const beaJustUnfolded = unfoldedBy(bea, noon - minute);
    expect(decided({ rung: "unfold" }, asked, beaJustUnfolded)).toBe("hold:card:unfold cooldown");
    expect(decided({ rung: "unfold" }, askedIn("s1", noon - 30 * second), beaJustUnfolded)).toBe(
      "play:unfold:you asked, it shows",
    );
    expect(decided({ rung: "unfold", creature: "vey" }, asked, beaJustUnfolded)).toBe(
      "play:unfold:you asked, it shows",
    );
    const twoMinutesOn = unfoldedBy(bea, noon - unfoldBudget.cooldownMs);
    expect(decided({ rung: "unfold" }, asked, twoMinutesOn)).toBe(
      "play:unfold:you asked, it shows",
    );
  });

  it("cools a creature-less thread as its own owner", () => {
    const threadJustUnfolded = unfoldedBy(threadOne, noon - minute);
    expect(decided({ rung: "unfold", creature: null }, asked, threadJustUnfolded)).toBe(
      "hold:card:unfold cooldown",
    );
    expect(decided({ rung: "unfold" }, asked, threadJustUnfolded)).toBe(
      "play:unfold:you asked, it shows",
    );
  });

  it("allows one unfold in ten minutes outside the focused thread, which only a rule can earn", () => {
    const rule: YardRule = { creature: "bea", kind: "note", rung: "unfold", lasts: "always" };
    const elsewhere = { ...asked, rules: [rule] };
    expect(decided({ rung: "card", sessionId: "s2" }, elsewhere)).toBe("play:unfold:your rule");
    expect(decided({ rung: "unfold", sessionId: "s2" }, asked)).toBe(
      "hold:card:a card unless you asked",
    );
    const veyOutside = unfoldedBy(vey, noon - 9 * minute, true);
    expect(decided({ rung: "card", sessionId: "s2" }, elsewhere, veyOutside)).toBe(
      "hold:card:one unfold outside your thread",
    );
    expect(decided({ rung: "card" }, elsewhere, veyOutside)).toBe("play:unfold:your rule");
    const veyInside = unfoldedBy(vey, noon - 9 * minute, false);
    expect(decided({ rung: "card", sessionId: "s2" }, elsewhere, veyInside)).toBe(
      "play:unfold:your rule",
    );
    const tenMinutesOn = unfoldedBy(vey, noon - unfoldBudget.windowMs, true);
    expect(decided({ rung: "card", sessionId: "s2" }, elsewhere, tenMinutesOn)).toBe(
      "play:unfold:your rule",
    );
  });

  it("keeps six in ten minutes as the ceiling over every owner, checked first", () => {
    const owners = ["a", "b", "c", "d", "e", "f"].map(
      (slug): YardOwner => ({ kind: "creature", slug }),
    );
    const six = owners.reduce(
      (budget, owner, index) =>
        admitUnfold(budget, noon - (index + 1) * second, { owner, outside: false }),
      unfoldedBy(bea, noon - 9 * minute),
    );
    expect(unfoldsSpent(six, noon)).toBe(unfoldBudget.unfolds + 1);
    expect(decided({ rung: "unfold", creature: "a" }, asked, six)).toBe("hold:card:unfold budget");
  });

  it("forgets what fell out of each window when it admits the next unfold", () => {
    const old = unfoldedBy(vey, noon - unfoldBudget.windowMs, true);
    const admitted = admitUnfold(old, noon, { owner: bea, outside: false });
    expect(admitted).toEqual({
      played: [noon],
      lastUnfolds: [{ owner: bea, at: noon }],
      outside: [],
    });
    expect(cooldownsOf(admitUnfold(unfoldedBy(bea, noon - minute), noon), noon)).toEqual([
      { owner: bea, at: noon - minute },
    ]);
  });
});

describe("the gate waits for a breakpoint", () => {
  it("holds an unfold it would play while the keeper writes or a reply arrives", () => {
    expect(decided({ rung: "unfold" }, { ...asked, draftOpen: true })).toBe(
      "hold:card:while you write",
    );
    expect(decided({ rung: "unfold" }, { ...asked, streaming: true })).toBe(
      "hold:card:while a reply arrives",
    );
    const delivery = { rung: "unfold" as const, what: { kind: "diff" as const, ref: "cs-1" } };
    expect(decided(delivery, { focusedThread: "s1", streaming: true })).toBe(
      "hold:card:while a reply arrives",
    );
    expect(decided(delivery, { focusedThread: "s1", streaming: false, draftOpen: false })).toBe(
      "play:unfold:a delivery in your thread",
    );
  });

  it("never waits over a card, an unearned unfold or a spent budget", () => {
    const writing = { ...asked, draftOpen: true, streaming: true };
    expect(decided({ rung: "card" }, writing)).toBe("play:card:as proposed");
    expect(decided({ rung: "unfold", sessionId: "s2" }, writing)).toBe(
      "hold:card:a card unless you asked",
    );
    expect(decided({ rung: "unfold" }, writing, unfoldedBy(bea, noon - minute))).toBe(
      "hold:card:unfold cooldown",
    );
  });
});

describe("the display and fullscreen signals", () => {
  it("gives cards only while the display is shared or another app is fullscreen", () => {
    const stageRule: YardRule = { creature: "bea", kind: "note", rung: "stage", lasts: "always" };
    const cases: readonly [Partial<YardContext>, string][] = [
      [{ fullscreenElsewhere: true }, "another app fullscreen"],
      [{ displayShared: true }, "screen shared"],
    ];
    for (const [signal, reason] of cases) {
      expect(decided({ rung: "unfold" }, { ...asked, ...signal })).toBe(`hold:card:${reason}`);
      expect(decided({ rung: "card" }, { ...asked, ...signal, rules: [stageRule] })).toBe(
        `hold:card:${reason}`,
      );
      expect(decided({ rung: "card" }, { ...asked, ...signal })).toBe("play:card:as proposed");
    }
  });

  it("reads an absent signal as false, never as a reason to hold", () => {
    const signals = {
      draftOpen: undefined,
      streaming: undefined,
      displayShared: undefined,
      fullscreenElsewhere: undefined,
    };
    expect(decided({ rung: "unfold" }, { ...asked, ...signals })).toBe(
      "play:unfold:you asked, it shows",
    );
  });
});

describe("keeper rules", () => {
  it("keys a rule made on a creature-less setting on null and its thread", () => {
    const loose = aYardSetting({
      creature: null,
      sessionId: "t1",
      what: { kind: "file", ref: "a" },
    });
    const rule = ruleFromHand(loose, "lantern");
    expect(rule).toEqual({
      creature: null,
      kind: "file",
      rung: "lantern",
      lasts: "while-present",
      thread: "t1",
    });
    const fileIn = (sessionId: string, creature: string | null): Partial<YardSetting> => ({
      creature,
      sessionId,
      what: { kind: "file", ref: "b" },
    });
    expect(decided(fileIn("t1", null), { rules: [rule] })).toBe("reduce:lantern:your rule");
    expect(decided(fileIn("t2", null), { rules: [rule] })).toBe("play:card:as proposed");
    expect(decided(fileIn("t1", "bea"), { rules: [rule] })).toBe("play:card:as proposed");
  });

  it("keys a creature's rule on the creature alone, whatever the thread", () => {
    const rule = ruleFromHand(
      aYardSetting({ what: { kind: "file", ref: "a" } }),
      "lantern",
      "always",
    );
    expect(rule).toEqual({ creature: "bea", kind: "file", rung: "lantern", lasts: "always" });
    expect(decided({ sessionId: "s9", what: { kind: "file", ref: "z" } }, { rules: [rule] })).toBe(
      "reduce:lantern:your rule",
    );
  });

  it("keeps a while-present rule in force while away for a setting it already shaped", () => {
    const rule: YardRule = {
      creature: "bea",
      kind: "note",
      rung: "lantern",
      lasts: "while-present",
    };
    const away = { visible: false, rules: [rule] };
    expect(decided({ rung: "card" }, away)).toBe("play:card:as proposed");
    expect(decided({ rung: "card", ruled: true }, away)).toBe("reduce:lantern:your rule");
  });
});

const rungArb = fc.constantFrom<Rung>("glyph", "lantern", "card", "unfold", "stage");
const kindArb = fc.constantFrom("file", "diff", "report", "thread", "chore", "url", "note");
const creatureArb = fc.constantFrom("bea", "vey", null);
const threadArb = fc.constantFrom("s1", "s2");

const settingArb: fc.Arbitrary<YardSetting> = fc
  .record({
    creature: creatureArb,
    sessionId: threadArb,
    kind: kindArb,
    rung: rungArb,
    ruled: fc.boolean(),
    offset: fc.integer({ min: -5 * minute, max: 5 * minute }),
  })
  .map((drawn) =>
    aYardSetting({
      creature: drawn.creature,
      sessionId: drawn.sessionId,
      what: { kind: drawn.kind, ref: "r" },
      rung: drawn.rung,
      ruled: drawn.ruled,
      at: isoAt(noon + drawn.offset),
    }),
  );

const ownerArb: fc.Arbitrary<YardOwner> = fc.oneof(
  fc.constantFrom("bea", "vey").map((slug): YardOwner => ({ kind: "creature", slug })),
  threadArb.map((sessionId): YardOwner => ({ kind: "thread", sessionId })),
);

const budgetArb: fc.Arbitrary<YardBudget> = fc
  .array(
    fc.record({
      owner: ownerArb,
      outside: fc.boolean(),
      ago: fc.integer({ min: 0, max: 15 * minute }),
    }),
    { maxLength: 9 },
  )
  .map((plays) =>
    plays
      .toSorted((a, b) => b.ago - a.ago)
      .reduce<YardBudget>(
        (budget, play) =>
          admitUnfold(budget, noon - play.ago, { owner: play.owner, outside: play.outside }),
        emptyBudget,
      ),
  );

const contextArb: fc.Arbitrary<YardContext> = fc.record({
  visible: fc.boolean(),
  focused: fc.boolean(),
  fullscreen: fc.boolean(),
  doNotDisturb: fc.boolean(),
  tier: fc.constantFrom("interact", "active", "ambient", "rest", "hidden"),
  reducedMotion: fc.boolean(),
  quietHours: fc.boolean(),
  focusedThread: fc.constantFrom(undefined, "s1", "s2"),
  keeperSpokeAt: fc.dictionary(threadArb, fc.integer({ min: noon - 10 * minute, max: noon })),
  rules: fc.array(
    fc.record({
      creature: creatureArb,
      kind: kindArb,
      rung: rungArb,
      lasts: fc.constantFrom("while-present", "always") as fc.Arbitrary<YardRule["lasts"]>,
    }),
    { maxLength: 4 },
  ),
  draftOpen: fc.option(fc.boolean(), { nil: undefined }),
  streaming: fc.option(fc.boolean(), { nil: undefined }),
  displayShared: fc.option(fc.boolean(), { nil: undefined }),
  fullscreenElsewhere: fc.option(fc.boolean(), { nil: undefined }),
  railFocused: fc.option(fc.boolean(), { nil: undefined }),
  returnedAt: fc.option(fc.integer({ min: noon - 10 * minute, max: noon }), { nil: undefined }),
});

describe("the layered gate, for any setting, context and budget", () => {
  it("opens past a card only when every layer of the budget and every signal allows it", () => {
    fc.assert(
      fc.property(settingArb, contextArb, budgetArb, (setting, context, budget) => {
        const decision = decideShow(setting, context, budget, noon);
        if (rankOf(decision.rung) < rankOf("unfold")) return;
        expect(context.fullscreenElsewhere === true || context.displayShared === true).toBe(false);
        expect(context.draftOpen === true || context.streaming === true).toBe(false);
        expect(unfoldsSpent(budget, noon)).toBeLessThan(unfoldBudget.unfolds);
        if (outsideFocus(setting, context)) {
          expect(unfoldsOutsideSpent(budget, noon)).toBeLessThan(unfoldBudget.outsideFocus);
        }
        const owner = ownerOf(setting);
        const last = cooldownsOf(budget, noon).find((unfold) => sameOwner(unfold.owner, owner));
        if (last !== undefined) {
          expect(context.keeperSpokeAt[setting.sessionId] ?? -1).toBeGreaterThan(last.at);
        }
      }),
    );
  });

  it("gives every rule made by hand its rung while the keeper is present", () => {
    fc.assert(
      fc.property(settingArb, fc.constantFrom<Rung>("lantern", "card"), (setting, rung) => {
        const rules = [ruleFromHand(setting, rung)];
        expect(decideShow(setting, { ...calm, rules }, emptyBudget, noon).rung).toBe(rung);
      }),
    );
  });
});
