import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  candidateClausesOf,
  decisionQuestions,
  driftVerdicts,
  entryDurabilities,
  fallbackReasons,
  isRecallSelection,
  mentionVerdicts,
  pairRelations,
} from "./decisions.ts";

const vocabularyDoc = new URL("./fixtures/events.md", import.meta.url);

async function decisionTableRow(field: string): Promise<string> {
  const doc = await readFile(vocabularyDoc, "utf8");
  const section = doc.slice(doc.indexOf("## Memory decisions"));
  return section.split("\n").find((line) => line.startsWith(`| \`${field}\` |`)) ?? "";
}

describe("the builtin's rule in words", () => {
  it("speaks once per candidate, so each note keeps its own clause", () => {
    const clauses = candidateClausesOf(
      '[[Auth Tokens]] shares "auth", "token" with the path; [[Old Auth]] is superseded',
    );
    expect([...clauses]).toEqual([
      ["Auth Tokens", 'shares "auth", "token" with the path'],
      ["Old Auth", "is superseded"],
    ]);
  });

  it("finds no candidate clause in a pair's or a drift's rule, nor in no rule at all", () => {
    expect(candidateClausesOf("jaccard 0.41 · judged by closing:anthropic").size).toBe(0);
    expect(candidateClausesOf(undefined).size).toBe(0);
  });
});

describe("a decision's choice", () => {
  it("is a selection for recall and one option name for every other question", () => {
    expect(isRecallSelection({ kept: ["A"], dropped: [] })).toBe(true);
    expect(isRecallSelection("unsure")).toBe(false);
  });
});

describe("the decision vocabulary", () => {
  it("names every question keywork's docs/events.md catalogs", async () => {
    const row = await decisionTableRow("question");
    for (const question of Object.values(decisionQuestions)) expect(row).toContain(question);
  });

  it("names every option keywork's docs/events.md lists for a choice", async () => {
    const row = await decisionTableRow("choice");
    const options = [...entryDurabilities, ...pairRelations, ...driftVerdicts, ...mentionVerdicts];
    for (const option of options) expect(row).toContain(`\`${option}\``);
  });

  it("names every fallback reason keywork's docs/events.md gives", async () => {
    const row = await decisionTableRow("fallback");
    for (const reason of fallbackReasons) expect(row).toContain(`\`${reason}\``);
  });
});
