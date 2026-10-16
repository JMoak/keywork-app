import { emptyUsage, type UsageLedger } from "@keywork-app/client";
import type { ContextReport } from "@keywork-app/protocol";
import { cleanup, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import recordedAnswers from "../../../client/src/fixtures/controls.json";
import { densityLevels } from "../theme/sections.ts";
import {
  assumedContextLevel,
  assumedContextWindow,
  barCells,
  contextLevelOf,
  contextLevelOfReport,
  gaugeCells,
  gaugeCount,
  gaugeHover,
  gaugeReadout,
  reportedContextLevel,
  sessionContextLevel,
} from "./context.ts";
import { costItem, tokensItem, usageLine } from "./cost.ts";
import { formatCost, formatTokens } from "./format.ts";
import { ContextGauge } from "./gauge.tsx";
import { gaugeStyleFor, instrumentTierOf } from "./tier.ts";

afterEach(cleanup);

function ledger(overrides: Partial<UsageLedger>): UsageLedger {
  return { ...emptyUsage, ...overrides };
}

describe("formatTokens", () => {
  it("mirrors keywork's token rounding at every magnitude", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(9950)).toBe("9.9k");
    expect(formatTokens(9500)).toBe("9.5k");
    expect(formatTokens(12_345)).toBe("12k");
    expect(formatTokens(175_424)).toBe("175k");
    expect(formatTokens(1_200_000)).toBe("1.2M");
    expect(formatTokens(2_000_000)).toBe("2M");
  });
});

describe("formatCost", () => {
  it("keeps two decimals from a dollar up and trims to no fewer than two below", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(0.0031)).toBe("$0.0031");
    expect(formatCost(0.01)).toBe("$0.01");
    expect(formatCost(0.105)).toBe("$0.105");
    expect(formatCost(0.99999)).toBe("$1.00");
    expect(formatCost(1)).toBe("$1.00");
    expect(formatCost(12.345)).toBe("$12.35");
  });
});

describe("the cost item", () => {
  it("is absent before any turn settles", () => {
    expect(costItem(emptyUsage)).toBeUndefined();
    expect(tokensItem(emptyUsage)).toBeUndefined();
    expect(usageLine(emptyUsage)).toBe("");
  });

  it("renders a total only when every turn was priced", () => {
    expect(costItem(ledger({ turns: 3, costUsd: 0.0031 }))).toBe("$0.0031");
    expect(costItem(ledger({ turns: 3, costUsd: 0.0031 }), "metered")).toBe(
      "$0.0031 metered by the provider",
    );
  });

  it("never hides unpriced turns inside a total", () => {
    expect(costItem(ledger({ turns: 3, unpricedTurns: 1, costUsd: 0.5 }))).toBe(
      "$0.50 + 1 unpriced",
    );
    expect(costItem(ledger({ turns: 2, unpricedTurns: 2 }))).toBe("unpriced");
  });

  it("joins tokens and cost into the status line's usage item", () => {
    expect(
      usageLine(ledger({ turns: 1, inputTokens: 12, outputTokens: 5, unpricedTurns: 1 })),
    ).toBe("17 tokens · unpriced");
    expect(
      usageLine(ledger({ turns: 1, inputTokens: 300, outputTokens: 80, costUsd: 0.0031 })),
    ).toBe("380 tokens · $0.0031");
    expect(
      usageLine(ledger({ turns: 4, inputTokens: 40_000, outputTokens: 2000, costUsd: 1.5 })),
    ).toBe("42k tokens · $1.50");
  });
});

describe("the context level", () => {
  it("is absent before any turn and assumes keywork's 200k window afterwards", () => {
    expect(contextLevelOf(emptyUsage)).toBeUndefined();
    const level = contextLevelOf(ledger({ turns: 1, lastTurnContextTokens: 12_345 }));
    expect(level).toEqual({
      used: 12_345,
      window: assumedContextWindow,
      flushAt: 200_000 - 24_576,
      compactAt: 200_000 - 16_384,
      basis: "assumed",
    });
  });

  it("derives the reserves from the window with keywork's caps", () => {
    const small = reportedContextLevel(100, 32_000);
    expect(small.flushAt).toBe(32_000 - 4000);
    expect(small.compactAt).toBe(32_000 - 2666);
    expect(small.basis).toBe("reported");
    expect(reportedContextLevel(-5, 1000).used).toBe(0);
  });

  it("lights the steps gauge zone by zone through the density ramp", () => {
    const glyphs = (used: number) =>
      gaugeCells(assumedContextLevel(used), "steps")
        .map((cell) => cell.glyph)
        .join("");
    expect(glyphs(0)).toBe("····");
    expect(glyphs(1)).toBe("░···");
    expect(glyphs(90_000)).toBe("░▒··");
    expect(glyphs(176_000)).toBe("░▒▓·");
    expect(glyphs(190_000)).toBe("░▒▓█");
    expect(gaugeCells(assumedContextLevel(190_000), "steps").map((cell) => cell.level)).toEqual([
      ...densityLevels,
    ]);
  });

  it("fills the cockpit bar with used cells and marks the reserves beyond them", () => {
    const cells = gaugeCells(assumedContextLevel(50_000), "bar");
    expect(cells).toHaveLength(barCells);
    expect(cells.map((cell) => cell.glyph).join("")).toBe("███░░░░░▒▓");
    expect(
      gaugeCells(assumedContextLevel(0), "bar")
        .map((cell) => cell.glyph)
        .join(""),
    ).toBe("░░░░░░░░▒▓");
  });

  it("says plainly when the window is assumed", () => {
    const assumed = assumedContextLevel(12_345);
    expect(gaugeCount(assumed, "steps")).toBe("12k");
    expect(gaugeCount(assumed, "bar")).toBe("12k/~200k");
    expect(gaugeCount(reportedContextLevel(12_345, 200_000), "bar")).toBe("12k/200k");
    expect(gaugeReadout(assumed)).toContain("window assumed at 200k");
    expect(gaugeReadout(reportedContextLevel(12_345, 200_000))).toContain(
      "window reported at 200k",
    );
  });
});

describe("the instrument tier", () => {
  it("defaults to calm and reads cockpit from the theme's mark on the root", () => {
    expect(instrumentTierOf(undefined)).toBe("calm");
    expect(instrumentTierOf({ dataset: {} as DOMStringMap })).toBe("calm");
    expect(instrumentTierOf({ dataset: { instruments: "cockpit" } as DOMStringMap })).toBe(
      "cockpit",
    );
    expect(gaugeStyleFor("calm")).toBe("steps");
    expect(gaugeStyleFor("cockpit")).toBe("bar");
  });
});

describe("ContextGauge", () => {
  it("renders density cells through tokens, never literals, with the basis on the element", () => {
    const { container } = render(() => <ContextGauge level={assumedContextLevel(90_000)} />);
    const gauge = container.querySelector(".kw-gauge") as HTMLElement;
    expect(gauge.dataset.basis).toBe("assumed");
    expect(gauge.dataset.style).toBe("steps");
    expect(gauge.getAttribute("aria-label")).toContain("window assumed");
    const cells = [...container.querySelectorAll(".kw-gauge-cell")] as HTMLElement[];
    expect(cells.map((cell) => cell.dataset.level)).toEqual(["light", "medium", "empty", "empty"]);
    expect(cells.map((cell) => cell.textContent).join("")).toBe("░▒··");
    expect(container.querySelector(".kw-gauge-count")?.textContent).toBe("90k");
    for (const cell of cells) expect(cell.getAttribute("style")).toBeNull();
  });

  it("hovers the server's parts under the readout, tokens and basis only", () => {
    const report = recordedAnswers.context.body as ContextReport;
    const level = contextLevelOfReport(report);
    if (level === undefined) throw new Error("the recorded reading is empty");
    const { container } = render(() => <ContextGauge level={level} />);
    const gauge = container.querySelector(".kw-gauge") as HTMLElement;
    expect(gauge.getAttribute("aria-label")).toBe(gaugeReadout(level));
    expect(gauge.getAttribute("title")).toBe(gaugeHover(level));
    expect(gaugeHover(level).split("\n")).toEqual([
      gaugeReadout(level),
      "system prompt 137 · tool schemas 1.7k · memory and skills 0 · conversation 13 · free 198k · parts estimated from the text keywork sends",
    ]);
    expect(gaugeHover(assumedContextLevel(90_000))).toBe(gaugeReadout(assumedContextLevel(90_000)));
  });

  it("reads a session from its report, else from the live usage", () => {
    const report = recordedAnswers.context.body as ContextReport;
    const live = ledger({ turns: 1, lastTurnContextTokens: 9_000 });
    expect(sessionContextLevel(report, live)).toEqual(contextLevelOfReport(report));
    expect(sessionContextLevel(undefined, live)).toEqual(contextLevelOf(live));
  });

  it("draws the cockpit bar when asked", () => {
    const { container } = render(() => (
      <ContextGauge level={assumedContextLevel(50_000)} style="bar" />
    ));
    expect(container.querySelectorAll(".kw-gauge-cell")).toHaveLength(barCells);
    expect(container.querySelector(".kw-gauge-count")?.textContent).toBe("50k/~200k");
  });
});
