import type { BusEnvelope, Setting } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { coldStart } from "../world/cold-start.ts";
import { project, projectAll } from "../world/project.ts";
import { emptyHabitat, type HabitatState } from "../world/types.ts";
import { attend, attentionTuning, flowedScore, scoreAt } from "./attention.ts";
import { yardCard } from "./card.ts";
import { codeWidth, defaultHub, overlaps, placeYard } from "./place.ts";
import { moveByHand, stepYard } from "./step.ts";
import { aSetting, askedIn, aYardSetting, calm, isoAt, noon, proposed } from "./testing.ts";
import {
  type AttendKind,
  type Placement,
  type Rect,
  sizeOf,
  type YardContext,
  type YardSetting,
  type YardState,
  yardOf,
} from "./types.ts";

const { halfLifeMs, working } = attentionTuning;

const asked: YardContext = { ...calm, ...askedIn("s1", noon - 30 * second) };

const desktop: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
const laptop: Rect = { x: 0, y: 0, width: 1280, height: 800 };

function named(id: string, overrides: Partial<Setting> = {}): Setting {
  return aSetting({
    id,
    creature: id,
    rung: "unfold",
    size: "working",
    what: { kind: "note", ref: id },
    ...overrides,
  });
}

function plain(id: string, overrides: Partial<Setting> = {}): Setting {
  return named(id, { size: undefined, ...overrides });
}

function arrived(settings: readonly Setting[], context = asked, at = noon): YardState {
  const stream: BusEnvelope[] = settings.map((setting, index) => proposed(index + 1, setting));
  return stepYard(yardOf(projectAll(emptyHabitat(), stream)), context, at);
}

function habitatWith(yard: YardState): HabitatState {
  return { ...emptyHabitat(), yard };
}

function noticed(yard: YardState, id: string, kind: AttendKind, at: number): YardState {
  return attend(yard, { id, kind, at });
}

function interactions(yard: YardState, id: string, from: number, count: number): YardState {
  return Array.from({ length: count }, (_, index) => from + index * 2 * second).reduce(
    (held, at) => noticed(held, id, "interact", at),
    yard,
  );
}

describe("a size the creature named", () => {
  it("opens the setting at that size the first time it unfolds, in the step that unfolds it", () => {
    expect(arrived([named("a")]).settings.a).toMatchObject({
      shown: "unfold",
      size: "working",
      headStart: { score: working.enter, lastAt: noon },
    });
  });

  it("waits through a card and opens at it when the keeper raises the setting by hand", () => {
    const held = arrived([named("a", { rung: "card" })]);
    expect(held.settings.a).toMatchObject({ shown: "card", size: "working" });
    expect(held.settings.a?.headStart).toBeUndefined();
    const raised = moveByHand(held, "a", "unfold", noon + minute);
    expect(raised.settings.a).toMatchObject({
      shown: "unfold",
      size: "working",
      headStart: { lastAt: noon + minute },
    });
  });

  it("waits through a held unfold too, the gate deciding the rung and never the size", () => {
    const unasked = arrived([named("a")], calm);
    expect(unasked.settings.a).toMatchObject({ shown: "card", size: "working" });
    expect(moveByHand(unasked, "a", "unfold", noon).settings.a?.size).toBe("working");
  });

  it("leaves the choice to the yard when none was named or readable was", () => {
    const quiet = arrived([plain("a")]).settings.a;
    expect(quiet?.size).toBeUndefined();
    expect(quiet?.headStart).toBeUndefined();
    const readable = arrived([named("a", { size: "readable" })]);
    expect(readable.settings.a?.size).toBe("readable");
    expect(readable.settings.a?.headStart).toBeUndefined();
    expect(interactions(readable, "a", noon, 22).settings.a?.size).toBe("working");
  });

  it("is honoured once: however it folds, the next unfold is readable", () => {
    const opened = arrived([named("a")]);
    const foldedBack = stepYard(opened, asked, noon + 10 * minute);
    expect(foldedBack.settings.a?.shown).toBe("card");
    const lowered = moveByHand(opened, "a", "card", noon + minute);
    for (const yard of [foldedBack, lowered]) {
      const held = yard.settings.a;
      expect(held?.size).toBeUndefined();
      expect(held?.headStart).toBeUndefined();
      const again = moveByHand(yard, "a", "unfold", noon + 11 * minute).settings.a;
      expect(sizeOf(again as YardSetting)).toBe("readable");
      expect(again?.headStart).toBeUndefined();
    }
  });

  it("is never re-armed by a replayed proposal or a re-listing", () => {
    const foldedBack = habitatWith(stepYard(arrived([named("a")]), asked, noon + 10 * minute));
    const replayed = project(foldedBack, proposed(1, named("a")));
    const relisted = project(foldedBack, {
      type: "keeper.show",
      ts: isoAt(noon + 11 * minute),
      settings: [named("a")],
    });
    expect(yardOf(replayed).settings.a?.size).toBeUndefined();
    expect(yardOf(relisted).settings.a?.size).toBeUndefined();
  });

  it("stays as it was when a re-listing or a move finds the panel already open", () => {
    const opened = arrived([named("a"), plain("b", { rung: "card" })]);
    const relisted = project(habitatWith(opened), {
      type: "keeper.show",
      ts: isoAt(noon + minute),
      settings: [named("a"), plain("b", { rung: "card" })],
    });
    expect(yardOf(relisted).settings.a).toMatchObject({
      size: "working",
      headStart: { lastAt: noon },
    });
    const staged = moveByHand(opened, "a", "stage", noon + minute);
    const offStage = moveByHand(staged, "b", "stage", noon + 2 * minute);
    expect(offStage.settings.a).toMatchObject({
      shown: "unfold",
      size: "working",
      headStart: { lastAt: noon },
    });
  });

  it("gives way at two working panels: a third opens readable and nobody is sent back", () => {
    const three = arrived([
      named("a", { at: isoAt(noon) }),
      named("b", { at: isoAt(noon + 1) }),
      named("c", { at: isoAt(noon + 2) }),
    ]);
    expect(three.settings.a?.size).toBe("working");
    expect(three.settings.b?.size).toBe("working");
    expect(three.settings.c?.size).toBe("readable");
    expect(three.settings.c?.headStart).toBeUndefined();
  });

  it("gives way to panels the keeper's own attention made working", () => {
    const busy = interactions(
      interactions(arrived([plain("x"), plain("y")]), "x", noon, 22),
      "y",
      noon + minute,
      22,
    );
    expect(busy.settings.x?.size).toBe("working");
    expect(busy.settings.y?.size).toBe("working");
    const later = noon + 3 * minute;
    const context = { ...asked, ...askedIn("s1", later - second) };
    const next = stepYard(
      yardOf(project(habitatWith(busy), proposed(9, named("z", { at: isoAt(later) })))),
      context,
      later,
    );
    expect(next.settings.z).toMatchObject({ shown: "unfold", size: "readable" });
    expect(next.settings.x?.size).toBe("working");
    expect(next.settings.y?.size).toBe("working");
  });
});

describe("the head start a named working panel opens with", () => {
  const opened = arrived([named("a"), plain("o")]);

  it("holds it working through the keeper's unrelated keystrokes and every yard step", () => {
    const typing = interactions(opened, "o", noon + second, 5);
    expect(typing.settings.a).toMatchObject({ size: "working" });
    expect(stepYard(opened, asked, noon + 5 * minute).settings.a?.size).toBe("working");
  });

  it("decays like attention, sending an ignored panel back only at the keeper's next input", () => {
    const byHand = moveByHand(
      arrived([named("a", { rung: "card" }), plain("o")]),
      "a",
      "unfold",
      noon,
    );
    const later = noon + halfLifeMs + second;
    expect(stepYard(byHand, asked, later).settings.a?.size).toBe("working");
    expect(noticed(byHand, "o", "interact", noon + halfLifeMs).settings.a?.size).toBe("working");
    const sent = noticed(byHand, "o", "interact", later).settings.a;
    expect(sent?.size).toBe("readable");
    expect(sent?.headStart).toBeUndefined();
  });

  it("folds back with the panel when the keeper leaves it alone, as anything ignored does", () => {
    const stepped = stepYard(opened, asked, noon + 10 * minute);
    expect(stepped.settings.a?.shown).toBe("card");
    expect(stepped.settings.a?.size).toBeUndefined();
  });

  it("joins the keeper's own attention: a glance keeps it, a long look outlasts it", () => {
    const glanced = noticed(noticed(opened, "a", "enter", noon), "a", "leave", noon + 3 * second);
    expect(glanced.settings.a?.size).toBe("working");
    const busy = interactions(opened, "a", noon, 60);
    const lastTouch = noon + 118 * second;
    const atTwoHalfLives = lastTouch + 2 * halfLifeMs;
    expect(noticed(busy, "o", "interact", atTwoHalfLives).settings.a?.size).toBe("working");
    expect(noticed(busy, "o", "interact", atTwoHalfLives + 1).settings.a?.size).toBe("readable");
  });

  it("is no attention: depth, the fold-back rule, the card and the trail never hear of it", () => {
    const plainTwin = arrived([plain("a")]).settings.a;
    expect(opened.settings.a?.depth).toBe(plainTwin?.depth);
    expect(opened.settings.a?.attention).toBeUndefined();
    expect(yardCard(opened, noon).attended).toEqual([]);
    const movedOn = stepYard(opened, { ...asked, focusedThread: "s2" }, noon + second);
    expect(movedOn.settings.a?.shown).toBe("card");
    const child = arrived([plain("p"), named("c", { from: "p", at: isoAt(noon + 1) })]);
    expect(child.settings.c?.size).toBe("working");
    expect(flowedScore(child, "p", noon)).toBe(0);
  });

  it("stops its clock while the console is hidden", () => {
    const byHand = moveByHand(arrived([named("a", { rung: "card" })]), "a", "unfold", noon);
    const leftAt = noon + minute;
    const returnedAt = leftAt + 30 * minute;
    const hidden = stepYard(byHand, { ...asked, visible: false }, leftAt);
    const back = stepYard(hidden, { ...asked, returnedAt }, returnedAt);
    expect(scoreAt(back.settings.a?.headStart, returnedAt)).toBe(
      scoreAt(byHand.settings.a?.headStart, leftAt),
    );
  });

  it("ends when the panel leaves working, so a glance cannot promote it back", () => {
    const pair = interactions(arrived([named("a"), named("b"), plain("c")]), "c", noon, 22);
    expect(pair.settings.a).toMatchObject({ size: "working", headStart: { lastAt: noon } });
    expect(pair.settings.b).toMatchObject({ size: "readable" });
    expect(pair.settings.b?.headStart).toBeUndefined();
    const glance = noticed(pair, "b", "interact", noon + minute);
    expect(glance.settings.b?.size).toBe("readable");
  });
});

describe("where a named working panel goes", () => {
  const prefs = { reducedMotion: false, tier: "active" } as const;

  function place(
    settings: readonly YardSetting[],
    viewport: Rect = desktop,
    inside?: string,
  ): readonly Placement[] {
    return placeYard({ viewport, hub: defaultHub(viewport), settings, prefs, inside });
  }

  function find(placed: readonly Placement[], id: string): Placement {
    const found = placed.find((placement) => placement.id === id);
    if (found === undefined) throw new Error(`${id} was not placed`);
    return found;
  }

  function panel(id: string, depth: number, slot: number, more: Partial<YardSetting> = {}) {
    return aYardSetting({
      id,
      shown: "unfold",
      depth,
      what: { kind: "note", ref: id },
      unfolded: { at: 100 - depth, slot, focus: undefined, byHand: false },
      ...more,
    });
  }

  function onHeadStart(setting: YardSetting): YardSetting {
    return { ...setting, size: "working", headStart: { score: working.enter, lastAt: noon } };
  }

  function earned(setting: YardSetting): YardSetting {
    return {
      ...setting,
      size: "working",
      attention: { dwellMs: 0, entries: 1, interactions: 22, lastAt: noon, score: 21 },
    };
  }

  it("grows into free space, and stops at every panel already out", () => {
    const neighbour = panel("d", 3, 1);
    const before = find(place([neighbour]), "d");
    const placed = place([onHeadStart(panel("f", 9, 0)), neighbour]);
    expect(find(placed, "d")).toEqual(before);
    expect(find(placed, "f")).toMatchObject({ size: "working", rung: "unfold" });
    expect(overlaps(find(placed, "f").rect, before.rect)).toBe(false);
  });

  it("shows less where the free space is too small, and keeps its working size in state", () => {
    const placed = place([panel("d", 3, 0), onHeadStart(panel("f", 9, 1))], laptop);
    expect(find(placed, "f").size).toBe("readable");
    expect(find(placed, "d").size).toBe("readable");
  });

  it("yields to a working panel the keeper earned, however deep it is", () => {
    const keeperWorks = earned(panel("e", 3, 1));
    const alone = find(place([keeperWorks]), "e");
    const placed = place([keeperWorks, onHeadStart(panel("f", 30, 0))]);
    expect(find(placed, "e")).toEqual(alone);
    expect(find(placed, "f")).toMatchObject({ rung: "unfold", size: "card" });
  });

  it("lets an older head start keep its space when a later one arrives", () => {
    const opened = (at: number, slot: number) => ({ at, slot, focus: undefined, byHand: false });
    const first = onHeadStart(panel("a", 3, 0, { unfolded: opened(1, 0) }));
    const later = onHeadStart(panel("b", 30, 1, { unfolded: opened(2, 1) }));
    const alone = find(place([first]), "a");
    expect(find(place([first, later]), "a")).toEqual(alone);
  });

  it("competes as any panel once the keeper has attended it", () => {
    const neighbour = panel("d", 3, 0);
    const untouched = place([neighbour, onHeadStart(panel("f", 9, 1))]);
    expect(find(untouched, "f").size).toBe("readable");
    expect(find(untouched, "d").size).toBe("readable");
    const attended = place([neighbour, earned(onHeadStart(panel("f", 9, 1)))]);
    expect(find(attended, "f").size).toBe("working");
    expect(find(attended, "d").size).toBe("card");
  });

  it("never narrows a code panel below eighty columns, at either size", () => {
    const file = { kind: "file", ref: "a.ts" } as const;
    const readable = panel("a", 9, 0, { what: file, size: "readable" });
    const named = onHeadStart(panel("b", 9, 0, { what: file }));
    expect(find(place([readable]), "a").rect.width).toBeGreaterThanOrEqual(codeWidth);
    expect(find(place([named]), "b").rect.width).toBeGreaterThanOrEqual(codeWidth);
  });
});

describe("the wire's size at arrival", () => {
  it("carries a named size from a proposal and from a cold start, and absence stays absent", () => {
    const fromTheWire = yardOf(project(emptyHabitat(), proposed(1, named("a")))).settings.a;
    expect(fromTheWire).toMatchObject({ shown: "glyph", size: "working" });
    expect(fromTheWire?.headStart).toBeUndefined();
    const cold = yardOf(
      coldStart({ at: isoAt(noon), sessions: [], settings: [named("a"), plain("b")] }),
    );
    expect(cold.settings.a?.size).toBe("working");
    expect(cold.settings.b?.size).toBeUndefined();
  });
});
