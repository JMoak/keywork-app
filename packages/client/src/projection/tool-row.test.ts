import { describe, expect, it } from "vitest";
import { lineBreakMark, toolRowSpans, toolSubject } from "./tool-row.ts";
import type { ToolRun } from "./types.ts";

describe("a tool's subject", () => {
  it("never flattens a multi-line command into what reads as one harmless line", () => {
    expect(toolSubject({ command: "echo ok\nmkdir pwned-dir" })).toBe(
      `echo ok ${lineBreakMark} mkdir pwned-dir`,
    );
    expect(toolSubject({ command: "  git   status  " })).toBe("git status");
  });

  it("names what a show call shows, not the rung it shows it at", () => {
    expect(toolSubject({ what: { kind: "note", ref: "N1" }, rung: "unfold" })).toBe("note · N1");
    expect(
      toolSubject({ what: { kind: "diff", ref: "d7", title: "the math change" }, rung: "card" }),
    ).toBe("diff · the math change");
  });

  it("cuts a long subject visibly", () => {
    const subject = toolSubject({ command: "x".repeat(200) });
    expect(subject).toHaveLength(60);
    expect(subject.endsWith("…")).toBe(true);
  });
});

describe("an asking row", () => {
  it("says how many of the turn's calls wait behind the one asking", () => {
    const run = { name: "write", subject: "a.txt", phase: "asking" } as ToolRun;
    const said = (queuedBehind: number) =>
      toolRowSpans(run, { queuedBehind })
        .map((span) => span.text)
        .join("");
    expect(said(0)).toBe("write a.txt · waiting for your answer");
    expect(said(1)).toBe("write a.txt · waiting for your answer · 1 more call waits behind it");
    expect(said(2)).toBe("write a.txt · waiting for your answer · 2 more calls wait behind it");
  });
});
