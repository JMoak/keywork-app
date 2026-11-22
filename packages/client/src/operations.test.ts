import { operationIds } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { operationOfCampaignMethod, operationOfMethod } from "./operations.ts";

describe("the client's methods", () => {
  it("reach every operation the protocol knows and name none it does not", () => {
    const reached = new Set([
      ...Object.values(operationOfMethod),
      ...Object.values(operationOfCampaignMethod),
    ]);
    expect([...reached].sort()).toEqual([...operationIds].sort());
  });
});
