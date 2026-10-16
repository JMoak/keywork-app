import { describe, expect, it } from "vitest";
import { childAnswerOf, childOutcomes, childProvenanceOf } from "./children.ts";

describe("the delegate result's provenance line", () => {
  it("names the child, its bot and its outcome", () => {
    expect(
      childProvenanceOf("↳ child c-7 · researcher · completed\n\nthree rules allow too much"),
    ).toEqual({ sessionId: "c-7", bot: "researcher", outcome: "completed" });
  });

  it("leaves the bot out when the child ran as none, and the id out when unsaved", () => {
    expect(childProvenanceOf("↳ child c-7 · interrupted\n\nstopped")).toEqual({
      sessionId: "c-7",
      bot: undefined,
      outcome: "interrupted",
    });
    expect(childProvenanceOf("↳ child unsaved · failed\n\nboom")).toEqual({
      sessionId: undefined,
      bot: undefined,
      outcome: "failed",
    });
  });

  it("reads a bot named like an outcome as a bot", () => {
    expect(childProvenanceOf("↳ child c-7 · completed · denied\n\nno")).toEqual({
      sessionId: "c-7",
      bot: "completed",
      outcome: "denied",
    });
  });

  it("refuses anything else, so a refusal before the child existed stays plain", () => {
    expect(childProvenanceOf("no bot named scout · bots here: researcher")).toBeUndefined();
    expect(childProvenanceOf("↳ child c-7 · finished\n\nhm")).toBeUndefined();
    expect(childProvenanceOf("")).toBeUndefined();
  });

  it("hands back the answer without the provenance line", () => {
    expect(childAnswerOf("↳ child c-7 · completed\n\nline one\nline two")).toBe(
      "line one\nline two",
    );
  });

  it("knows the four outcomes the server reports", () => {
    expect(childOutcomes).toEqual(["completed", "interrupted", "failed", "denied"]);
  });
});
