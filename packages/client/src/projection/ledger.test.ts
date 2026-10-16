import { readFileSync } from "node:fs";
import type {
  BusEnvelope,
  ChangedPath,
  SessionEntries,
  SessionEntry,
  Usage,
} from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { type ChangesState, emptyChangesState } from "./changes.ts";
import { latestLedger, pathReading, restoreReach, transcriptLedger } from "./ledger.ts";
import { projectAll } from "./project.ts";
import { emptyProjection } from "./types.ts";

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

const restoredStream = fixture("restored.jsonl")
  .split("\n")
  .filter((line) => line !== "")
  .map((line) => JSON.parse(line) as BusEnvelope);

const recordedLog = (JSON.parse(fixture("restored.json")) as { entries: { body: SessionEntries } })
  .entries.body;

const recordedChanges: ChangesState = {
  availability: "ready",
  baseline: "session start",
  files: (JSON.parse(fixture("changes.json")) as { files: ChangedPath[] }).files,
  stale: false,
};

describe("pathReading: the turns the server counts", () => {
  it("numbers the prompts on the active path and finds each turn's last message", () => {
    const path = pathReading(recordedLog);
    expect(
      path.turns.map(({ turn, promptId, leafId, text }) => [turn, promptId, leafId, text]),
    ).toEqual([
      [1, "q5", "q1", "write two lines to notes.txt"],
      [2, "q9", "q2", "now say done"],
    ]);
    expect(path.opening).toEqual([]);
  });

  it("marks a restore taken back after the turn that follows it, naming the restored turn", () => {
    const path = pathReading(recordedLog);
    expect(path.turns[0]?.marks).toEqual([]);
    expect(path.turns[1]?.marks).toEqual([
      { kind: "restore-undone", entryId: "q4", turn: 1, leaf: true },
    ]);
  });

  it("opens with a restore that left no turn on the path", () => {
    const restoredToStart = { ...recordedLog, leafId: "q3", activePath: ["q6", "q3"] };
    expect(pathReading(restoredToStart)).toEqual({
      opening: [{ kind: "restore", entryId: "q3", turn: 1, leaf: true }],
      turns: [],
    });
  });

  it("prices a turn only when every reply on it carried a price", () => {
    const priced = pathReading(log([prompt("p1", "a"), reply("r1", 0.01), reply("r2", 0.03)]));
    expect(priced.turns[0]?.costUsd).toBeCloseTo(0.04);
    const partly = pathReading(log([prompt("p1", "a"), reply("r1", 0.01), reply("r2")]));
    expect(partly.turns[0]?.costUsd).toBeUndefined();
    expect(pathReading(log([prompt("p1", "a")])).turns[0]?.costUsd).toBeUndefined();
  });

  it("reads one snapshot once", () => {
    expect(pathReading(recordedLog)).toBe(pathReading(recordedLog));
  });
});

describe("transcriptLedger: each settled turn's facts", () => {
  const projection = projectAll(emptyProjection, restoredStream);

  it("places the recorded turns and gives each its files and its time in tools", () => {
    const ledger = transcriptLedger(projection, pathReading(recordedLog), recordedChanges);
    expect(
      ledger.turns.map((turn) => ({
        head: turn.head,
        end: turn.end,
        turn: turn.place?.turn,
        files: turn.files?.map((file) => file.path),
        toolMs: turn.toolMs,
      })),
    ).toEqual([
      { head: 0, end: 2, turn: 1, files: ["notes.txt"], toolMs: 500 },
      { head: 3, end: 4, turn: 2, files: [], toolMs: undefined },
    ]);
  });

  it("says nothing it was not told: no path, no place; no changes read, no files", () => {
    const ledger = transcriptLedger(projection, undefined, emptyChangesState);
    expect(ledger.turns.map((turn) => [turn.place, turn.files, turn.costUsd])).toEqual([
      [undefined, undefined, undefined],
      [undefined, undefined, undefined],
    ]);
    expect(ledger.turns[0]?.toolMs).toBe(500);
  });

  it("leaves the running turn without a ledger until it settles", () => {
    const running = projectAll(projection, [started("one more", 30)]);
    expect(transcriptLedger(running, pathReading(recordedLog), recordedChanges).turns).toHaveLength(
      2,
    );
    expect(latestLedger(running, pathReading(recordedLog), recordedChanges)?.place?.turn).toBe(2);
  });

  it("places the newest prompts first, so a repeated prompt keeps its own turn", () => {
    const path = pathReading(
      log([prompt("p1", "go"), reply("r1"), prompt("p2", "continue"), reply("r2")]),
    );
    const transcript = projectAll(emptyProjection, [
      started("the conversation so far, folded", 1),
      completed(2),
      started("go", 3),
      completed(4),
      started("continue", 5),
      completed(6),
    ]);
    const turns = transcriptLedger(transcript, path, emptyChangesState).turns;
    expect(turns.map((turn) => turn.place?.promptId)).toEqual([undefined, "p1", "p2"]);
  });

  it("leaves a settled prompt unplaced while the path has not caught up with it", () => {
    const path = pathReading(log([prompt("p1", "go"), reply("r1")]));
    const transcript = projectAll(emptyProjection, [
      started("go", 1),
      completed(2),
      started("go", 3),
      completed(4),
    ]);
    expect(
      transcriptLedger(transcript, path, emptyChangesState).turns.map((turn) => turn.place?.turn),
    ).toEqual([undefined, 1]);
  });

  it("agrees with the full ledger on the latest turn", () => {
    const path = pathReading(recordedLog);
    expect(latestLedger(projection, path, recordedChanges)).toEqual(
      transcriptLedger(projection, path, recordedChanges).turns.at(-1),
    );
    expect(latestLedger(emptyProjection, path, recordedChanges)).toBeUndefined();
  });
});

describe("restoreReach: what a restore to before a turn moves", () => {
  it("counts the turns from there on and the changed files they touched", () => {
    const path = pathReading(recordedLog);
    expect(restoreReach(path, recordedChanges, 1)).toEqual({ turns: 2, files: 1 });
    expect(restoreReach(path, recordedChanges, 2)).toEqual({ turns: 1, files: 0 });
    expect(restoreReach(path, emptyChangesState, 2)).toEqual({ turns: 1, files: undefined });
  });
});

function log(entries: readonly SessionEntry[]): SessionEntries {
  return {
    sessionId: "s1",
    leafId: entries.at(-1)?.id ?? null,
    entries,
    labels: {},
    activePath: entries.map((entry) => entry.id),
  };
}

function prompt(id: string, text: string): SessionEntry {
  return {
    type: "message",
    message: { role: "user", parts: [{ type: "text", text }] },
    id,
    parentId: null,
    timestamp: "2026-09-07T12:00:00.000Z",
  };
}

function reply(id: string, costUsd?: number): SessionEntry {
  const usage: Usage = {
    inputTokens: 10,
    outputTokens: 5,
    ...(costUsd !== undefined && { costUsd }),
  };
  return {
    type: "message",
    message: { role: "assistant", parts: [{ type: "text", text: "ok" }] },
    usage,
    id,
    parentId: null,
    timestamp: "2026-09-07T12:00:00.000Z",
  };
}

function started(userText: string, id: number): BusEnvelope {
  return {
    id,
    ts: "2026-09-07T12:00:00.000Z",
    sessionId: "s1",
    type: "turn.started",
    payload: { userText },
  };
}

function completed(id: number): BusEnvelope {
  return {
    id,
    ts: "2026-09-07T12:00:00.000Z",
    sessionId: "s1",
    type: "turn.completed",
    payload: {
      message: { role: "assistant", parts: [{ type: "text", text: "ok" }] },
      usage: { inputTokens: 1, outputTokens: 1 },
    },
  };
}
