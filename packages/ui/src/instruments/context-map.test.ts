import type { ContextBasis, ContextReport } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import recordedAnswers from "../../../client/src/fixtures/controls.json";
import {
  basisLine,
  fenceRows,
  legendRows,
  mapCells,
  mapColumns,
  mapHead,
  mapReadout,
  partsReadout,
  pastWindowLine,
} from "./context-map.ts";

const recorded = recordedAnswers.context.body as ContextReport;

interface Shape {
  window?: number;
  conversation?: number;
  conversationBasis?: ContextBasis;
  flushAt?: number;
  compactAt?: number;
  declared?: boolean;
}

function report(shape: Shape = {}): ContextReport {
  const window = shape.window ?? 200_000;
  const conversation = shape.conversation ?? 60_000;
  const basis = shape.conversationBasis ?? "estimated";
  const filled = 40_000 + conversation;
  return {
    used: conversation,
    window,
    flushAt: 175_424,
    compactAt: 183_616,
    declared: shape.declared ?? false,
    fullness: conversation / window,
    flushDue: false,
    compactionDue: false,
    basis: "estimated",
    parts: {
      system: { tokens: 10_000, basis: "estimated" },
      tools: { tokens: 20_000, basis: "estimated" },
      injected: { tokens: 10_000, basis: "estimated" },
      conversation: { tokens: conversation, basis },
      free: { tokens: Math.max(0, window - filled), basis },
    },
    thresholds: { flushAt: shape.flushAt ?? 176_000, compactAt: shape.compactAt ?? 184_000 },
  };
}

describe("the context map", () => {
  it("draws one square per percent of a 200k window and per half percent beyond", () => {
    expect(mapColumns(200_000)).toBe(10);
    expect(mapColumns(1_000_000)).toBe(20);
    expect(mapCells(report())).toHaveLength(100);
    expect(mapCells(report({ window: 1_000_000 }))).toHaveLength(200);
  });

  it("fills the parts farthest from you first, the conversation last, then free room", () => {
    const cells = mapCells(report());
    expect(cells.slice(0, 5).every((cell) => cell === "system")).toBe(true);
    expect(cells.slice(5, 15).every((cell) => cell === "tools")).toBe(true);
    expect(cells.slice(15, 20).every((cell) => cell === "injected")).toBe(true);
    expect(cells.slice(20, 50).every((cell) => cell === "conversation")).toBe(true);
    expect(cells[50]).toBe("free");
  });

  it("fences the room past the server's flush and compaction lines on the parts' axis", () => {
    const cells = mapCells(report({ flushAt: 177_289, compactAt: 185_481 }));
    expect(cells[88]).toBe("free");
    expect(cells.slice(89, 93).every((cell) => cell === "flush")).toBe(true);
    expect(cells.slice(93).every((cell) => cell === "compaction")).toBe(true);
  });

  it("draws no fence for a line the window never reaches", () => {
    const cells = mapCells(report({ flushAt: 226_724, compactAt: 234_916 }));
    expect(cells.includes("flush")).toBe(false);
    expect(cells.includes("compaction")).toBe(false);
    expect(cells.at(-1)).toBe("free");
  });

  it("never draws more squares than the window holds", () => {
    const cells = mapCells(report({ conversation: 400_000 }));
    expect(cells).toHaveLength(100);
    expect(cells.at(-1)).toBe("conversation");
  });

  it("legends every part with its tokens and share, then the free room, then the two lines", () => {
    const rows = [...legendRows(report()), ...fenceRows(report())];
    expect(rows.map((row) => [row.label, row.tokens, row.share])).toEqual([
      ["system prompt", "10k", "5%"],
      ["tool schemas", "20k", "10%"],
      ["memory and skills", "10k", "5%"],
      ["conversation", "60k", "30%"],
      ["free", "100k", "50%"],
      ["memory flush", "at 176k", ""],
      ["compaction", "at 184k", ""],
    ]);
  });

  it("reads the recorded server answer, a sliver of a part as less than one percent", () => {
    expect(legendRows(recorded).map((row) => `${row.label} ${row.tokens} ${row.share}`)).toEqual([
      "system prompt 137 <1%",
      "tool schemas 1.7k 1%",
      "memory and skills 0 0%",
      "conversation 13 <1%",
      "free 198k 99%",
    ]);
    expect(mapHead(recorded)).toBe("1.9k of 200k · 1%");
    expect(mapCells(recorded).filter((cell) => cell === "tools")).toHaveLength(1);
    expect(fenceRows(recorded).map((row) => row.tokens)).toEqual(["at 177k", "at 185k"]);
  });

  it("heads with everything the next request carries, not only the conversation", () => {
    expect(mapHead(report())).toBe("100k of 200k · 50%");
    expect(mapHead(report({ window: 1_000_000, conversation: 200_000 }))).toBe("240k of 1M · 24%");
  });

  it("says what the parts rest on and where the window came from", () => {
    expect(basisLine(recorded)).toBe(
      "parts estimated from the text keywork sends · window assumed by the server",
    );
    expect(basisLine(report({ conversationBasis: "reported", declared: true }))).toBe(
      "conversation from the usage the provider reported at the last turn · the rest estimated from the text keywork sends · window declared in keywork.json",
    );
  });

  it("names every reported part when the provider reports more than one", () => {
    const reported = report({ conversationBasis: "reported" });
    const withTools: ContextReport = {
      ...reported,
      parts: { ...reported.parts, tools: { tokens: 20_000, basis: "reported" } },
    };
    expect(basisLine(withTools)).toMatch(
      /^tool schemas and conversation from the usage the provider reported/,
    );
    const everything: ContextReport = {
      ...withTools,
      parts: {
        ...withTools.parts,
        system: { tokens: 10_000, basis: "reported" },
        injected: { tokens: 10_000, basis: "reported" },
      },
    };
    expect(basisLine(everything)).toBe(
      "parts from the usage the provider reported at the last turn · window assumed by the server",
    );
  });

  it("says in one line when a line falls past the window, which is the server's finding", () => {
    expect(pastWindowLine(report())).toBeUndefined();
    expect(pastWindowLine(report({ flushAt: 190_000, compactAt: 201_000 }))).toBe(
      "compaction at 201k · past the window · keywork measures the conversation only",
    );
    expect(pastWindowLine(report({ flushAt: 226_724, compactAt: 234_916 }))).toBe(
      "memory flush at 227k, compaction at 235k · past the window · keywork measures the conversation only",
    );
  });

  it("reads the parts aloud for the grid's label and the gauge's hover", () => {
    expect(partsReadout(recorded.parts)).toBe(
      "system prompt 137 · tool schemas 1.7k · memory and skills 0 · conversation 13 · free 198k · parts estimated from the text keywork sends",
    );
    expect(mapReadout(recorded)).toMatch(/^context 1\.9k of 200k · 1% · system prompt 137/);
  });
});
