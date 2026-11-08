import type { YardRule } from "@keywork-app/habitat";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { createYardRuleBook, storedRules, withRule, yardRulesKey } from "./rules.ts";

afterEach(() => localStorage.clear());

const wrenReports: YardRule = {
  creature: "wren",
  kind: "report",
  rung: "unfold",
  lasts: "while-present",
};

describe("the keeper's yard rules", () => {
  it("are kept with the console's preferences and come back in the next sitting", () => {
    const first = createRoot((dispose) => ({ book: createYardRuleBook(localStorage), dispose }));
    first.book.record(wrenReports);
    first.dispose();

    const next = createRoot((dispose) => ({ book: createYardRuleBook(localStorage), dispose }));
    expect(next.book.rules()).toEqual([wrenReports]);
    next.dispose();
  });

  it("keep one rule per creature, thread, kind and lasting, the newest winning", () => {
    const always: YardRule = { ...wrenReports, lasts: "always" };
    const lantern: YardRule = { ...wrenReports, rung: "lantern" };
    expect(withRule(withRule([wrenReports], always), lantern)).toEqual([always, lantern]);
    const threadRule: YardRule = { ...wrenReports, creature: null, thread: "t1" };
    const otherThread: YardRule = { ...threadRule, thread: "t2" };
    expect(withRule([threadRule], otherThread)).toEqual([threadRule, otherThread]);
  });

  it("read nothing from a stored value they cannot trust", () => {
    localStorage.setItem(yardRulesKey, "{not json");
    expect(storedRules(localStorage)).toEqual([]);
    localStorage.setItem(yardRulesKey, JSON.stringify([{ ...wrenReports, rung: "shout" }]));
    expect(storedRules(localStorage)).toEqual([]);
    expect(storedRules(undefined)).toEqual([]);
  });
});
