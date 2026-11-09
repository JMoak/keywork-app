import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { project, projectAll } from "../world/project.ts";
import { emptyHabitat } from "../world/types.ts";
import {
  attend,
  attendedAt,
  attentionTuning,
  flowedScore,
  scoreAt,
  sizeAfter,
} from "./attention.ts";
import { depthOf, pinnedDepth } from "./depth.ts";
import { stepYard } from "./step.ts";
import { aSetting, aYardSetting, calm, isoAt, noon, proposed } from "./testing.ts";
import {
  type AttendKind,
  type Attention,
  type Size,
  type YardSetting,
  type YardState,
  yardOf,
} from "./types.ts";

const { halfLifeMs, entry, interaction, ceiling, working } = attentionTuning;
const at = (seconds: number): number => noon + seconds * second;

function unfolded(id: string, from: string | null = null): YardSetting {
  return aYardSetting({
    id,
    from,
    shown: "unfold",
    what: { kind: "file", ref: `${id}.ts` },
    unfolded: { at: noon, slot: 0, focus: undefined, byHand: true },
  });
}

function yardOfThree(): YardState {
  const settings = [unfolded("a"), unfolded("b"), unfolded("c")];
  return {
    ...yardOf(emptyHabitat()),
    settings: Object.fromEntries(settings.map((s) => [s.id, s])),
  };
}

function noticed(notices: readonly [string, AttendKind, number][], yard = yardOfThree()) {
  return notices.reduce(
    (held, [id, kind, seconds]) => attend(held, { id, kind, at: at(seconds) }),
    yard,
  );
}

function attentionOf(yard: YardState, id: string): Attention | undefined {
  return yard.settings[id]?.attention;
}

describe("a visit", () => {
  it("is a pass-through, adding nothing, when it lasts under two seconds with no interaction", () => {
    const passed = noticed([
      ["a", "enter", 0],
      ["a", "leave", 1.9],
    ]);
    expect(attentionOf(passed, "a")).toBeUndefined();
    expect(passed.visit).toBeUndefined();
  });

  it("counts as an entry, five points, once it lasts two seconds", () => {
    const stayed = noticed([
      ["a", "enter", 0],
      ["a", "leave", 2],
    ]);
    expect(attentionOf(stayed, "a")).toMatchObject({
      entries: 1,
      score: entry,
      dwellMs: 2 * second,
    });
  });

  it("counts as an entry at its first interaction, however short", () => {
    const touched = noticed([
      ["a", "enter", 0],
      ["a", "interact", 0.5],
    ]);
    expect(attentionOf(touched, "a")).toMatchObject({
      entries: 1,
      interactions: 1,
      score: entry + interaction,
    });
    expect(touched.visit).toEqual({ id: "a", since: at(0), counted: true });
    const left = noticed([["a", "leave", 1]], touched);
    expect(attentionOf(left, "a")).toMatchObject({ entries: 1, dwellMs: second });
  });

  it("earns a whole point per ten seconds, at most sixty seconds a visit", () => {
    const read = noticed([
      ["a", "enter", 0],
      ["a", "leave", 45],
    ]);
    expect(attentionOf(read, "a")).toMatchObject({ score: entry + 4, dwellMs: 45 * second });
    const longer = noticed([
      ["a", "enter", 0],
      ["a", "leave", 300],
    ]);
    expect(attentionOf(longer, "a")?.score).toBeCloseTo(entry + 6, 10);
    expect(attentionOf(longer, "a")?.dwellMs).toBe(300 * second);
  });

  it("is open yard state, one at a time: entering another closes the first", () => {
    const moved = noticed([
      ["a", "enter", 0],
      ["b", "enter", 30],
    ]);
    expect(attentionOf(moved, "a")).toMatchObject({ entries: 1, score: entry + 3 });
    expect(moved.visit).toEqual({ id: "b", since: at(30), counted: false });
  });

  it("arrives through the keeper.attend notice, timed by its ts", () => {
    const state = projectAll(emptyHabitat(), [
      proposed(1, aSetting({ id: "a" })),
      { type: "keeper.attend", ts: isoAt(noon), id: "a", kind: "enter" },
    ]);
    expect(yardOf(state).visit).toEqual({ id: "a", since: noon, counted: false });
    const ignored = project(state, {
      type: "keeper.attend",
      ts: isoAt(noon),
      id: "x",
      kind: "leave",
    });
    expect(ignored.yard).toBe(state.yard);
  });
});

describe("the score", () => {
  it("halves every ten minutes after the last counted notice", () => {
    const yard = noticed([
      ["a", "enter", 0],
      ["a", "leave", 2],
    ]);
    expect(scoreAt(attentionOf(yard, "a"), at(2) + halfLifeMs)).toBe(entry / 2);
    expect(scoreAt(attentionOf(yard, "a"), at(2) + 2 * halfLifeMs)).toBe(entry / 4);
  });

  it("counts an interaction as one point, at most one every two seconds", () => {
    const once = noticed([["a", "interact", 0]]);
    expect(noticed([["a", "interact", 1.9]], once)).toBe(once);
    const twice = noticed([["a", "interact", 2]], once);
    expect(attentionOf(twice, "a")).toMatchObject({ interactions: 2, interactedAt: at(2) });
  });

  it("saturates at forty", () => {
    const busy = Array.from({ length: 60 }, (_, index): [string, AttendKind, number] => [
      "a",
      "interact",
      index * 2,
    ]);
    expect(attentionOf(noticed(busy), "a")?.score).toBe(ceiling);
  });

  it("returns the same yard for a notice about no setting or a leave from elsewhere", () => {
    const yard = yardOfThree();
    expect(attend(yard, { id: "missing", kind: "enter", at: noon })).toBe(yard);
    expect(attend(yard, { id: "a", kind: "leave", at: noon })).toBe(yard);
    const inside = noticed([["a", "enter", 0]]);
    expect(attend(inside, { id: "a", kind: "enter", at: at(1) })).toBe(inside);
  });

  it("stops its clock while the console is hidden, and decays while the keeper is elsewhere", () => {
    const attended = stepYard(noticed([["a", "interact", 0]]), calm, at(0));
    const hidden = stepYard(attended, { ...calm, visible: false }, at(60));
    const back = stepYard(
      hidden,
      { ...calm, returnedAt: at(60) + 30 * minute },
      at(60) + 30 * minute,
    );
    expect(back.awaySince).toBeUndefined();
    expect(scoreAt(attentionOf(back, "a"), at(60) + 30 * minute)).toBe(
      scoreAt(attentionOf(attended, "a"), at(60)),
    );
    expect(scoreAt(attentionOf(attended, "a"), at(60) + 30 * minute)).toBeLessThan(
      scoreAt(attentionOf(attended, "a"), at(60)),
    );
  });
});

describe("sizes", () => {
  it("go working at twenty and back to readable only below ten", () => {
    expect(sizeAfter("readable", working.enter - 0.01)).toBe("readable");
    expect(sizeAfter("readable", working.enter)).toBe("working");
    expect(sizeAfter("working", working.leave)).toBe("working");
    expect(sizeAfter("working", working.leave - 0.01)).toBe("readable");
    expect(sizeAfter("card", 0)).toBe("readable");
  });

  it("never promote on one glance, a minute of reading, or three short visits", () => {
    const visits = (count: number, stay: number) =>
      noticed(
        Array.from({ length: count }, (_, index): [string, AttendKind, number][] => [
          ["a", "enter", index * 120],
          ["a", "leave", index * 120 + stay],
        ]).flat(),
      );
    expect(visits(1, 2).settings.a?.size).toBeUndefined();
    expect(visits(1, 60).settings.a?.size).toBeUndefined();
    expect(visits(3, 10).settings.a?.size).toBeUndefined();
  });

  it("promote after a minute of reading with ten interactions", () => {
    const reading = Array.from({ length: 10 }, (_, index): [string, AttendKind, number] => [
      "a",
      "interact",
      index * 5 + 1,
    ]);
    const yard = noticed([["a", "enter", 0], ...reading, ["a", "leave", 60]]);
    expect(yard.settings.a?.size).toBe("working");
  });

  it("keep two panels working at most, sending back the one touched longest ago", () => {
    const promote = (id: string, start: number): [string, AttendKind, number][] =>
      Array.from({ length: 22 }, (_, index) => [id, "interact", start + index * 2]);
    const yard = noticed([...promote("a", 0), ...promote("b", 100), ...promote("c", 200)]);
    expect(yard.settings.a?.size).toBe("readable");
    expect(yard.settings.b?.size).toBe("working");
    expect(yard.settings.c?.size).toBe("working");
  });

  it("never shrink the panel the keeper is in, and change only at the keeper's own notices", () => {
    const busy = Array.from({ length: 20 }, (_, index): [string, AttendKind, number] => [
      "a",
      "interact",
      index * 2 + 1,
    ]);
    const working = noticed([["a", "enter", 0], ...busy]);
    expect(working.settings.a?.size).toBe("working");
    const muchLater = at(3600);
    expect(stepYard(working, calm, muchLater).settings.a?.size).toBe("working");
    const elsewhere = attend(working, { id: "b", kind: "interact", at: muchLater });
    expect(elsewhere.settings.a?.size).toBe("working");
    const left = attend(elsewhere, { id: "a", kind: "leave", at: muchLater + second });
    expect(left.settings.a?.size).toBe("readable");
  });

  it("settle to one size: a second look at the same score changes nothing", () => {
    fc.assert(
      fc.property(sizeArb, scoreArb, (size, score) => {
        const once = sizeAfter(size, score);
        expect(sizeAfter(once, score)).toBe(once);
      }),
    );
  });

  it("never flicker: under a monotone score the size moves one way only", () => {
    fc.assert(
      fc.property(
        sizeArb,
        fc.array(scoreArb, { minLength: 2, maxLength: 24 }),
        fc.boolean(),
        (start, drawn, rising) => {
          const scores = drawn.toSorted((a, b) => (rising ? a - b : b - a));
          const [first = 0, ...rest] = scores;
          let size = sizeAfter(start, first);
          for (const score of rest) {
            const next = sizeAfter(size, score);
            if (next !== size) expect(next).toBe(rising ? "working" : "readable");
            size = next;
          }
        },
      ),
    );
  });

  it("hold while the score wanders inside the band's gap", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.double({ min: working.leave, max: working.enter, maxExcluded: true, noNaN: true }),
        ),
        (wandering) => {
          for (const score of wandering) {
            expect(sizeAfter("working", score)).toBe("working");
            expect(sizeAfter("readable", score)).toBe("readable");
          }
        },
      ),
    );
  });
});

describe("attention on the trail", () => {
  const trail = (): YardState => {
    const settings = [unfolded("s"), unfolded("c", "s"), unfolded("g", "c")];
    return {
      ...yardOf(emptyHabitat()),
      settings: Object.fromEntries(settings.map((s) => [s.id, s])),
    };
  };

  it("flows up to each ancestor at half per level", () => {
    const busy = Array.from({ length: 30 }, (_, index): [string, AttendKind, number] => [
      "g",
      "interact",
      index * 2,
    ]);
    const yard = noticed(busy, trail());
    const own = scoreAt(attentionOf(yard, "g"), at(60));
    expect(flowedScore(yard, "g", at(60))).toBe(own);
    expect(flowedScore(yard, "c", at(60))).toBe(own / 2);
    expect(flowedScore(yard, "s", at(60))).toBe(own / 4);
  });

  it("keeps an ancestor attended while focus is anywhere below it", () => {
    const inside = noticed([["g", "enter", 0]], trail());
    expect(attendedAt(inside, "s", at(10))).toBe(true);
    expect(attendedAt(noticed([["g", "leave", 1]], inside), "s", at(10))).toBe(false);
  });
});

describe("depth with attention", () => {
  it("adds attention scaled to at most six, and keeps every pinned setting on top", () => {
    const busy = Array.from({ length: 60 }, (_, index): [string, AttendKind, number] => [
      "a",
      "interact",
      index * 2,
    ]);
    const yard = noticed(busy);
    const attended = yard.settings.a as YardSetting;
    const plain = depthOf({ ...attended, attention: undefined }, calm, at(120));
    expect(depthOf(attended, calm, at(120))).toBeCloseTo(
      plain + 6 * (scoreAt(attended.attention, at(120)) / ceiling),
      2,
    );
    const pinned = depthOf(
      aYardSetting({ state: "pinned", at: isoAt(noon - 3 * halfLifeMs) }),
      calm,
      at(120),
    );
    expect(pinned).toBeGreaterThan(depthOf(attended, { ...calm, focusedThread: "s1" }, at(120)));
    expect(pinned).toBeGreaterThanOrEqual(pinnedDepth);
  });
});

const sizeArb = fc.constantFrom<Size>("readable", "working");
const scoreArb = fc.double({ min: 0, max: ceiling, noNaN: true });

const noticeArb = fc.record({
  id: fc.constantFrom("a", "b", "c"),
  kind: fc.constantFrom<AttendKind>("enter", "leave", "interact"),
  after: fc.integer({ min: 0, max: 90 * second }),
});

describe("attention, for any run of notices", () => {
  it("stays between nothing and forty, keeps one visit and two working at most, and never loses a count", () => {
    fc.assert(
      fc.property(fc.array(noticeArb, { maxLength: 40 }), (drawn) => {
        let moment = noon;
        let yard = yardOfThree();
        for (const { id, kind, after } of drawn) {
          moment += after;
          const before = yard.settings[id]?.attention;
          yard = attend(yard, { id, kind, at: moment });
          const now = yard.settings[id]?.attention;
          const settings = Object.values(yard.settings);
          for (const setting of settings) {
            const score = scoreAt(setting.attention, moment);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(ceiling);
          }
          expect(settings.filter((s) => s.size === "working").length).toBeLessThanOrEqual(2);
          expect(now?.entries ?? 0).toBeGreaterThanOrEqual(before?.entries ?? 0);
          expect(now?.dwellMs ?? 0).toBeGreaterThanOrEqual(before?.dwellMs ?? 0);
        }
      }),
    );
  });

  it("never rises without a notice", () => {
    fc.assert(
      fc.property(fc.array(noticeArb, { maxLength: 20 }), fc.nat(60 * minute), (drawn, later) => {
        let moment = noon;
        let yard = yardOfThree();
        for (const { id, kind, after } of drawn) {
          moment += after;
          yard = attend(yard, { id, kind, at: moment });
        }
        for (const setting of Object.values(yard.settings)) {
          expect(scoreAt(setting.attention, moment + later)).toBeLessThanOrEqual(
            scoreAt(setting.attention, moment),
          );
        }
      }),
    );
  });
});
