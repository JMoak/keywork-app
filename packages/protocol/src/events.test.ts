import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { engineEventTypes, eventTypes, isServerEvent, serverEventTypes } from "./events.ts";

const vocabularyDoc = new URL("./fixtures/events.md", import.meta.url);

async function documentedSections(): Promise<{ engine: string[]; server: string[] }> {
  const doc = await readFile(vocabularyDoc, "utf8");
  const marker = "\n## Server events\n";
  const split = doc.indexOf(marker);
  const engineDoc = split === -1 ? doc : doc.slice(0, split);
  const serverDoc = split === -1 ? "" : (doc.slice(split).split("\n## ")[1] ?? "");
  return { engine: headings(engineDoc), server: headings(serverDoc) };
}

function headings(text: string): string[] {
  return [...text.matchAll(/^### ([a-z]+\.[a-z]+)$/gm)].map(([, name]) => name ?? "");
}

describe("the event vocabulary", () => {
  it("matches every engine event heading in keywork's docs/events.md", async () => {
    const { engine } = await documentedSections();
    expect([...engineEventTypes].sort()).toEqual([...engine].sort());
  });

  it("matches every heading under the server events section", async () => {
    const { server } = await documentedSections();
    expect([...serverEventTypes].sort()).toEqual([...server].sort());
  });

  it("has seventeen engine types with no duplicates and the server types beside them", () => {
    expect(new Set(engineEventTypes).size).toBe(17);
    expect(new Set(eventTypes).size).toBe(engineEventTypes.length + serverEventTypes.length);
  });

  it("tells a process-level envelope from a session's", () => {
    expect(
      isServerEvent({
        id: 1,
        ts: "t",
        sessionId: "",
        type: "memory.inbox",
        payload: { count: 1, staged: 1, airlock: 0, proposals: 0, contradictions: 0 },
      }),
    ).toBe(true);
    expect(
      isServerEvent({
        id: 2,
        ts: "t",
        sessionId: "s1",
        type: "session.mode",
        payload: { mode: "m" },
      }),
    ).toBe(false);
  });
});
