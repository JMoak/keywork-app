import { describe, expect, it } from "vitest";
import { createPaneMarks } from "./marks.ts";

describe("createPaneMarks", () => {
  it("toggles panes in and out of the marked set, in marking order", () => {
    const marks = createPaneMarks();
    marks.toggle("b");
    marks.toggle("a");
    expect(marks.all()).toEqual(["b", "a"]);
    expect(marks.has("a")).toBe(true);
    marks.toggle("b");
    expect(marks.all()).toEqual(["a"]);
    expect(marks.has("b")).toBe(false);
  });

  it("forgets a marked pane once it closes", () => {
    const open = new Set(["a", "b"]);
    const marks = createPaneMarks((id) => open.has(id));
    marks.toggle("a");
    marks.toggle("b");
    open.delete("a");
    expect(marks.all()).toEqual(["b"]);
    expect(marks.has("a")).toBe(false);
  });
});
