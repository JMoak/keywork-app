import type { ConsoleClient } from "@keywork-app/client";
import type { CreatureSummary } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  creaturesListed,
  recordSteadSummoned,
  steadSummonedAt,
  steadSummonStorageKey,
  steadSummonWanted,
} from "./first-frame.ts";

const wren = { slug: "wren", name: "Wren", created: "2026-11-07T09:00:00.000Z" } as CreatureSummary;

describe("the first frame of a workspace", () => {
  it("summons the stead over a saved layout only once, only without it, and only with no creature", () => {
    const due = { steadShowing: false, summonedAt: undefined, creatures: [] };
    expect(steadSummonWanted(due)).toBe(true);
    expect(steadSummonWanted({ ...due, steadShowing: true })).toBe(false);
    expect(steadSummonWanted({ ...due, summonedAt: "2026-11-07T09:00:00.000Z" })).toBe(false);
    expect(steadSummonWanted({ ...due, creatures: [wren] })).toBe(false);
    expect(steadSummonWanted({ ...due, creatures: undefined })).toBe(false);
  });

  it("keeps the record per workspace beside the onboarding record and survives a torn one", () => {
    const storage = memoryStorage();
    const key = steadSummonStorageKey("C:/work");
    expect(key).toBe("keywork.stead-summoned:C:/work");
    expect(steadSummonedAt(storage, key)).toBeUndefined();
    recordSteadSummoned(storage, key, "2026-11-07T09:00:00.000Z");
    expect(steadSummonedAt(storage, key)).toBe("2026-11-07T09:00:00.000Z");
    expect(steadSummonedAt(storage, steadSummonStorageKey("D:/other"))).toBeUndefined();
    storage.setItem(key, "{torn");
    expect(steadSummonedAt(storage, key)).toBeUndefined();
    expect(steadSummonedAt(undefined, key)).toBeUndefined();
  });

  it("reads GET /creatures as a list, and as nothing on a refusal, a throw or a client without it", async () => {
    expect(await creaturesListed(clientAnswering(async () => [wren]))).toEqual([wren]);
    expect(await creaturesListed(clientAnswering(async () => []))).toEqual([]);
    expect(
      await creaturesListed(
        clientAnswering(async () => ({ refused: "unserved", detail: "not served" })),
      ),
    ).toBeUndefined();
    expect(
      await creaturesListed(
        clientAnswering(async () => {
          throw new Error("GET /creatures answered 500");
        }),
      ),
    ).toBeUndefined();
    expect(await creaturesListed({} as Pick<ConsoleClient, "creatures">)).toBeUndefined();
  });
});

function clientAnswering(creatures: () => Promise<unknown>): Pick<ConsoleClient, "creatures"> {
  return { creatures } as unknown as Pick<ConsoleClient, "creatures">;
}

function memoryStorage(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
} {
  const held = new Map<string, string>();
  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, value),
  };
}
