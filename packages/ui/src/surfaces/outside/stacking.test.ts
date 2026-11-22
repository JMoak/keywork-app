import { describe, expect, it } from "vitest";
import { leastRecentFirst, lowered, raised, slippedUnder } from "./stacking.ts";

describe("the order panes outside stand in, bottom to top", () => {
  it("raises a pane to the top, whether or not it was standing", () => {
    expect(raised(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
    expect(raised(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(raised(["a", "b"], "b")).toEqual(["a", "b"]);
  });

  it("sends a pane behind every other", () => {
    expect(lowered(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(lowered(["a", "b"], "c")).toEqual(["c", "a", "b"]);
  });

  it("slips an arrival under the pane the keeper is in, and on top when the keeper is elsewhere", () => {
    expect(slippedUnder(["a", "b", "c"], "new", "c")).toEqual(["a", "b", "new", "c"]);
    expect(slippedUnder(["a", "b", "c"], "new", "a")).toEqual(["new", "a", "b", "c"]);
    expect(slippedUnder(["a", "b"], "new", undefined)).toEqual(["a", "b", "new"]);
    expect(slippedUnder(["a", "b"], "new", "gone")).toEqual(["a", "b", "new"]);
    expect(slippedUnder(["a", "b", "c"], "a", "c")).toEqual(["b", "a", "c"]);
  });

  it("orders panes for a restore so the most recently used lands on top", () => {
    expect(leastRecentFirst(["a", "b", "c", "d"], ["c", "a"])).toEqual(["b", "d", "a", "c"]);
    expect(leastRecentFirst(["a", "b"], [])).toEqual(["a", "b"]);
  });
});
