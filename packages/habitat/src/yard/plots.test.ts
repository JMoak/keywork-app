import type { BusEnvelope, Setting } from "@keywork-app/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hour, minute, second } from "../clock/clock.ts";
import { projectAll } from "../world/project.ts";
import { emptyHabitat } from "../world/types.ts";
import { attend } from "./attention.ts";
import { yardCard } from "./card.ts";
import { unfoldBudget } from "./gate.ts";
import { defaultHub, placeYard } from "./place.ts";
import { moveByHand, plotsFoldedWhileAway, restorePlot, stepYard } from "./step.ts";
import { aSetting, askedIn, calm, isoAt, noon, proposed, settled } from "./testing.ts";
import { type AttendKind, type Rect, type YardContext, type YardState, yardOf } from "./types.ts";
import { nextChangeAt } from "./wake.ts";

const asked: YardContext = { ...calm, ...askedIn("s1", noon - 30 * second) };
const at = (seconds: number): number => noon + seconds * second;

const seed = aSetting({
  id: "d",
  rung: "unfold",
  what: { kind: "diff", ref: "cs-1" },
  at: isoAt(noon),
});

function opened(id: string, from: string, seconds: number, ref = `${id}.ts`): Setting {
  return aSetting({
    id,
    from,
    origin: "keeper",
    rung: "unfold",
    why: "",
    what: { kind: "file", ref },
    at: isoAt(at(seconds)),
  });
}

function shownBy(
  id: string,
  from: string,
  seconds: number,
  rung: Setting["rung"] = "card",
): Setting {
  return aSetting({ id, from, rung, what: { kind: "note", ref: id }, at: isoAt(at(seconds)) });
}

function withStream(yard: YardState, stream: readonly BusEnvelope[]): YardState {
  return yardOf(projectAll({ ...emptyHabitat(), yard }, stream));
}

function unfoldedSeed(context: YardContext = asked): YardState {
  return stepYard(withStream(yardOf(emptyHabitat()), [proposed(1, seed)]), context, noon);
}

function arrive(
  yard: YardState,
  settings: readonly Setting[],
  seconds: number,
  context: YardContext = asked,
): YardState {
  const stream = settings.map((setting, index) => proposed(100 + index, setting));
  return stepYard(withStream(yard, stream), context, at(seconds));
}

function noticed(yard: YardState, id: string, kind: AttendKind, seconds: number): YardState {
  return attend(yard, { id, kind, at: at(seconds) });
}

function interactions(yard: YardState, id: string, from: number, count: number): YardState {
  return Array.from({ length: count }, (_, index) => from + index * 2).reduce(
    (held, seconds) => noticed(held, id, "interact", seconds),
    yard,
  );
}

describe("the keeper's own openings", () => {
  it("play at unfold with no gate and no budget, even away, in do not disturb or mid-draft", () => {
    const busy: YardContext = { ...asked, visible: false, doNotDisturb: true, draftOpen: true };
    const before = unfoldedSeed();
    const yard = arrive(before, [opened("f", "d", 10)], 10, busy);
    expect(yard.settings.f).toMatchObject({ shown: "unfold", unfolded: { byHand: true } });
    expect(yard.decisions.at(-1)).toMatchObject({
      id: "f",
      verdict: "play",
      reason: "you opened it",
    });
    expect(yard.budget).toBe(before.budget);
    expect(yard.settings.f?.size).toBeUndefined();
  });

  it("never fold back, whatever the keeper looks at next", () => {
    const yard = arrive(unfoldedSeed(), [opened("f", "d", 10)], 10);
    const later = stepYard(yard, { ...asked, focusedThread: "s2" }, at(3600));
    expect(later.settings.f?.shown).toBe("unfold");
  });
});

describe("children grow beside their parent", () => {
  it("take the next lane beside an unfolded parent, and a ring number of their own", () => {
    const yard = arrive(unfoldedSeed(), [opened("f", "d", 10), opened("g", "d", 11)], 11);
    expect(yard.settings.d?.unfolded).toMatchObject({ slot: 0 });
    expect(yard.settings.d?.unfolded?.lane).toBeUndefined();
    expect(yard.settings.f?.unfolded).toMatchObject({ slot: 1, lane: 0 });
    expect(yard.settings.g?.unfolded).toMatchObject({ slot: 2, lane: 1 });
  });

  it("stand alone on the ring when their parent is only a card", () => {
    const card = stepYard(
      withStream(yardOf(emptyHabitat()), [proposed(1, { ...seed, rung: "card" })]),
      asked,
      noon,
    );
    const yard = arrive(card, [opened("f", "d", 10)], 10);
    expect(yard.settings.f?.unfolded).toEqual({ at: at(10), slot: 0, focus: "s1", byHand: true });
  });
});

describe("a plot folds as one", () => {
  const grown = arrive(unfoldedSeed(), [shownBy("c", "d", 10)], 10);

  it("folds back when the keeper left it alone, the seed keeping its rung and slot", () => {
    expect(stepYard(grown, asked, noon + 10 * minute - 1).settings.d?.folded).toBeUndefined();
    const folded = stepYard(grown, asked, noon + 10 * minute);
    expect(folded.settings.d).toMatchObject({
      shown: "unfold",
      folded: "plot:d",
      unfolded: { slot: 0 },
    });
    expect(folded.settings.c).toMatchObject({ shown: "card", folded: "plot:d" });
    expect(folded.decisions.at(-1)).toMatchObject({
      id: "d",
      verdict: "reduce",
      rung: "card",
      reason: "closed again",
    });
    expect(stepYard(grown, { ...asked, focusedThread: "s2" }, at(20)).settings.c?.folded).toBe(
      "plot:d",
    );
  });

  it("waits while attention flows up above ten, then folds at the moment it names", () => {
    const busy = interactions(grown, "c", 20, 22);
    expect(stepYard(busy, asked, noon + 10 * minute).settings.d?.folded).toBeUndefined();
    const due = nextChangeAt(busy, noon + unfoldBudget.windowMs) ?? 0;
    expect(due).toBeGreaterThan(noon + 10 * minute);
    expect(stepYard(busy, asked, due - 1).settings.d?.folded).toBeUndefined();
    expect(stepYard(busy, asked, due).settings.d?.folded).toBe("plot:d");
  });

  it("folds back a plot the keeper only glanced at, since one entry is not attention", () => {
    const glanced = noticed(noticed(grown, "c", "enter", 20), "c", "leave", 25);
    expect(glanced.settings.c?.attention?.entries).toBe(1);
    expect(stepYard(glanced, asked, at(25) + 10 * minute).settings.d?.folded).toBe("plot:d");
  });

  it("never folds back while focus is inside it or the keeper opened something in it", () => {
    const inside = noticed(grown, "c", "enter", 20);
    const opening = arrive(grown, [opened("f", "d", 20)], 20);
    for (const yard of [inside, opening]) {
      const elsewhere = stepYard(yard, { ...asked, focusedThread: "s2" }, at(3600));
      expect(elsewhere.settings.d?.folded).toBeUndefined();
    }
    expect(nextChangeAt(inside, noon + unfoldBudget.windowMs)).toBeUndefined();
  });

  it("counts ten minutes from the latest unfold or touch anywhere in it", () => {
    const touched = noticed(grown, "c", "interact", 300);
    expect(nextChangeAt(touched, at(300))).toBe(noon + unfoldBudget.windowMs);
    expect(nextChangeAt(touched, noon + unfoldBudget.windowMs)).toBe(at(300) + 10 * minute);
    expect(stepYard(touched, asked, noon + 10 * minute).settings.d?.folded).toBeUndefined();
  });

  it("folds when the keeper lowers a parent by hand, and lowers a lone setting as before", () => {
    const folded = moveByHand(grown, "d", "card", at(30));
    expect(folded.settings.d).toMatchObject({ shown: "unfold", folded: "plot:d" });
    expect(folded.decisions.at(-1)).toMatchObject({ id: "d", rung: "card", reason: "by hand" });
    expect(moveByHand(folded, "c", "unfold", at(31))).toBe(folded);
    const lone = moveByHand(unfoldedSeed(), "d", "card", at(30));
    expect(lone.settings.d).toMatchObject({ shown: "card" });
    expect(lone.settings.d?.folded).toBeUndefined();
  });

  it("folds a parent's children when it is dismissed or withdrawn, never when seen or pinned", () => {
    const leaving = (outcome: "seen" | "dismissed" | "withdrawn" | "pinned", yard = grown) =>
      withStream(yard, [
        settled(9, isoAt(at(30)), "s1", {
          id: "d",
          outcome,
          by: outcome === "withdrawn" ? "creature" : "keeper",
        }),
      ]);
    expect(leaving("dismissed").settings.c?.folded).toBe("plot:d");
    expect(leaving("withdrawn").settings.c?.folded).toBe("plot:d");
    expect(leaving("seen").settings.c?.folded).toBeUndefined();
    expect(leaving("pinned").settings.c?.folded).toBeUndefined();
  });

  it("waits for focus to leave before a withdrawal folds, and folds at once when the keeper dismisses", () => {
    const inside = noticed(grown, "c", "enter", 20);
    const withdrawn = withStream(inside, [
      settled(9, isoAt(at(30)), "s1", { id: "d", outcome: "withdrawn", by: "creature" }),
    ]);
    expect(withdrawn.settings.c?.folded).toBeUndefined();
    expect(withdrawn.ancestors?.d?.pendingFold).toBe(true);
    const left = noticed(withdrawn, "c", "leave", 40);
    expect(left.settings.c?.folded).toBe("plot:d");
    expect(left.ancestors?.d?.pendingFold).toBeUndefined();
    const dismissed = withStream(inside, [
      settled(9, isoAt(at(30)), "s1", { id: "d", outcome: "dismissed", by: "keeper" }),
    ]);
    expect(dismissed.settings.c?.folded).toBe("plot:d");
  });

  it("names in the return digest the plots that folded back while the keeper was away", () => {
    const away = stepYard(grown, { ...asked, visible: false }, noon + 10 * minute);
    expect(away.settings.d?.folded).toBe("plot:d");
    expect(away.decisions.at(-1)?.reason).toBe("closed while you were away");
    expect(plotsFoldedWhileAway(away)).toEqual([]);
    expect(plotsFoldedWhileAway(away, noon + 11 * minute)).toEqual(["plot:d"]);
    const present = stepYard(grown, asked, noon + 10 * minute);
    expect(plotsFoldedWhileAway(present, noon + 11 * minute)).toEqual([]);
  });

  it("takes a newcomer into the fold its parent is in, deciding it but spending nothing", () => {
    const folded = moveByHand(grown, "d", "card", at(30));
    const joined = arrive(folded, [shownBy("e", "d", 40, "unfold")], 40, {
      ...asked,
      keeperSpokeAt: { s1: at(35) },
    });
    expect(joined.settings.e).toMatchObject({ folded: "plot:d", shown: "unfold" });
    expect(joined.budget.played).toEqual(folded.budget.played);
  });
});

describe("restoring a plot", () => {
  const hub = defaultHub(wide());
  const growing = arrive(unfoldedSeed(), [opened("f", "d", 10), opened("t", "f", 11)], 11);
  const working = noticed(
    interactions(noticed(growing, "f", "enter", 20), "f", 21, 22),
    "f",
    "leave",
    70,
  );

  it("puts every member back in its slot at its size, as the keeper's own move", () => {
    expect(working.settings.f?.size).toBe("working");
    const folded = moveByHand(working, "d", "card", at(200));
    const restored = restorePlot(folded, "plot:d", at(210));
    expect(placements(restored)).toEqual(placements(working));
    expect(restored.settings.d).toMatchObject({
      shown: "unfold",
      unfolded: { slot: 0, byHand: true },
    });
    expect(restored.settings.d?.folded).toBeUndefined();
    expect(restored.decisions.at(-1)).toMatchObject({
      id: "d",
      verdict: "play",
      reason: "by hand",
    });
    expect(restorePlot(restored, "plot:missing", at(220))).toBe(restored);
  });

  it("moves a newer satellite out of a slot the plot reclaims", () => {
    const folded = moveByHand(working, "d", "card", at(200));
    const newcomer = arrive(folded, [opened("x", "s1", 205, "x.ts")], 205);
    expect(newcomer.settings.x?.unfolded?.slot).toBe(0);
    const restored = restorePlot(newcomer, "plot:d", at(210));
    expect(restored.settings.d?.unfolded?.slot).toBe(0);
    expect(restored.settings.x?.unfolded?.slot).toBe(3);
  });

  it("folds an inner parent into its seed's one card, which restores all of it", () => {
    const inner = moveByHand(working, "f", "card", at(200));
    expect(inner.settings.f?.folded).toBe("plot:d");
    expect(inner.settings.d?.folded).toBeUndefined();
    const outer = moveByHand(inner, "d", "card", at(201));
    const restored = restorePlot(outer, "plot:d", at(210));
    expect(Object.values(restored.settings).every((setting) => setting.folded === undefined)).toBe(
      true,
    );
  });

  function placements(yard: YardState) {
    return placeYard({
      viewport: wide(),
      hub,
      settings: Object.values(yard.settings),
      prefs: { reducedMotion: false, tier: "active" },
    });
  }
});

describe("sizes follow measured attention", () => {
  const yard = arrive(unfoldedSeed(), [opened("f", "d", 10)], 10);

  it("change at the keeper's notices and never on the clock", () => {
    const busy = interactions(noticed(yard, "f", "enter", 20), "f", 21, 22);
    expect(busy.settings.f?.size).toBe("working");
    const left = noticed(busy, "f", "leave", 70);
    const muchLater = at(70) + 2 * hour;
    expect(stepYard(left, asked, muchLater).settings.f?.size).toBe("working");
    expect(nextChangeAt(left, noon + unfoldBudget.windowMs)).toBeUndefined();
    const touched = attend(left, { id: "d", kind: "interact", at: muchLater });
    expect(touched.settings.f?.size).toBe("readable");
  });
});

function wide(): Rect {
  return { x: 0, y: 0, width: 2560, height: 1440 };
}

function view(yard: YardState, moment: number) {
  const card = yardCard(yard, moment);
  return {
    settings: Object.values(yard.settings)
      .map(({ depth: _depth, ...shown }) => shown)
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    decisions: yard.decisions,
    card: {
      used: card.used,
      cooldowns: card.cooldowns,
      free: card.nextFreeAt > moment ? card.nextFreeAt : "now",
    },
  };
}

const noticeArb = fc.record({
  id: fc.constantFrom("d", "f", "c"),
  kind: fc.constantFrom<AttendKind>("enter", "leave", "interact"),
  after: fc.integer({ min: 0, max: 6 * minute }),
});

describe("the next moment, with lineage and attention, for any run of notices", () => {
  it("changes the yard exactly then, and not a moment before", () => {
    fc.assert(
      fc.property(
        fc.array(noticeArb, { maxLength: 10 }),
        fc.integer({ min: 0, max: 20 * minute }),
        (notices, rest) => {
          let moment = at(10);
          let yard = arrive(unfoldedSeed(), [opened("f", "d", 10), shownBy("c", "d", 10)], 10);
          for (const { id, kind, after } of notices) {
            moment += after;
            yard = stepYard(attend(yard, { id, kind, at: moment }), asked, moment);
          }
          const last = moment + rest;
          yard = stepYard(yard, asked, last);
          const settledView = view(yard, last);
          const next = nextChangeAt(yard, last);
          if (next === undefined) {
            expect(view(stepYard(yard, asked, last + 2 * hour), last + 2 * hour)).toEqual(
              settledView,
            );
            return;
          }
          expect(next).toBeGreaterThan(last);
          expect(view(stepYard(yard, asked, next - 1), next - 1)).toEqual(settledView);
          expect(view(stepYard(yard, asked, next), next)).not.toEqual(settledView);
        },
      ),
      { numRuns: 200 },
    );
  });
});
