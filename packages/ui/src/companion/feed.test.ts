import {
  emptyHabitat,
  type HabitatState,
  project,
  projectAll,
  withCreatures,
} from "@keywork-app/habitat";
import type { BusEnvelope, EventPayloads, EventType, Replayable } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { creatureSnapshot, residents, threadOfAsk, workToolOf } from "./feed.ts";

let nextId = 0;
let clock = Date.parse("2026-11-05T12:00:00.000Z");

function at<K extends EventType>(
  type: K,
  payload: EventPayloads[K] & Replayable,
  sessionId = "s1",
): BusEnvelope {
  clock += 250;
  nextId += 1;
  return { id: nextId, ts: new Date(clock).toISOString(), sessionId, type, payload } as BusEnvelope;
}

function seated(): HabitatState {
  return withCreatures(
    emptyHabitat(),
    [
      {
        slug: "pip",
        name: "Pip",
        threads: [{ id: "s1", kind: "thread", title: "rename the ledger" }],
      },
      { slug: "ada", name: "Ada" },
    ],
    new Date(clock).toISOString(),
  );
}

const call = {
  type: "tool-call",
  callId: "c1",
  name: "bash",
  arguments: { command: "ls" },
} as const;

describe("the companion feed", () => {
  it("seats residents in slug order with a hue stop each", () => {
    expect(residents(seated())).toEqual([
      { slug: "ada", name: "Ada", hueStop: 1 },
      { slug: "pip", name: "Pip", hueStop: 2 },
    ]);
  });

  it("reads idle, working with the tool in hand, and the porch with the ask's answers", () => {
    const world = seated();
    const [, pip] = residents(world);
    if (pip === undefined) throw new Error("no pip");
    expect(creatureSnapshot(world, pip, clock)).toMatchObject({
      creature: { name: "Pip", hueStop: 2 },
      state: "idle",
      activeThreads: 0,
    });
    const working = projectAll(world, [
      at("turn.started", { userText: "rename it" }),
      at("tool.started", { call }),
    ]);
    expect(creatureSnapshot(working, pip, clock)).toMatchObject({
      state: "working",
      threadId: "s1",
      tool: "bash",
      activeThreads: 1,
    });
    const asking = project(
      working,
      at("gate.ask", {
        ask: { tool: "bash", callId: "c1", arguments: call.arguments, rule: "default" },
      }),
    );
    const snapshot = creatureSnapshot(asking, pip, clock, () => ["approve", "session", "deny"]);
    expect(snapshot).toMatchObject({
      state: "porch",
      stateLabel: "at the porch",
      threadId: "s1",
      needsYou: {
        title: "rename the ledger",
        line: "asks to run a command",
        callId: "c1",
        answers: ["approve", "session", "deny"],
      },
    });
    expect(threadOfAsk(asking, "c1")).toBe("s1");
    expect(threadOfAsk(asking, "nope")).toBeUndefined();
  });

  it("marks a failed turn blocked and a finished one back until the keeper looks", () => {
    const world = projectAll(seated(), [
      at("turn.started", { userText: "go" }),
      at("engine.error", { error: { name: "Error", message: "boom" } }),
    ]);
    const [, pip] = residents(world);
    if (pip === undefined) throw new Error("no pip");
    expect(creatureSnapshot(world, pip, clock).state).toBe("blocked");
    const back = projectAll(world, [
      at("turn.started", { userText: "again" }),
      at("turn.completed", {
        message: { role: "assistant", parts: [{ type: "text", text: "done" }] },
        usage: { inputTokens: 1, outputTokens: 1 },
      }),
    ]);
    expect(creatureSnapshot(back, pip, clock)).toMatchObject({ state: "back", finishedUnseen: 1 });
  });

  it("names only the tools the companion draws", () => {
    expect(workToolOf("bash")).toBe("bash");
    expect(workToolOf("write")).toBe("edit");
    expect(workToolOf("web_fetch")).toBeUndefined();
    expect(workToolOf(undefined)).toBeUndefined();
  });
});
