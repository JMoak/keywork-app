import { operationIds } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { operationOfMethod } from "./operations.ts";

describe("the client's methods", () => {
  it("reach every operation the protocol knows, each through exactly one method", () => {
    const reached = Object.values(operationOfMethod);
    expect(new Set(reached).size).toBe(reached.length);
    expect([...reached].sort()).toEqual([...operationIds].sort());
  });
});
