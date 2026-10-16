import { emptyProjection, projectAll } from "@keywork-app/client";
import type { MemoryDecision, StagedItem } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import decided from "../../../../client/src/fixtures/decided.jsonl?raw";
import { parseJsonl } from "../../dev/replay.ts";
import { decisionRows, triageOdds } from "./decisions.ts";

const recorded = projectAll(emptyProjection, parseJsonl(decided));

const jevRecall: MemoryDecision = {
  id: "j1",
  question: "action-relevance@1",
  about: { kind: "call", callId: "e1" },
  candidates: ["Auth Tokens", "Old Auth", "Token Rotation"],
  choice: { kept: ["Auth Tokens"], dropped: ["Old Auth", "Token Rotation"] },
  scores: { "Auth Tokens": 0.94, "Old Auth": 0.03, "Token Rotation": 0.41 },
  decider: "jev",
  model: "jev-1.13.0",
  latencyMs: 212,
};

const lateRecall: MemoryDecision = {
  ...jevRecall,
  id: "j2",
  choice: { kept: ["Auth Tokens", "Token Rotation"], dropped: ["Old Auth"] },
  decider: "builtin",
  scores: {},
  rule: '[[Auth Tokens]] shares "auth" with the path; [[Old Auth]] is superseded; [[Token Rotation]] shares "token" with the path',
  fallback: { reason: "late" },
  latencyMs: 151,
};

const triage: MemoryDecision = {
  id: "t1",
  question: "entry-durability@1",
  about: { kind: "entry", entryId: "2026-10-15#3" },
  candidates: ["2026-10-15#3"],
  choice: "new-durable",
  confidence: 0.93,
  scores: { "new-durable": 0.93, episodic: 0.04 },
  decider: "jev",
  latencyMs: 98,
};

const builtinTriage: MemoryDecision = {
  ...triage,
  id: "t2",
  choice: "unsure",
  decider: "builtin",
  rule: "every trusted entry within the sweep budget goes to the distiller",
  latencyMs: 0,
};

function row(decision: MemoryDecision) {
  const [only] = decisionRows([decision], []);
  if (only === undefined) throw new Error("no row");
  return only;
}

describe("the decisions lens rows", () => {
  it("lists the recorded session's recall decisions newest first, in the facts grammar", () => {
    const rows = decisionRows(recorded.memoryDecisions, recorded.entries);
    expect(rows.map((item) => [item.asked, item.facts])).toEqual([
      ["recall before write src/layout/rects.test.ts", ["kept 0 of 1", "builtin", "0ms"]],
      ["recall before write src/layout/rects.ts", ["kept 1 of 1", "builtin", "0ms"]],
    ]);
    expect(rows[0]?.candidates).toEqual([
      { name: "[[Layout Rects]]", verdict: "dropped", odds: undefined },
    ]);
    expect(rows[0]?.rule).toBe("[[Layout Rects]] was already surfaced");
    expect(rows[1]?.mark.label).toBe("by rule");
  });

  it("inks a decisive answer full and gives the decider's odds as a fact", () => {
    const decisive = row(jevRecall);
    expect(decisive.facts).toEqual(["kept 1 of 3", "jev 0.94", "212ms"]);
    expect(decisive.mark).toEqual({ cell: { glyph: "█", level: "full" }, label: "odds 0.94" });
    expect(decisive.candidates.map((line) => [line.name, line.verdict, line.odds])).toEqual([
      ["[[Auth Tokens]]", "kept", "0.94"],
      ["[[Old Auth]]", "dropped", "0.03"],
      ["[[Token Rotation]]", "dropped", "0.41"],
    ]);
  });

  it("inks an undecided answer dim", () => {
    const undecided = row({ ...jevRecall, confidence: 0.12 });
    expect(undecided.mark).toEqual({ cell: { glyph: "░", level: "light" }, label: "odds 0.12" });
    expect(row(builtinTriage).mark).toEqual({
      cell: { glyph: "░", level: "light" },
      label: "unsure",
    });
  });

  it("names a fallback and keeps the builtin's rule in words for the fold", () => {
    const fellBack = row(lateRecall);
    expect(fellBack.facts).toEqual(["kept 2 of 3", "builtin", "fallback late", "151ms"]);
    expect(fellBack.rule).toContain("[[Old Auth]] is superseded");
    expect(fellBack.candidates.map((line) => line.verdict)).toEqual(["kept", "dropped", "kept"]);
  });

  it("asks each question in words, from what the decision was about", () => {
    const about = (decision: Partial<MemoryDecision>) => row({ ...triage, ...decision }).asked;
    expect(row(triage).asked).toBe("triage entry 2026-10-15#3");
    expect(about({ question: "entry-kind@1" })).toBe("kind of entry 2026-10-15#3");
    expect(about({ about: { kind: "pair", older: "Old Auth", newer: "Auth Tokens" } })).toBe(
      "relate [[Old Auth]] and [[Auth Tokens]]",
    );
    expect(about({ about: { kind: "note", note: "Auth Tokens" } })).toBe(
      "does [[Auth Tokens]] still hold",
    );
    expect(about({ about: { kind: "mention", note: "Setup", target: "Bun" } })).toBe(
      "link [[Setup]] to [[Bun]]",
    );
    expect(about({ about: { kind: "query", query: "auth" } })).toBe('weigh hits for "auth"');
    expect(row(jevRecall).asked).toBe("recall before call e1");
  });

  it("reads an option choice in words and names entries without note brackets", () => {
    const relation = row({ ...triage, choice: "newer-supersedes-older" });
    expect(relation.facts[0]).toBe("newer supersedes older");
    expect(row(triage).candidates).toEqual([
      { name: "2026-10-15#3", verdict: "offered", odds: undefined },
    ]);
  });
});

describe("odds on an inbox card", () => {
  const promotion: StagedItem = {
    id: "p1",
    key: "k",
    created: "2026-10-15T12:00:00.000Z",
    kind: "borderline-promotion",
    title: "Auth Tokens Rotate",
    body: "body",
    confidence: 0.7,
    source: "2026-10-15#3",
  };

  it("shows the durability choice and the decider's odds for the entry it was promoted from", () => {
    expect(triageOdds(promotion, { "2026-10-15#3": triage })).toBe("new durable · jev 0.93");
  });

  it("renders nothing for the builtin's unsure, which is every entry the builtin triages", () => {
    expect(triageOdds(promotion, { "2026-10-15#3": builtinTriage })).toBeUndefined();
    expect(triageOdds(promotion, {})).toBeUndefined();
  });

  it("has no odds for a card no entry decision is about", () => {
    const merge: StagedItem = {
      id: "m1",
      key: "k",
      created: "2026-10-15T12:00:00.000Z",
      kind: "merge-proposal",
      keep: "A",
      retire: "B",
      confidence: 0.9,
    };
    expect(triageOdds(merge, { "2026-10-15#3": triage })).toBeUndefined();
  });
});
