import { readFile } from "node:fs/promises";
import type { BusEnvelope, ChangesReading } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  changesByTurn,
  changesSnapshot,
  changesState,
  countsOf,
  emptyChangesState,
} from "./changes.ts";

const fixture = (name: string): URL => new URL(`../fixtures/${name}`, import.meta.url);

async function envelopes(name: string): Promise<BusEnvelope[]> {
  const text = await readFile(fixture(`${name}.jsonl`), "utf8");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as BusEnvelope);
}

async function reading(): Promise<ChangesReading> {
  return JSON.parse(await readFile(fixture("changes.json"), "utf8")) as ChangesReading;
}

describe("the changes reducer over the recorded write turn", () => {
  it("replaces the path list on changes.updated and asks for counts", async () => {
    const stream = await envelopes("changes");
    const updated = stream.filter((envelope) => envelope.type === "changes.updated");
    expect(updated).toHaveLength(1);
    expect(stream.map((envelope) => envelope.type).slice(-3)).toEqual([
      "session.tree",
      "memory.inbox",
      "changes.updated",
    ]);
    const state = stream.reduce(changesState, emptyChangesState);
    expect(state).toEqual({
      availability: "trusted",
      baseline: undefined,
      files: [{ path: "notes.txt", added: 0, deleted: 0 }],
      stale: true,
    });
  });

  it("settles on the fetched counts and provenance, sorted newest turn first", async () => {
    const stream = await envelopes("changes");
    const state = changesSnapshot(stream.reduce(changesState, emptyChangesState), await reading());
    expect(state).toEqual({
      availability: "trusted",
      baseline: "session start",
      files: [{ path: "notes.txt", added: 2, deleted: 0, turn: 1 }],
      stale: false,
    });
    expect(countsOf(state.files[0] as (typeof state.files)[number])).toBe("+2 −0");
  });

  it("keeps known counts for paths that stay in the list after an update", async () => {
    const settled = changesSnapshot(emptyChangesState, await reading());
    const again = (await envelopes("changes")).reduce(changesState, settled);
    expect(again.files).toEqual([{ path: "notes.txt", added: 2, deleted: 0, turn: 1 }]);
    expect(again.stale).toBe(true);
  });

  it("names an untrusted workspace and a missing baseline honestly", () => {
    expect(changesSnapshot(emptyChangesState, { trusted: false, files: [] })).toMatchObject({
      availability: "untrusted",
      files: [],
    });
    expect(changesSnapshot(emptyChangesState, "no-baseline").availability).toBe("no-baseline");
    expect(changesSnapshot(emptyChangesState, "missing")).toMatchObject({
      availability: "unknown",
      stale: false,
    });
  });

  it("groups files by turn, newest first, with unattributed files last", () => {
    const groups = changesByTurn([
      { path: "b.ts", added: 1, deleted: 0, turn: 1 },
      { path: "z.ts", added: 1, deleted: 1 },
      { path: "a.ts", added: 3, deleted: 2, turn: 2 },
      { path: "c.ts", added: 0, deleted: 1, turn: 1 },
    ]);
    expect(groups.map((group) => [group.turn, group.files.map((file) => file.path)])).toEqual([
      [2, ["a.ts"]],
      [1, ["b.ts", "c.ts"]],
      [undefined, ["z.ts"]],
    ]);
  });
});
