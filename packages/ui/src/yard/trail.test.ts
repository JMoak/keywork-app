import { emptyYard, type YardSetting, type YardState } from "@keywork-app/habitat";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { aYardSetting } from "./testing.ts";
import { stepAlong, yardLineageOf } from "./trail.ts";

describe("the lineage the console walks", () => {
  const yard = yardOf([
    grown("diff", "session-1", 1, { what: { kind: "diff", ref: "c1", title: "the sum change" } }),
    grown("file", "diff", 2, { what: { kind: "file", ref: "src/sum.ts" } }),
    grown("test", "file", 3, { what: { kind: "file", ref: "src/sum.test.ts" } }),
    grown("older", "diff", 0, { what: { kind: "url", ref: "https://example.com" } }),
    grown("dismissed", "diff", 4, { state: "dismissed" }),
  ]);
  const lineage = yardLineageOf(() => yard);

  it("goes rootward to the parent panel, then to the conversation the seed grew from", () => {
    expect(stepAlong(lineage, "test", "rootward")).toBe("file");
    expect(stepAlong(lineage, "file", "rootward")).toBe("diff");
    expect(stepAlong(lineage, "diff", "rootward")).toBe("session-1");
    expect(stepAlong(lineage, "session-1", "rootward")).toBeUndefined();
  });

  it("goes leafward to the newest child still out, from a panel or from the conversation", () => {
    expect(stepAlong(lineage, "session-1", "leafward")).toBe("diff");
    expect(stepAlong(lineage, "diff", "leafward")).toBe("file");
    expect(stepAlong(lineage, "test", "leafward")).toBeUndefined();
    expect(lineage.childrenOf("diff")).toEqual(["file", "older"]);
  });

  it("goes leafward back to the child the keeper came from, while that child is still out", () => {
    const cameFrom = (id: string) => (id === "diff" ? "older" : id === "file" ? "gone" : undefined);
    expect(stepAlong(lineage, "diff", "leafward", cameFrom)).toBe("older");
    expect(stepAlong(lineage, "file", "leafward", cameFrom)).toBe("test");
  });

  it("names the chain through the focused node and orders the trail by its branches", () => {
    expect(lineage.chainOf("file")).toBe("the sum change → sum.ts");
    expect(lineage.chainOf("test")).toBe("the sum change → sum.ts → sum.test.ts");
    expect(lineage.trailOrder().map((row) => `${row.id} ${row.level}`)).toEqual([
      "diff 0",
      "file 1",
      "test 2",
      "older 1",
    ]);
  });

  it("walks past a parent folded into a plot or settled out of the yard", () => {
    const folded = yardOf([
      grown("diff", "session-1", 1, { folded: "plot:diff" }),
      grown("file", "diff", 2),
      grown("test", "file", 3),
    ]);
    const walking = yardLineageOf(() => folded);
    expect(stepAlong(walking, "test", "rootward")).toBe("file");
    expect(stepAlong(walking, "file", "rootward")).toBe("session-1");
  });
});

describe("walking any trail", () => {
  it("steps rootward to the nearest ancestor still out, else to the conversation the trail grew from", () => {
    fc.assert(
      fc.property(forestArb, (forest) => {
        const lineage = yardLineageOf(() => yardOfForest(forest));
        for (const id of shownIn(forest)) {
          expect(stepAlong(lineage, id, "rootward")).toBe(nearestOutAbove(forest, id));
        }
      }),
    );
  });

  it("steps leafward to the newest node whose nearest ancestor still out is this one", () => {
    fc.assert(
      fc.property(forestArb, (forest) => {
        const lineage = yardLineageOf(() => yardOfForest(forest));
        for (const id of [...sessions, ...shownIn(forest)]) {
          expect(stepAlong(lineage, id, "leafward")).toBe(newestOutBelow(forest, id));
        }
      }),
    );
  });

  it("walks back leafward to the node it stepped rootward from, past anything folded or settled between", () => {
    fc.assert(
      fc.property(forestArb, (forest) => {
        const lineage = yardLineageOf(() => yardOfForest(forest));
        for (const id of shownIn(forest)) {
          const above = stepAlong(lineage, id, "rootward");
          if (above === undefined) continue;
          const cameFrom = (at: string) => (at === above ? id : undefined);
          expect(stepAlong(lineage, above, "leafward", cameFrom)).toBe(id);
        }
      }),
    );
  });
});

const sessions = ["session-a", "session-b"] as const;

type Standing = "live" | "pinned" | "folded" | "dismissed" | "settled";

interface TrailNode {
  readonly id: string;
  readonly from: string;
  readonly minute: number;
  readonly standing: Standing;
}

const forestArb: fc.Arbitrary<readonly TrailNode[]> = fc
  .array(
    fc.record({
      parent: fc.option(fc.nat(), { nil: undefined }),
      session: fc.constantFrom(...sessions),
      minute: fc.integer({ min: 0, max: 5 }),
      standing: fc.constantFrom<Standing>(
        "live",
        "live",
        "pinned",
        "folded",
        "dismissed",
        "settled",
      ),
    }),
    { minLength: 1, maxLength: 9 },
  )
  .map((drawn) =>
    drawn.map(({ parent, session, minute, standing }, index) => ({
      id: `n${index}`,
      from: parent === undefined || index === 0 ? session : `n${parent % index}`,
      minute,
      standing,
    })),
  );

function yardOfForest(forest: readonly TrailNode[]): YardState {
  const settled = (node: TrailNode): boolean => node.standing === "settled";
  return {
    ...yardOf(forest.filter((node) => !settled(node)).map(forestSetting)),
    ancestors: Object.fromEntries(
      forest.filter(settled).map((node) => [node.id, forestSetting(node)]),
    ),
  };
}

function forestSetting(node: TrailNode): YardSetting {
  const standing: Record<Standing, Partial<YardSetting>> = {
    live: {},
    pinned: { state: "pinned" },
    folded: { folded: `plot:${node.id}` },
    dismissed: { state: "dismissed" },
    settled: {},
  };
  return grown(node.id, node.from, node.minute, standing[node.standing]);
}

function shownIn(forest: readonly TrailNode[]): string[] {
  return forest.filter(isOut).map((node) => node.id);
}

function isOut(node: TrailNode): boolean {
  return node.standing === "live" || node.standing === "pinned";
}

function nearestOutAbove(forest: readonly TrailNode[], id: string): string | undefined {
  const byId = new Map(forest.map((node) => [node.id, node]));
  let at = byId.get(id);
  for (let above = byId.get(at?.from ?? ""); above !== undefined; above = byId.get(above.from)) {
    if (isOut(above)) return above.id;
    at = above;
  }
  return at?.from;
}

function newestOutBelow(forest: readonly TrailNode[], id: string): string | undefined {
  return forest
    .filter((node) => isOut(node) && nearestOutAbove(forest, node.id) === id)
    .toSorted((a, b) => b.minute - a.minute || (a.id < b.id ? 1 : -1))[0]?.id;
}

function grown(
  id: string,
  from: string | null,
  minute: number,
  overrides: Partial<YardSetting> = {},
): YardSetting {
  const at = new Date(Date.UTC(2026, 10, 8, 9, minute)).toISOString();
  return aYardSetting({ id, from, origin: "keeper", at, shown: "unfold", ...overrides });
}

function yardOf(settings: readonly YardSetting[]): YardState {
  return {
    ...emptyYard,
    settings: Object.fromEntries(settings.map((setting) => [setting.id, setting])),
  };
}
