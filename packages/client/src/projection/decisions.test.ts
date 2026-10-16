import type { MemoryDecision } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { candidateReasons, decisionOdds, recallText, withDecision } from "./decisions.ts";

const byRule: MemoryDecision = {
  id: "m1",
  question: "action-relevance@1",
  about: { kind: "call", callId: "c1" },
  candidates: ["Auth Tokens", "Old Auth", "Token Rotation"],
  choice: { kept: ["Auth Tokens", "Token Rotation"], dropped: ["Old Auth"] },
  decider: "builtin",
  rule: '[[Auth Tokens]] shares "auth" with the path; [[Old Auth]] is superseded; [[Token Rotation]] shares "token" with the path',
  latencyMs: 3,
};

const { rule: _spoken, ...unexplained } = byRule;

const byOdds: MemoryDecision = {
  ...unexplained,
  id: "m2",
  choice: { kept: ["Auth Tokens"], dropped: ["Old Auth", "Token Rotation"] },
  scores: { "Auth Tokens": 0.94, "Old Auth": 0.04, "Token Rotation": 0.08 },
  decider: "jev",
  model: "jev-1.13.0",
  latencyMs: 212,
};

describe("why a note was recalled", () => {
  it("names each kept note with the builtin's own clause for it", () => {
    expect(recallText(byRule)).toBe(
      'recalled [[Auth Tokens]] · shares "auth" with the path; [[Token Rotation]] · shares "token" with the path',
    );
  });

  it("gives the decider's odds when the note was scored", () => {
    expect(recallText(byOdds)).toBe("recalled [[Auth Tokens]] · jev 0.94");
  });

  it("says nothing when the decision kept no note or chose an option", () => {
    expect(recallText({ ...byRule, choice: { kept: [], dropped: ["Old Auth"] } })).toBeUndefined();
    expect(recallText({ ...byRule, choice: "unsure" })).toBeUndefined();
  });

  it("names a kept note bare when nothing says why", () => {
    expect(recallText(unexplained)).toBe("recalled [[Auth Tokens]]; [[Token Rotation]]");
  });

  it("reasons for every candidate, odds first and the rule's clause otherwise", () => {
    expect([...candidateReasons(byOdds)]).toEqual([
      ["Auth Tokens", "jev 0.94"],
      ["Old Auth", "jev 0.04"],
      ["Token Rotation", "jev 0.08"],
    ]);
    expect(candidateReasons(byRule).get("Old Auth")).toBe("is superseded");
  });
});

describe("a decision's odds", () => {
  it("takes the decider's confidence first, else the weakest kept note's score", () => {
    expect(decisionOdds({ ...byOdds, confidence: 0.88 })).toBe(0.88);
    expect(
      decisionOdds({ ...byOdds, choice: { kept: ["Auth Tokens", "Token Rotation"], dropped: [] } }),
    ).toBe(0.08);
  });

  it("reads the chosen option's own score, and has none for a rule", () => {
    const relation: MemoryDecision = {
      ...unexplained,
      question: "pair-relation@1",
      choice: "distinct",
      scores: { distinct: 0.81, duplicate: 0.11 },
    };
    expect(decisionOdds(relation)).toBe(0.81);
    expect(decisionOdds(byRule)).toBeUndefined();
  });
});

describe("the session's decision record", () => {
  it("appends a new decision and replaces one it already holds by id", () => {
    const once = withDecision([], byRule);
    const twice = withDecision(once, byOdds);
    expect(twice.map((decision) => decision.id)).toEqual(["m1", "m2"]);
    expect(withDecision(twice, { ...byRule, latencyMs: 9 })[0]?.latencyMs).toBe(9);
  });
});
