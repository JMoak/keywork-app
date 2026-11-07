import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  brokersLine,
  costWord,
  emptyStateLine,
  headLine,
  limitationLines,
  noWorkshopFor,
  placeLine,
  raisedWord,
  sealStep,
  threadsLead,
  workshopTitle,
} from "./copy.ts";

describe("the workshop's words", () => {
  it("hold no exclamation mark and no emoji in any string", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/ui/src/panes/workshop/copy.ts"),
      "utf8",
    );
    const literals = [...source.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(
      ([, plain, template]) => plain ?? template ?? "",
    );
    expect(literals.length).toBeGreaterThan(10);
    for (const literal of literals) {
      expect(literal, literal).not.toMatch(/!/);
      expect(literal, literal).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("teaches the one next action in two parts and titles the pane by its creature", () => {
    expect(emptyStateLine("r")).toBe("No workshop yet · raise one with r");
    expect(noWorkshopFor("wren", "r")).toBe("No workshop for wren yet · raise one with r");
    expect(workshopTitle(undefined)).toBe("workshop");
    expect(workshopTitle("wren")).toBe("workshop · wren");
  });

  it("says what the room is made of, in what state, and how it answers", () => {
    expect(
      headLine({ substrate: "host", state: "running", health: "up", raised: "2026-11-05 09:00" }),
    ).toBe("bare host · running · up · raised 2026-11-05 09:00");
    expect(
      headLine({ substrate: "sbx", state: "stopped", health: undefined, raised: "yesterday" }),
    ).toBe("sealed microVM · stopped · health unread · raised yesterday");
    expect(
      headLine({ substrate: "sbx", state: "running", health: "unresponsive", raised: "x" }),
    ).toBe("sealed microVM · running · not responding · raised x");
  });

  it("adds the sealing step to a bare host only, after what the node said", () => {
    expect(limitationLines("host", ["a", "b"])).toEqual(["a", "b", sealStep]);
    expect(limitationLines("sbx", ["a"])).toEqual(["a"]);
    expect(sealStep).toContain("install the sbx CLI");
    expect(sealStep).toContain("Windows Hypervisor Platform");
  });

  it("counts threads, places the workshop among its neighbours and names brokers only", () => {
    expect(threadsLead("wren", 0, "t")).toBe("no thread of wren runs in the workshop yet");
    expect(threadsLead("wren", 1, "t")).toBe(
      "1 thread of wren in the workshop · t mirrors the newest bash",
    );
    expect(threadsLead("wren", 3, "t")).toBe(
      "3 threads of wren in the workshop · t mirrors the newest bash",
    );
    expect(placeLine(0, 1, { next: "]", previous: "[" })).toBe("");
    expect(placeLine(1, 3, { next: "]", previous: "[" })).toBe(
      "2 of 3 on this node · ] next · [ previous",
    );
    expect(brokersLine([])).toBe("none · no provider credential is brokered");
    expect(brokersLine(["anthropic", "xai"])).toBe(
      "anthropic, xai · names only; the values stay on the node and the workshop sees sentinels",
    );
  });

  it("prices in USD with two decimals and never rounds a cost to nothing", () => {
    expect(costWord(undefined)).toBe("unknown");
    expect(costWord(0)).toBe("0.00 USD");
    expect(costWord(4_000_000)).toBe("under 0.01 USD");
    expect(costWord(420_000_000)).toBe("0.42 USD");
  });

  it("dates the raising in the house's own clock", () => {
    expect(raisedWord("2026-11-05T09:00:00.000Z", 0)).toBe("2026-11-05 09:00");
    expect(raisedWord("2026-11-05T23:30:00.000Z", 60)).toBe("2026-11-06 00:30");
    expect(raisedWord("not a date", 0)).toBe("an unknown time");
  });
});
