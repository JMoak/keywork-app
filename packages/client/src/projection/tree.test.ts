import { readFile } from "node:fs/promises";
import type { BusEnvelope, SessionEntries } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { emptyTreeState, entryText, treeRows, treeSnapshot, treeState } from "./tree.ts";

const fixture = (name: string): URL => new URL(`../fixtures/${name}`, import.meta.url);

async function envelopes(name: string): Promise<BusEnvelope[]> {
  const text = await readFile(fixture(`${name}.jsonl`), "utf8");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as BusEnvelope);
}

async function snapshot(): Promise<SessionEntries> {
  return JSON.parse(await readFile(fixture("entries.json"), "utf8")) as SessionEntries;
}

describe("the tree reducer over the recorded fork, label and leaf move", () => {
  it("goes stale on every session.tree, remembers the last change, and follows the leaf", async () => {
    const stream = await envelopes("tree");
    const changes = stream.filter((envelope) => envelope.type === "session.tree");
    expect(changes.map((envelope) => envelope.payload.reason)).toEqual(["fork", "label", "leaf"]);
    const afterFork = changes.slice(0, 1).reduce(treeState, emptyTreeState);
    expect(afterFork.stale).toBe(true);
    expect(afterFork.lastChange).toMatchObject({ reason: "fork", entryId: "q2", forkedTo: "q3" });
    const settled = treeSnapshot(afterFork, await snapshot());
    expect(settled.stale).toBe(false);
    expect(settled.leafId).toBe("q4");
    const moved = changes.slice(1).reduce(treeState, settled);
    expect(moved.stale).toBe(true);
    expect(moved.leafId).toBe("q2");
  });

  it("goes stale when session.state moves the leaf past the snapshot, and not when it stays", async () => {
    const stream = await envelopes("tree");
    const states = stream.filter((envelope) => envelope.type === "session.state");
    const settled = treeSnapshot(emptyTreeState, await snapshot());
    const last = states.at(-1) as BusEnvelope;
    expect(treeState(settled, last)).toBe(settled);
    const earlier = treeState(settled, states[1] as BusEnvelope);
    expect(earlier).toMatchObject({ stale: true, leafId: "q1" });
  });

  it("ignores every other event and replayed tree changes", async () => {
    const stream = await envelopes("tree");
    const quiet = stream.filter(
      (envelope) => envelope.type !== "session.tree" && envelope.type !== "session.state",
    );
    expect(quiet.reduce(treeState, emptyTreeState)).toBe(emptyTreeState);
    const fork = stream.find((envelope) => envelope.type === "session.tree") as BusEnvelope;
    const replayed = { ...fork, payload: { ...fork.payload, replay: true } } as BusEnvelope;
    expect(treeState(emptyTreeState, replayed)).toBe(emptyTreeState);
  });

  it("folds the flat log into rows: the branch point, the lit path, the label, and the leaf", async () => {
    const rows = treeRows(await snapshot());
    expect(rows.map((row) => [row.text, row.depth, row.onActivePath, row.isLeaf])).toEqual([
      ["user: which way?", 0, true, false],
      ["assistant: Left it is.", 1, false, false],
      ["label went left", 1, false, false],
      ["user: no, the other way", 1, true, false],
      ["assistant: Right, then.", 1, true, true],
    ]);
    expect(rows[0]).toMatchObject({ branchPoint: true, hasChildren: true, folded: false });
    expect(rows[1]?.label).toBe("went left");
  });

  it("folds a branch away and keeps the fold stamp on its row", async () => {
    const rows = treeRows(await snapshot(), new Set(["q1"]));
    expect(rows.map((row) => row.id)).toEqual(["q2", "q1", "q6", "q4"]);
    expect(rows[1]).toMatchObject({ folded: true, hasChildren: true });
  });

  it("describes every entry kind in one line", () => {
    const base = { id: "e", parentId: null, timestamp: "t" };
    expect(
      entryText({
        ...base,
        type: "compaction",
        summary: "",
        firstKeptEntryId: "x",
        tokensBefore: 900,
      }),
    ).toBe("compacted · 900 tokens summarized");
    expect(entryText({ ...base, type: "branch_summary", fromId: "x", summary: "a\nb" })).toBe(
      "branch summary: a b",
    );
    expect(entryText({ ...base, type: "label", targetId: "x", label: undefined })).toBe(
      "label cleared",
    );
    expect(entryText({ ...base, type: "session_info", name: "directions" })).toBe(
      'named "directions"',
    );
    expect(
      entryText({ ...base, type: "custom_message", customType: "c", content: "hi", display: true }),
    ).toBe("hi");
    expect(entryText({ ...base, type: "thinking_level_change", thinkingLevel: "high" })).toBe(
      "thinking → high",
    );
    expect(entryText({ ...base, type: "effort_change", effort: "max" })).toBe("effort → max");
    expect(entryText({ ...base, type: "model_change", provider: "p", modelId: "m" })).toBe(
      "model → p/m",
    );
    expect(entryText({ ...base, type: "binding", arc: "a", bot: null })).toBe(
      "arc a · bot cleared",
    );
    expect(entryText({ ...base, type: "binding" })).toBe("binding unchanged");
    expect(entryText({ ...base, type: "context_edit", targetId: "x", replacement: null })).toBe(
      "context entry removed",
    );
    expect(entryText({ ...base, type: "custom", customType: "note" })).toBe("note");
    expect(
      entryText({
        ...base,
        type: "message",
        message: { role: "user", parts: [{ type: "text", text: "x".repeat(60) }] },
      }),
    ).toBe(`user: ${"x".repeat(48)}…`);
  });
});
