import { describe, expect, it } from "vitest";
import type { ScreenRect } from "../port.ts";
import { hintAlphabet, hintLabels, hintsFor, hintTyped } from "./hints.ts";

const at = (x: number, y: number, width = 400, height = 300): ScreenRect => ({
  x,
  y,
  width,
  height,
});

describe("the letters panes outside wear", () => {
  it("start on the home row and stay one letter for as many panes as the alphabet holds", () => {
    expect(hintLabels(4)).toEqual(["a", "s", "d", "f"]);
    expect(hintLabels(16).join("")).toBe("asdfghjklqwertyu");
    expect(hintLabels(26).join("")).toBe(hintAlphabet);
    expect(hintLabels(0)).toEqual([]);
  });

  it("grow to two letters past the alphabet without one label beginning another", () => {
    for (const count of [27, 51, 52, 120]) {
      const labels = hintLabels(count);
      expect(labels).toHaveLength(count);
      expect(new Set(labels).size).toBe(count);
      const begins = labels.filter((label) =>
        labels.some((other) => other !== label && other.startsWith(label)),
      );
      expect(begins, `${count} panes`).toEqual([]);
    }
    expect(hintLabels(27).slice(0, 9).join("")).toBe("asdfghjkl");
    expect(hintLabels(27).at(-1)).toBe("ms");
  });

  it("read across each row and then down, as the panes stand on the desktop", () => {
    const hints = hintsFor([
      { key: "low-right", bounds: at(900, 420) },
      { key: "top-right", bounds: at(900, 40) },
      { key: "low-left", bounds: at(100, 400) },
      { key: "top-left", bounds: at(100, 60) },
    ]);
    expect([...hints]).toEqual([
      ["top-left", "a"],
      ["top-right", "s"],
      ["low-left", "d"],
      ["low-right", "f"],
    ]);
  });
});

describe("a letter typed while panes wear their letters", () => {
  const hints = new Map([
    ["notes", "a"],
    ["log", "ms"],
    ["diff", "md"],
  ]);

  it("picks the pane that wears exactly what was typed", () => {
    expect(hintTyped(hints, "", "a")).toEqual({ kind: "picked", key: "notes" });
    expect(hintTyped(hints, "m", "d")).toEqual({ kind: "picked", key: "diff" });
  });

  it("narrows to the panes whose letters begin with it", () => {
    expect(hintTyped(hints, "", "m")).toEqual({ kind: "narrowed", typed: "m" });
  });

  it("misses when no pane wears it", () => {
    expect(hintTyped(hints, "", "z")).toEqual({ kind: "missed" });
    expect(hintTyped(hints, "m", "a")).toEqual({ kind: "missed" });
  });
});
