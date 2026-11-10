import { operationIds } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { operationOfCampaignMethod, operationOfMethod } from "./operations.ts";

const sharedByDesign = new Set<string>(["promptSession"]);

describe("the client's methods", () => {
  it("reach every operation the protocol knows and name none it does not", () => {
    const reached = new Set([
      ...Object.values(operationOfMethod),
      ...Object.values(operationOfCampaignMethod),
    ]);
    expect([...reached].sort()).toEqual([...operationIds].sort());
  });

  it("reach each operation through one method, except prompt and sendNow, which both prompt a session", () => {
    const methods = [
      ...Object.entries(operationOfMethod),
      ...Object.entries(operationOfCampaignMethod).map(
        ([method, operation]) => [`campaign.${method}`, operation] as const,
      ),
    ];
    const unshared = methods.flatMap(([, operation]) =>
      sharedByDesign.has(operation) ? [] : [operation],
    );
    expect(new Set(unshared).size).toBe(unshared.length);
    const prompting = methods.flatMap(([method, operation]) =>
      operation === "promptSession" ? [method] : [],
    );
    expect(prompting.sort()).toEqual(["prompt", "sendNow"]);
  });
});
