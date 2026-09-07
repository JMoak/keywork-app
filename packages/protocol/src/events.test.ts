import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { engineEventTypes } from "./events.ts";

const vocabularyDoc = new URL("./fixtures/events.md", import.meta.url);

describe("the event vocabulary", () => {
  it("matches every event heading in keywork's docs/events.md", async () => {
    const doc = await readFile(vocabularyDoc, "utf8");
    const documented = [...doc.matchAll(/^### ([a-z]+\.[a-z]+)$/gm)].map(([, name]) => name);
    expect([...engineEventTypes].sort()).toEqual([...documented].sort());
  });

  it("has fifteen types with no duplicates", () => {
    expect(new Set(engineEventTypes).size).toBe(15);
  });
});
