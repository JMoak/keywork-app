import { mulberry32, type Random } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import type { ScreenRect } from "../port.ts";
import { orbit } from "./arrange.ts";
import {
  arrangedFor,
  type BurstContext,
  type BurstFacts,
  choosePattern,
  contextOf,
  type Relation,
  type Urgency,
} from "./pattern-choice.ts";
import {
  brokenPlaces,
  brokenTiming,
  counts,
  maximised,
  named,
  panes,
  seeds,
  settings,
  windowed,
  workAreas,
} from "./pattern-testing.ts";
import { eligible, type Pattern, patterns } from "./patterns.ts";

const relations: readonly Relation[] = ["sequence", "siblings", "tasks", "notes", "unknown"];
const urgencies: readonly Urgency[] = ["waiting", "soon", "later"];
const manySeeds = Array.from({ length: 64 }, (_, seed) => seed + 1);
const full = workAreas[1] as ScreenRect;
const wide = workAreas[2] as ScreenRect;

const unrolled: Random = () => {
  throw new Error("a keeper's own action rolls no dice");
};

function keepers(over: Partial<BurstContext> = {}): BurstContext {
  return {
    count: 5,
    asker: "keeper",
    relation: "unknown",
    urgency: "soon",
    room: "open",
    maximised: false,
    fits: patterns,
    ...over,
  };
}

function creatures(over: Partial<BurstContext> = {}): BurstContext {
  return keepers({ asker: "creature", ...over });
}

function chosenAcross(context: BurstContext, rolls: readonly number[] = manySeeds): Pattern[] {
  const chosen = new Set(rolls.map((seed) => choosePattern(context, mulberry32(seed))));
  return patterns.filter((pattern) => chosen.has(pattern));
}

function without(...missing: Pattern[]): Pattern[] {
  return patterns.filter((pattern) => !missing.includes(pattern));
}

describe("one pane alone", () => {
  it("always takes a column slot, whoever asks and whatever it is", () => {
    for (const relation of relations) {
      for (const urgency of urgencies) {
        expect(choosePattern(keepers({ count: 1, relation, urgency }), unrolled)).toBe("column");
        expect(
          chosenAcross(creatures({ count: 1, relation, urgency, previous: "column" })),
        ).toEqual(["column"]);
      }
    }
  });

  it("stands where the orbit would seat it, beside the console or in its far corner", () => {
    const facts: BurstFacts = { asker: "creature", relation: "notes", urgency: "later" };
    for (const area of workAreas) {
      for (const [, deskFor] of settings) {
        const incoming = { desk: deskFor(area), arriving: panes(1, area) };
        const alone = arrangedFor(incoming, facts, mulberry32(1));
        expect(alone.seats).toEqual(orbit(incoming.desk, incoming.arriving));
        expect(alone.pattern).toBe(incoming.desk.consoleMaximized ? "cascade" : "column");
      }
    }
  });
});

describe("a keeper's own burst", () => {
  it("suits the pattern to how the arrivals relate", () => {
    expect(choosePattern(keepers({ relation: "sequence" }), unrolled)).toBe("stair");
    expect(choosePattern(keepers({ relation: "siblings" }), unrolled)).toBe("fan");
    expect(choosePattern(keepers({ relation: "tasks" }), unrolled)).toBe("grid");
    expect(choosePattern(keepers({ relation: "notes" }), unrolled)).toBe("burst");
    expect(choosePattern(keepers({ relation: "unknown" }), unrolled)).toBe("column");
  });

  it("piles whatever can wait, and nothing that waits on the keeper", () => {
    for (const relation of relations) {
      for (const count of [2, 5, 16]) {
        expect(choosePattern(keepers({ relation, count, urgency: "later" }), unrolled)).toBe(
          "pile",
        );
        expect(choosePattern(keepers({ relation, count, urgency: "waiting" }), unrolled)).not.toBe(
          "pile",
        );
      }
    }
  });

  it("seats what waits on the keeper where nothing overlaps", () => {
    const waiting = (relation: Relation): Pattern =>
      choosePattern(keepers({ relation, urgency: "waiting" }), unrolled);
    expect(waiting("unknown")).toBe("column");
    expect(waiting("notes")).toBe("column");
    expect(waiting("tasks")).toBe("grid");
    expect(waiting("sequence")).toBe("stair");
  });

  it("reads a few side by side and cascades a crowd", () => {
    expect(choosePattern(keepers({ count: 2 }), unrolled)).toBe("column");
    expect(choosePattern(keepers({ count: 3, relation: "notes" }), unrolled)).toBe("column");
    expect(choosePattern(keepers({ count: 12 }), unrolled)).toBe("cascade");
    expect(choosePattern(keepers({ count: 12, relation: "siblings" }), unrolled)).toBe("cascade");
    expect(choosePattern(keepers({ count: 12, relation: "notes" }), unrolled)).toBe("burst");
  });

  it("is the same for the same context, with no dice and no memory of the last burst", () => {
    for (const relation of relations) {
      for (const urgency of urgencies) {
        for (const count of counts) {
          const chosen = choosePattern(keepers({ relation, urgency, count }), unrolled);
          for (const previous of patterns) {
            expect(choosePattern(keepers({ relation, urgency, count, previous }), unrolled)).toBe(
              chosen,
            );
          }
        }
      }
    }
  });
});

describe("room overrides taste", () => {
  it("passes over a pattern the desk cannot hold for the next best that it can", () => {
    const sequence = keepers({ relation: "sequence" });
    expect(choosePattern({ ...sequence, fits: without("stair") }, unrolled)).toBe("cascade");
    expect(choosePattern({ ...sequence, fits: without("stair", "cascade") }, unrolled)).toBe(
      "column",
    );
    const tasks = keepers({ relation: "tasks" });
    expect(choosePattern({ ...tasks, fits: without("grid") }, unrolled)).toBe("column");
    const notes = keepers({ relation: "notes" });
    expect(choosePattern({ ...notes, fits: without("burst") }, unrolled)).toBe("cascade");
  });

  it("takes whatever is left, even a pile for what waits on the keeper", () => {
    const waiting = keepers({ urgency: "waiting", room: "short", fits: ["pile"] });
    expect(choosePattern(waiting, unrolled)).toBe("pile");
    expect(chosenAcross({ ...waiting, asker: "creature", previous: "pile" })).toEqual(["pile"]);
    expect(choosePattern(keepers({ fits: [] }), unrolled)).toBe("cascade");
  });

  it("makes the cascade the default when room is short or the console fills the display", () => {
    const overTheConsole: Pattern[] = ["cascade", "fan", "pile"];
    const filled = { room: "none", maximised: true, fits: overTheConsole } as const;
    expect(chosenAcross(creatures(filled))).toEqual(["cascade"]);
    expect(chosenAcross(creatures({ ...filled, relation: "tasks" }))).toEqual(["cascade"]);
    expect(chosenAcross(creatures({ ...filled, relation: "sequence" }))).toEqual(["cascade"]);
    expect(chosenAcross(creatures({ ...filled, relation: "siblings" }))).toEqual(["fan"]);
    expect(chosenAcross(creatures({ ...filled, urgency: "later" }))).toEqual(["pile"]);
    expect(chosenAcross(creatures({ room: "short", fits: ["cascade", "fan", "burst"] }))).toEqual([
      "cascade",
    ]);
  });

  it("never chooses a pattern the desk cannot hold, whatever the seed", () => {
    const desks: Pattern[][] = [["cascade"], ["pile"], ["cascade", "pile"], without("column")];
    for (const fits of desks) {
      for (const relation of relations) {
        for (const urgency of urgencies) {
          for (const count of [2, 5, 16]) {
            const context = creatures({ fits, relation, urgency, count });
            expect(chosenAcross(context).every((pattern) => fits.includes(pattern))).toBe(true);
            expect(fits).toContain(choosePattern({ ...context, asker: "keeper" }, unrolled));
          }
        }
      }
    }
  });
});

describe("a creature's burst", () => {
  it("varies among the patterns that suit equally well", () => {
    expect(chosenAcross(creatures())).toEqual(["cascade", "column", "fan", "grid", "burst"]);
    expect(chosenAcross(creatures({ count: 12 }))).toEqual(["cascade", "burst"]);
    expect(chosenAcross(creatures({ count: 3, relation: "siblings" }))).toEqual(["column", "fan"]);
  });

  it("holds to the one pattern made for the arrivals", () => {
    expect(chosenAcross(creatures({ relation: "sequence" }))).toEqual(["stair"]);
    expect(chosenAcross(creatures({ relation: "siblings" }))).toEqual(["fan"]);
    expect(chosenAcross(creatures({ relation: "tasks" }))).toEqual(["grid"]);
    expect(chosenAcross(creatures({ relation: "notes" }))).toEqual(["burst"]);
  });

  it("gives the same pattern for the same seed and context", () => {
    for (const seed of seeds) {
      for (const relation of relations) {
        const context = creatures({ relation, count: 12 });
        expect(choosePattern(context, mulberry32(seed))).toBe(
          choosePattern(context, mulberry32(seed)),
        );
      }
    }
  });

  it("does not repeat the previous burst's pattern when another suits as well", () => {
    const suited = chosenAcross(creatures());
    for (const previous of suited) {
      expect(chosenAcross(creatures({ previous }))).toEqual(
        suited.filter((pattern) => pattern !== previous),
      );
    }
  });

  it("repeats it when it alone suits", () => {
    expect(chosenAcross(creatures({ relation: "notes", previous: "burst" }))).toEqual(["burst"]);
    expect(chosenAcross(creatures({ fits: ["cascade"], previous: "cascade" }))).toEqual([
      "cascade",
    ]);
  });
});

describe("the context read from a desk", () => {
  const facts: BurstFacts = { asker: "creature", relation: "tasks", urgency: "soon" };

  it("finds an open desk where panes can stand apart beside the console", () => {
    const context = contextOf({ desk: windowed(wide), arriving: panes(5, wide) }, facts);
    expect(context).toEqual({ ...facts, count: 5, room: "open", maximised: false, fits: patterns });
  });

  it("finds room short where only overlapping patterns stand beside the console", () => {
    const context = contextOf({ desk: windowed(full), arriving: panes(8, full) }, facts);
    expect(context).toMatchObject({ count: 8, room: "short", maximised: false, fits: ["pile"] });
  });

  it("finds none where the console fills the display", () => {
    const context = contextOf({ desk: maximised(full), arriving: panes(5, full) }, facts);
    expect(context).toMatchObject({ room: "none", maximised: true });
    expect(context.fits).toEqual(["cascade", "fan", "pile"]);
  });

  it("carries the previous burst's pattern", () => {
    const incoming = { desk: windowed(wide), arriving: panes(5, wide) };
    expect(contextOf(incoming, { ...facts, previous: "grid" }).previous).toBe("grid");
  });
});

describe("the arrangement chosen for a burst", () => {
  const bursts: readonly BurstFacts[] = [
    { asker: "creature", relation: "unknown", urgency: "soon" },
    { asker: "creature", relation: "notes", urgency: "later" },
    { asker: "creature", relation: "siblings", urgency: "waiting" },
    { asker: "keeper", relation: "tasks", urgency: "soon" },
  ];

  for (const area of workAreas) {
    for (const [how, deskFor] of settings) {
      for (const count of counts) {
        const incoming = { desk: deskFor(area), arriving: panes(count, area) };
        const held = eligible(incoming);

        it(`${named(area, how, count)}: holds on this desk and keeps every promise, any seed`, () => {
          for (const facts of bursts) {
            for (const seed of seeds) {
              const chosen = arrangedFor(incoming, facts, mulberry32(seed));
              expect(held).toContainEqual(chosen);
              expect(brokenPlaces(incoming, chosen)).toEqual([]);
              expect(brokenTiming(chosen)).toEqual([]);
              expect(arrangedFor(incoming, facts, mulberry32(seed))).toEqual(chosen);
            }
          }
        });

        it(`${named(area, how, count)}: leaves the console clear wherever anything can`, () => {
          const canStandBeside = patterns.some((pattern) =>
            held.some((each) => each.pattern === pattern && each.stands === "beside"),
          );
          for (const facts of bursts) {
            for (const seed of seeds) {
              const chosen = arrangedFor(incoming, facts, mulberry32(seed));
              expect(chosen.stands).toBe(canStandBeside ? "beside" : "over");
            }
          }
        });
      }
    }
  }

  it("is the keeper's without a roll of the dice", () => {
    const incoming = { desk: windowed(wide), arriving: panes(5, wide) };
    const tasks: BurstFacts = { asker: "keeper", relation: "tasks", urgency: "soon" };
    expect(arrangedFor(incoming, tasks, unrolled).pattern).toBe("grid");
  });

  it("varies with the seed for a creature, only among what holds here", () => {
    const incoming = { desk: windowed(wide), arriving: panes(5, wide) };
    const unknown: BurstFacts = { asker: "creature", relation: "unknown", urgency: "soon" };
    const chosen = new Set(
      manySeeds.map((seed) => arrangedFor(incoming, unknown, mulberry32(seed)).pattern),
    );
    expect(chosen.size).toBeGreaterThan(1);
    expect(
      [...chosen].every((pattern) => eligible(incoming).some((h) => h.pattern === pattern)),
    ).toBe(true);
  });
});
