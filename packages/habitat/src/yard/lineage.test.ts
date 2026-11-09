import type { BusEnvelope, Setting } from "@keywork-app/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { minute, second } from "../clock/clock.ts";
import { projectAll } from "../world/project.ts";
import { emptyHabitat } from "../world/types.ts";
import {
  chainOf,
  nameOf,
  parentOf,
  plotCardId,
  plotOf,
  plotSeedOf,
  trailOf,
  trailOrderOf,
} from "./lineage.ts";
import { foldPlot } from "./plot.ts";
import { stepYard } from "./step.ts";
import { aSetting, calm, isoAt, noon, proposed, settled } from "./testing.ts";
import { type YardState, yardOf } from "./types.ts";

const at = (seconds: number): string => isoAt(noon + seconds * second);

const diff = aSetting({
  id: "d",
  what: { kind: "diff", ref: "cs-1", title: "the fix" },
  at: at(0),
});
const file = aSetting({
  id: "f",
  from: "d",
  origin: "keeper",
  what: { kind: "file", ref: "src/yard/place.ts" },
  at: at(1),
});
const test = aSetting({
  id: "t",
  from: "f",
  origin: "keeper",
  what: { kind: "file", ref: "src/yard/place.test.ts" },
  at: at(2),
});
const note = aSetting({
  id: "n",
  from: "d",
  what: { kind: "note", ref: "a side note\nwith more" },
  at: at(3),
});

function grown(settings: readonly Setting[], after: readonly BusEnvelope[] = []): YardState {
  const stream = [...settings.map((setting, index) => proposed(index + 1, setting)), ...after];
  return stepYard(yardOf(projectAll(emptyHabitat(), stream)), calm, noon + minute);
}

const inquiry = grown([diff, file, test, note]);

describe("the trail", () => {
  it("walks from the root to a setting, root first", () => {
    expect(trailOf(inquiry, "t")).toEqual(["d", "f", "t"]);
    expect(trailOf(inquiry, "d")).toEqual(["d"]);
    expect(trailOf(inquiry, "missing")).toEqual([]);
  });

  it("names a parent only when the yard knows it, so a conversation's id roots a trail", () => {
    const fromThread = grown([aSetting({ id: "x", from: "s1" })]);
    expect(parentOf(inquiry, "t")).toBe("f");
    expect(parentOf(inquiry, "d")).toBeUndefined();
    expect(trailOf(fromThread, "x")).toEqual(["x"]);
  });

  it("lists a plot as its seed and every descendant, each branch in arrival order", () => {
    expect(plotOf(inquiry, "d")).toEqual(["d", "f", "t", "n"]);
    expect(plotOf(inquiry, "f")).toEqual(["f", "t"]);
    expect(plotOf(inquiry, "missing")).toEqual([]);
  });

  it("names the plot card after its seed and reads the seed back", () => {
    expect(plotCardId("d")).toBe("plot:d");
    expect(plotSeedOf("plot:d")).toBe("d");
    expect(plotSeedOf("d")).toBeUndefined();
  });
});

describe("the chain", () => {
  it("names the trail from the seed to a setting, the setting last", () => {
    expect(chainOf(inquiry, "t")).toBe("the fix → place.ts → place.test.ts");
    expect(chainOf(inquiry, "d")).toBe("the fix");
    expect(chainOf(inquiry, "n")).toBe("the fix → a side note");
    expect(chainOf(inquiry, "missing")).toBe("");
  });

  it("names a plot card from its seed to its deepest member, the newest leaf on a tie", () => {
    expect(chainOf(foldPlot(inquiry, "d"), "plot:d")).toBe("the fix → place.ts → place.test.ts");
    const later = aSetting({
      id: "l",
      from: "d",
      what: { kind: "url", ref: "https://x.dev/" },
      at: at(9),
    });
    expect(chainOf(foldPlot(grown([diff, note, later]), "d"), "plot:d")).toBe("the fix → x.dev");
    expect(chainOf(foldPlot(inquiry, "f"), "plot:d")).toBe("the fix → place.ts → place.test.ts");
  });

  it("keeps the seed and the last two names past four, and counts the middle", () => {
    const steps = Array.from({ length: 6 }, (_, index) =>
      aSetting({
        id: `c${index}`,
        from: index === 0 ? null : `c${index - 1}`,
        what: { kind: "note", ref: `step ${index}` },
        at: at(index),
      }),
    );
    const yard = grown(steps);
    expect(chainOf(yard, "c5")).toBe("step 0 → 3 more → step 4 → step 5");
    expect(chainOf(yard, "c4")).toBe("step 0 → 2 more → step 3 → step 4");
    expect(chainOf(yard, "c3")).toBe("step 0 → step 1 → step 2 → step 3");
  });

  it("names a setting by its title, a file by its last segment, a link without its scheme", () => {
    expect(nameOf({ what: { kind: "file", ref: "a/b/c.ts", title: "  the entry  " } })).toBe(
      "the entry",
    );
    expect(nameOf({ what: { kind: "file", ref: "a\\b\\c.ts" } })).toBe("c.ts");
    expect(nameOf({ what: { kind: "url", ref: "https://example.com/run/7/" } })).toBe(
      "example.com/run/7",
    );
    expect(nameOf({ what: { kind: "note", ref: "first line\nsecond" } })).toBe("first line");
    const long = nameOf({ what: { kind: "note", ref: "x".repeat(80) } });
    expect(long).toHaveLength(40);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("the trail view", () => {
  it("orders by lineage, newest branch first at every level", () => {
    expect(trailOrderOf(inquiry)).toEqual([
      { id: "d", level: 0, parent: null },
      { id: "n", level: 1, parent: "d" },
      { id: "f", level: 1, parent: "d" },
      { id: "t", level: 2, parent: "f" },
    ]);
    const second = aSetting({ id: "z", what: { kind: "note", ref: "another" }, at: at(1) });
    expect(trailOrderOf(grown([diff, file, test, note, second])).map((row) => row.id)).toEqual([
      "d",
      "n",
      "f",
      "t",
      "z",
    ]);
  });

  it("shows a folded part as its seed's one plot card, beside what stands", () => {
    const inner = foldPlot(inquiry, "f");
    expect(trailOrderOf(inner)).toEqual([
      { id: "d", level: 0, parent: null },
      { id: "n", level: 1, parent: "d" },
      { id: "plot:d", level: 1, parent: "d" },
    ]);
    expect(trailOrderOf(foldPlot(inner, "d"))).toEqual([{ id: "plot:d", level: 0, parent: null }]);
  });

  it("keeps to one owner's settings when asked", () => {
    const vey = aSetting({ id: "v", creature: "vey", what: { kind: "note", ref: "vey's" } });
    const rows = trailOrderOf(grown([diff, vey]), { kind: "creature", slug: "vey" });
    expect(rows).toEqual([{ id: "v", level: 0, parent: null }]);
  });
});

describe("a departed ancestor", () => {
  const leaving = (outcome: "seen" | "dismissed") =>
    grown([diff, file, test], [settled(9, at(5), "s1", { id: "d", outcome, by: "keeper" })]);

  it("is kept for the trail while settings still descend from it", () => {
    const seen = leaving("seen");
    expect(seen.settings.d).toBeUndefined();
    expect(seen.ancestors?.d).toMatchObject({ id: "d", what: diff.what });
    expect(trailOf(seen, "t")).toEqual(["d", "f", "t"]);
    expect(chainOf(seen, "t")).toBe("the fix → place.ts → place.test.ts");
  });

  it("leaves its plot standing when the keeper has seen it, and folds it when they dismiss it", () => {
    const seen = leaving("seen");
    expect(seen.settings.f?.folded).toBeUndefined();
    expect(trailOrderOf(seen)).toEqual([
      { id: "f", level: 0, parent: null },
      { id: "t", level: 1, parent: "f" },
    ]);
    const dismissed = leaving("dismissed");
    expect(dismissed.settings.f?.folded).toBe("plot:d");
    expect(trailOrderOf(dismissed)).toEqual([{ id: "plot:d", level: 0, parent: null }]);
  });

  it("is forgotten once nothing descends from it", () => {
    const gone = yardOf(
      projectAll({ ...emptyHabitat(), yard: leaving("dismissed") }, [
        settled(10, at(6), "s1", { id: "f", outcome: "dismissed", by: "keeper" }),
        settled(11, at(7), "s1", { id: "t", outcome: "withdrawn", by: "time" }),
      ]),
    );
    expect(gone.ancestors).toBeUndefined();
    expect(gone.settings).toEqual({});
  });
});

describe("a creature showing its seed again", () => {
  const withdrawn = settled(9, at(5), "s1", { id: "d", outcome: "withdrawn", by: "creature" });
  const again = (overrides: Partial<Setting>): Setting =>
    aSetting({ ...diff, id: "d2", at: at(6), ...overrides });

  it("brings back what its withdrawal folded and hangs it from the setting that replaces it", () => {
    const withdrawnOnly = grown([diff, file, test], [withdrawn]);
    expect(withdrawnOnly.settings.f?.folded).toBe("plot:d");
    const yard = grown([diff, file, test], [withdrawn, proposed(10, again({ replaces: "d" }))]);
    expect(yard.settings.f).toMatchObject({ from: "d2" });
    expect(yard.settings.f?.folded).toBeUndefined();
    expect(yard.settings.t?.folded).toBeUndefined();
    expect(yard.ancestors).toBeUndefined();
    expect(trailOf(yard, "t")).toEqual(["d2", "f", "t"]);
  });

  it("reads an older engine's withdraw and show of the same thing as one node", () => {
    const yard = grown([diff, file], [withdrawn, proposed(10, again({}))]);
    expect(yard.settings.f?.from).toBe("d2");
  });

  it("takes an explicit null as no predecessor, and a keeper's dismissal as no replacement", () => {
    const explicit = grown([diff, file], [withdrawn, proposed(10, again({ replaces: null }))]);
    expect(explicit.settings.f).toMatchObject({ from: "d", folded: "plot:d" });
    const dismissed = settled(9, at(5), "s1", { id: "d", outcome: "dismissed", by: "keeper" });
    expect(grown([diff, file], [dismissed, proposed(10, again({}))]).settings.f?.from).toBe("d");
  });
});

const forestArb = fc
  .array(fc.record({ parent: fc.nat(), rooted: fc.boolean() }), { minLength: 1, maxLength: 14 })
  .chain((shapes) =>
    fc.record({
      settings: fc.constant(
        shapes.map(({ parent, rooted }, index) =>
          aSetting({
            id: `s${index}`,
            from: rooted || index === 0 ? null : `s${parent % index}`,
            what: { kind: "note", ref: `note ${index}` },
            at: at(index),
          }),
        ),
      ),
      order: fc.shuffledSubarray(
        shapes.map((_, index) => index),
        { minLength: shapes.length, maxLength: shapes.length },
      ),
    }),
  );

describe("lineage, for any forest of settings", () => {
  it("walks every trail from a root to the setting through parents", () => {
    fc.assert(
      fc.property(forestArb, ({ settings }) => {
        const yard = grown(settings);
        for (const setting of settings) {
          const trail = trailOf(yard, setting.id);
          expect(trail.at(-1)).toBe(setting.id);
          expect(parentOf(yard, trail[0] ?? "")).toBeUndefined();
          for (const [index, id] of trail.slice(1).entries()) {
            expect(parentOf(yard, id)).toBe(trail[index]);
          }
          const plot = plotOf(yard, setting.id);
          expect(plot[0]).toBe(setting.id);
          for (const member of plot) expect(trailOf(yard, member)).toContain(setting.id);
        }
      }),
    );
  });

  it("answers the same whatever order the settings arrived in", () => {
    fc.assert(
      fc.property(forestArb, ({ settings, order }) => {
        const yard = grown(settings);
        const shuffled = grown(order.flatMap((index) => settings[index] ?? []));
        expect(trailOrderOf(shuffled)).toEqual(trailOrderOf(yard));
        for (const setting of settings) {
          expect(plotOf(shuffled, setting.id)).toEqual(plotOf(yard, setting.id));
          expect(chainOf(shuffled, setting.id)).toBe(chainOf(yard, setting.id));
        }
      }),
    );
  });

  it("lists every setting on the trail view once, each below its parent", () => {
    fc.assert(
      fc.property(forestArb, ({ settings }) => {
        const rows = trailOrderOf(grown(settings));
        expect(rows.map((row) => row.id).toSorted()).toEqual(settings.map((s) => s.id).toSorted());
        for (const [index, row] of rows.entries()) {
          const above = rows.findIndex((other) => other.id === row.parent);
          expect(above).toBeLessThan(index);
          expect(row.level).toBe(row.parent === null ? 0 : (rows[above]?.level ?? -1) + 1);
        }
      }),
    );
  });
});
