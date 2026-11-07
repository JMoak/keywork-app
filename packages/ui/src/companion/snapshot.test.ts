import { describe, expect, it } from "vitest";
import {
  askLine,
  bubbleLine,
  bubbleShown,
  snapshotFrom,
  stateOf,
  type ThreadFacts,
} from "./snapshot.ts";

const quiet: ThreadFacts = {
  id: "t0",
  title: "notes",
  live: false,
  working: false,
  failed: false,
  finishedUnseen: false,
  paused: false,
  tool: undefined,
  ask: undefined,
};

const creature = { name: "pip", hueStop: 2 };

describe("snapshotFrom", () => {
  it("is idle with nothing to do and names the creature", () => {
    expect(snapshotFrom(creature, [quiet])).toEqual({
      creature,
      state: "idle",
      stateLabel: "idle",
      activeThreads: 0,
      finishedUnseen: 0,
      threadId: "t0",
      tool: undefined,
      needsYou: undefined,
    });
  });

  it("shows the highest-priority thread: the porch beats blocked beats back beats working", () => {
    const working: ThreadFacts = { ...quiet, id: "w", live: true, working: true, tool: "bash" };
    const back: ThreadFacts = { ...quiet, id: "b", finishedUnseen: true };
    const blocked: ThreadFacts = { ...quiet, id: "x", failed: true };
    const porch: ThreadFacts = {
      ...quiet,
      id: "p",
      title: "rename the ledger",
      live: true,
      ask: { callId: "c1", tool: "bash", answers: ["approve", "deny"] },
    };
    expect(snapshotFrom(creature, [working]).state).toBe("working");
    expect(snapshotFrom(creature, [working]).tool).toBe("bash");
    expect(snapshotFrom(creature, [working, back])).toMatchObject({ state: "back", threadId: "b" });
    expect(snapshotFrom(creature, [back, blocked])).toMatchObject({
      state: "blocked",
      threadId: "x",
    });
    const snapshot = snapshotFrom(creature, [blocked, porch, working]);
    expect(snapshot).toMatchObject({
      state: "porch",
      stateLabel: "at the porch",
      threadId: "p",
      activeThreads: 2,
      finishedUnseen: 0,
      tool: undefined,
      needsYou: {
        title: "rename the ledger",
        line: "asks to run a command",
        callId: "c1",
        answers: ["approve", "deny"],
      },
    });
  });

  it("stands at the porch for a chore held on the keeper's grants, with the accept offered in the bubble", () => {
    const held = {
      creature: "pip",
      routineId: "triage",
      line: "asks to accept its grants",
      reason: "accept the write grant set 3f9c1a2b",
      digest: "3f9c1a2b",
    };
    const snapshot = snapshotFrom(creature, [quiet], held);
    expect(snapshot).toMatchObject({
      state: "porch",
      stateLabel: "at the porch",
      threadId: "t0",
      needsYou: undefined,
      heldChore: held,
    });
    expect(bubbleShown(snapshot)).toEqual({
      title: "pip · triage",
      line: "asks to accept its grants",
      callId: undefined,
      answers: [],
      accept: { creature: "pip", routineId: "triage", digest: "3f9c1a2b" },
    });
    const asked: ThreadFacts = {
      ...quiet,
      id: "t1",
      title: "rename the ledger",
      ask: { callId: "c1", tool: "bash", answers: ["approve"] },
    };
    expect(bubbleShown(snapshotFrom(creature, [asked], held))?.title).toBe("rename the ledger");
    expect(snapshotFrom(creature, [quiet], { ...held, digest: undefined }).heldChore?.digest).toBe(
      undefined,
    );
  });

  it("stands at the porch for a decision made in the keeper's name, behind an ask and a held chore, with overturn offered", () => {
    const decided = {
      recordId: "r7",
      sessionId: "t0",
      title: "notes",
      tool: "bash",
      ruleClass: "shell.read",
    };
    const snapshot = snapshotFrom(creature, [quiet], undefined, decided);
    expect(snapshot).toMatchObject({ state: "porch", stateLabel: "at the porch", decided });
    expect(bubbleShown(snapshot)).toEqual({
      title: "notes",
      line: "decided for you · approved bash",
      callId: undefined,
      answers: [],
      overturn: { recordId: "r7" },
    });
    const held = {
      creature: "pip",
      routineId: "triage",
      line: "asks to accept its grants",
      reason: "",
      digest: "d",
    };
    expect(bubbleShown(snapshotFrom(creature, [quiet], held, decided))?.title).toBe("pip · triage");
    const asked: ThreadFacts = {
      ...quiet,
      id: "t1",
      title: "rename the ledger",
      ask: { callId: "c1", tool: "bash", answers: ["approve"] },
    };
    expect(bubbleShown(snapshotFrom(creature, [asked], undefined, decided))?.title).toBe(
      "rename the ledger",
    );
  });

  it("speaks the fixed vocabulary and never the agent's prose", () => {
    expect(askLine("bash")).toBe("asks to run a command");
    expect(askLine("edit")).toBe("asks to edit a file");
    expect(askLine("write")).toBe("asks to edit a file");
    expect(askLine("web_fetch")).toBe("question");
    expect(bubbleLine({ ...quiet, failed: true })).toBe("blocked");
    expect(bubbleLine({ ...quiet, finishedUnseen: true })).toBe("finished");
    expect(stateOf({ ...quiet, paused: true, working: true })).toBe("paused");
  });
});
