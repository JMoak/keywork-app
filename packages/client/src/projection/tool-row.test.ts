import { describe, expect, it } from "vitest";
import { lineBreakMark, toolSubject } from "./tool-row.ts";

describe("a tool's subject", () => {
  it("never flattens a multi-line command into what reads as one harmless line", () => {
    expect(toolSubject({ command: "echo ok\nmkdir pwned-dir" })).toBe(
      `echo ok ${lineBreakMark} mkdir pwned-dir`,
    );
    expect(toolSubject({ command: "  git   status  " })).toBe("git status");
  });

  it("cuts a long subject visibly", () => {
    const subject = toolSubject({ command: "x".repeat(200) });
    expect(subject).toHaveLength(60);
    expect(subject.endsWith("…")).toBe(true);
  });
});
