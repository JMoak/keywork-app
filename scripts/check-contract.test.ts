import { readFile } from "node:fs/promises";
import { operationIds } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { contractViolations, docFixture, documentOfFixture } from "./check-contract.ts";

describe("check:contract", () => {
  it("passes against the recorded document", async () => {
    const document = documentOfFixture(await readFile(docFixture, "utf8"));
    expect(document.operationIds).toEqual([...operationIds].sort());
    expect(contractViolations(document)).toEqual([]);
  });

  it("names operations the server dropped and operations the protocol does not know", () => {
    const violations = contractViolations({
      version: "x",
      operationIds: [...operationIds.filter((id) => id !== "abortSession"), "answerAsk"],
    });
    expect(violations).toEqual([
      "the server no longer serves abortSession",
      "the server added answerAsk; the protocol does not know it yet",
    ]);
  });
});
