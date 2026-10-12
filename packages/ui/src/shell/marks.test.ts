import { createEffect, createRoot } from "solid-js";
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

  it("clears every mark and tells whoever is watching", () => {
    const marks = createPaneMarks();
    const seen: boolean[] = [];
    const dispose = createRoot((dispose) => {
      createEffect(() => seen.push(marks.has("a")));
      return dispose;
    });
    marks.toggle("a");
    marks.clear();
    expect(marks.all()).toEqual([]);
    expect(seen).toEqual([false, true, false]);
    dispose();
  });
});
