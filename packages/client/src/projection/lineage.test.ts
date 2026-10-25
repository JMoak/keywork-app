import { readFile } from "node:fs/promises";
import type {
  BusEnvelope,
  EngineEventType,
  EnginePayloads,
  ToolCallPart,
} from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  type ChildLineage,
  childrenOf,
  childrenTouchedBy,
  childStateOf,
  emptyLineage,
  type LineageState,
  lineageOf,
  lineageOfProjection,
  lineageState,
} from "./lineage.ts";
import { projectAll } from "./project.ts";
import { emptyProjection, type ToolPhase, type ToolRun } from "./types.ts";

let nextId = 0;

function on<K extends EngineEventType>(
  sessionId: string,
  type: K,
  payload: EnginePayloads[K],
): BusEnvelope {
  nextId += 1;
  return { id: nextId, ts: "2026-10-15T12:00:00.000Z", sessionId, type, payload } as BusEnvelope;
}

const fold = (envelopes: readonly BusEnvelope[], from: LineageState = emptyLineage) =>
  envelopes.reduce(lineageState, from);

const usage = { inputTokens: 1, outputTokens: 1 };

async function recorded(): Promise<BusEnvelope[]> {
  const text = await readFile(new URL("../fixtures/delegated.jsonl", import.meta.url), "utf8");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as BusEnvelope);
}

describe("the lineage ledger", () => {
  it("follows the recorded delegation from running to completed under its parent", async () => {
    const stream = await recorded();
    const started = stream.findIndex((envelope) => envelope.type === "child.started");
    const running = fold(stream.slice(0, started + 1));
    const child: ChildLineage = {
      sessionId: "q2",
      parentId: "s1",
      callId: "d1",
      title: "audit the trust rules",
      bot: "researcher",
      state: "running",
      costNanos: undefined,
    };
    expect(childrenOf(running, "s1")).toEqual([child]);
    expect(childrenOf(fold(stream), "s1")).toEqual([{ ...child, state: "completed" }]);
    expect(lineageOf(fold(stream), "q2")?.parentId).toBe("s1");
    expect(lineageOf(fold(stream), "s1")).toBeUndefined();
    expect(childrenOf(fold(stream), "q2")).toEqual([]);
  });

  it("keeps children in the order they started and settles each in place", () => {
    const ledger = fold([
      on("p", "child.started", { callId: "a", sessionId: "k1", title: "first" }),
      on("p", "child.started", { callId: "b", sessionId: "k2", title: "second", bot: "scout" }),
      on("p", "child.finished", {
        callId: "a",
        sessionId: "k1",
        outcome: "interrupted",
        usage,
        costNanos: 900,
      }),
    ]);
    expect(
      childrenOf(ledger, "p").map((child) => [child.title, child.state, child.costNanos]),
    ).toEqual([
      ["first", "interrupted", 900],
      ["second", "running", undefined],
    ]);
  });

  it("skips an unsaved child and names a child it only saw finish as a child", () => {
    const ledger = fold([
      on("p", "child.started", { callId: "a", title: "nowhere" }),
      on("p", "child.finished", { callId: "a", outcome: "completed", usage }),
      on("p", "child.finished", { callId: "b", sessionId: "k2", outcome: "failed", usage }),
    ]);
    expect(childrenOf(ledger, "p")).toEqual([
      {
        sessionId: "k2",
        parentId: "p",
        callId: "b",
        title: "child",
        bot: undefined,
        state: "failed",
        costNanos: undefined,
      },
    ]);
  });

  it("harvests a loaded transcript's children, leaving runs without a child id out", () => {
    const delegate = (callId: string, title: string): ToolCallPart => ({
      type: "tool-call",
      callId,
      name: "delegate",
      arguments: { title, prompt: "p" },
    });
    const projection = projectAll(emptyProjection, [
      on("p", "tool.started", { call: delegate("a", "kept") }),
      on("p", "child.started", { callId: "a", sessionId: "k1", title: "kept" }),
      on("p", "tool.started", { call: delegate("b", "never started") }),
    ]);
    expect(lineageOfProjection(emptyLineage, "p", projection)).toEqual({
      p: [expect.objectContaining({ sessionId: "k1", callId: "a", state: "running" })],
    });
  });

  it("names the children whose open panes should reread: on finishing, and on activity while running", () => {
    const ledger = fold([
      on("p", "child.started", { callId: "a", sessionId: "k1", title: "busy" }),
      on("p", "child.started", { callId: "b", sessionId: "k2", title: "done" }),
      on("p", "child.finished", { callId: "b", sessionId: "k2", outcome: "completed", usage }),
    ]);
    const touched = childrenTouchedBy(ledger, [
      on("p", "tool.output", { chunk: "read a.ts", callId: "a" }),
      on("p", "tool.output", { chunk: "late line", callId: "b" }),
      on("other", "tool.output", { chunk: "x", callId: "a" }),
      on("p", "child.finished", { callId: "c", sessionId: "k3", outcome: "failed", usage }),
    ]);
    expect([...touched]).toEqual(["k1", "k3"]);
  });

  it("reads a run's state from its outcome first, then from its phase", () => {
    const run = (phase: ToolPhase, outcome?: "interrupted") =>
      ({
        phase,
        child: outcome === undefined ? undefined : { outcome },
      }) as unknown as ToolRun;
    expect(childStateOf(run("running"))).toBe("running");
    expect(childStateOf(run("done"))).toBe("completed");
    expect(childStateOf(run("failed"))).toBe("failed");
    expect(childStateOf(run("refused"))).toBe("denied");
    expect(childStateOf(run("failed", "interrupted"))).toBe("interrupted");
  });
});
