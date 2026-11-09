import { emptyYard, type YardSetting, type YardState } from "@keywork-app/habitat";
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
