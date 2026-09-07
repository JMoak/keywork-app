import type {
  BusEnvelope,
  EngineEventType,
  EnginePayloads,
  Replayable,
} from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { coalesceEnvelopes } from "./coalesce.ts";
import { project, projectAll } from "./project.ts";
import { toolRowText } from "./tool-row.ts";
import { emptyProjection } from "./types.ts";

let nextId = 0;
let clock = Date.parse("2026-09-06T12:00:00.000Z");

function at<K extends EngineEventType>(
  type: K,
  payload: EnginePayloads[K] & Replayable,
  ms = 0,
): BusEnvelope {
  clock += ms;
  nextId += 1;
  return {
    id: nextId,
    ts: new Date(clock).toISOString(),
    sessionId: "s1",
    type,
    payload,
  } as BusEnvelope;
}

const call = {
  type: "tool-call",
  callId: "c1",
  name: "bash",
  arguments: { command: "echo hi" },
} as const;
const assistant = { role: "assistant", parts: [{ type: "text", text: "hi there" }] } as const;

describe("project", () => {
  it("streams a plain turn into a user entry and a settling assistant entry", () => {
    const stream = [
      at("turn.started", { userText: "hello" }),
      at("turn.delta", { delta: { type: "text", text: "hi " } }),
      at("turn.delta", { delta: { type: "text", text: "there" } }),
    ];
    const mid = projectAll(emptyProjection, stream);
    expect(mid.entries).toEqual([
      { kind: "user", text: "hello", replay: false },
      { kind: "assistant", text: "hi there", replay: false, settled: false },
    ]);
    expect(mid.streaming).toBe(1);
    expect(mid.turn?.userText).toBe("hello");
    const done = project(
      mid,
      at("turn.completed", { message: assistant, usage: { inputTokens: 3, outputTokens: 2 } }),
    );
    expect(done.entries[1]).toMatchObject({ settled: true });
    expect(done.streaming).toBeUndefined();
    expect(done.turn).toBeUndefined();
    expect(done.usage).toMatchObject({
      inputTokens: 3,
      outputTokens: 2,
      turns: 1,
      unpricedTurns: 1,
      costUsd: 0,
    });
    expect(done.lastEventId).toBe(done.entries.length + 2);
  });

  it("carries a tool through proposed, running, tailed, and settled with a duration from the wire", () => {
    const proposed = projectAll(emptyProjection, [
      at("turn.started", { userText: "run it" }),
      at("turn.delta", { delta: { type: "tool-call", call } }),
    ]);
    expect(toolRowText(runOf(proposed, 1))).toBe("bash echo hi · proposed");
    const running = project(proposed, at("tool.started", { call }, 10));
    expect(runOf(running, 1).phase).toBe("running");
    const tailed = projectAll(running, [
      at("tool.output", { chunk: "first\nsec", callId: "c1" }),
      at("tool.output", { chunk: "ond\n", callId: "c1" }),
    ]);
    expect(toolRowText(runOf(tailed, 1))).toBe("bash echo hi · second");
    const settled = project(
      tailed,
      at("tool.finished", { callId: "c1", output: "first\nsecond\n", isError: false }, 1500),
    );
    expect(runOf(settled, 1)).toMatchObject({
      phase: "done",
      durationMs: 1500,
      outputChars: 13,
      detail: ["first", "second"],
      live: undefined,
    });
    expect(toolRowText(runOf(settled, 1))).toBe("bash echo hi · 1.5s · done");
    expect(settled.running).toEqual({});
  });

  it("marks a headless refusal on the proposed call and keeps it refused when the error result lands", () => {
    const refused = projectAll(emptyProjection, [
      at("turn.started", { userText: "rm it" }),
      at("turn.delta", { delta: { type: "tool-call", call } }),
      at("gate.permission", {
        decision: { tool: "bash", callId: "c1", verdict: "denied", gate: "headless" },
      }),
    ]);
    expect(runOf(refused, 1)).toMatchObject({ phase: "refused", reason: "no one to ask" });
    const settled = project(
      refused,
      at("tool.finished", { callId: "c1", output: "not approved", isError: true }),
    );
    expect(runOf(settled, 1).phase).toBe("refused");
    expect(toolRowText(runOf(settled, 1))).toBe("bash echo hi · refused · no one to ask");
    expect(settled.decisions.c1?.gate).toBe("headless");
  });

  it("folds thinking, keeps replayed history free of timing and usage, and notes interrupts", () => {
    const state = projectAll(emptyProjection, [
      at("turn.started", { userText: "old", replay: true }),
      at("turn.delta", { delta: { type: "visible-thinking", text: "hm" }, replay: true }),
      at("turn.delta", { delta: { type: "visible-thinking", text: "m" }, replay: true }),
      at("turn.delta", { delta: { type: "text", text: "old answer" }, replay: true }),
      at("turn.completed", {
        message: assistant,
        usage: { inputTokens: 9, outputTokens: 9 },
        replay: true,
      }),
      at("turn.started", { userText: "new" }),
      at("turn.delta", { delta: { type: "text", text: "partial" } }),
      at("turn.interrupted", { message: assistant }),
    ]);
    expect(state.entries.map((entry) => entry.kind)).toEqual([
      "user",
      "thinking",
      "assistant",
      "user",
      "assistant",
      "notice",
    ]);
    expect(state.entries[1]).toEqual({ kind: "thinking", text: "hmm", replay: true });
    expect(state.turn).toBeUndefined();
    expect(state.usage.turns).toBe(0);
    expect(state.entries.at(-1)).toEqual({ kind: "notice", level: "info", text: "· interrupted" });
  });

  it("tracks queue, preset, mode, injections, diagnostics and errors", () => {
    const state = projectAll(emptyProjection, [
      at("queue.changed", { queued: [{ id: "q1", text: "later", behavior: "queue" }] }),
      at("gate.preset", { from: "standard", to: "open" }),
      at("session.mode", { mode: "plan" }),
      at("context.injected", { injection: { source: "skill", id: "release" } }),
      at("diagnostics.published", { path: "src/a.ts", count: 2 }),
      at("engine.error", { error: { name: "Error", message: "provider failed" } }),
    ]);
    expect(state.queue).toHaveLength(1);
    expect(state.preset).toBe("open");
    expect(state.mode).toBe("plan");
    expect(state.injections).toEqual([{ source: "skill", id: "release" }]);
    expect(state.diagnostics).toEqual({ "src/a.ts": 2 });
    expect(state.lastError).toBe("provider failed");
    expect(state.entries.at(-1)).toEqual({
      kind: "notice",
      level: "error",
      text: "provider failed",
    });
  });

  it("never mutates a prior state", () => {
    const before = projectAll(emptyProjection, [at("turn.started", { userText: "a" })]);
    const frozen = JSON.stringify(before);
    projectAll(before, [
      at("turn.delta", { delta: { type: "text", text: "x" } }),
      at("tool.started", { call }),
    ]);
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe("coalesceEnvelopes", () => {
  it("projects to the same transcript whether deltas arrive one by one or merged per frame", () => {
    const stream = [
      at("turn.started", { userText: "go" }),
      at("turn.delta", { delta: { type: "visible-thinking", text: "a" } }),
      at("turn.delta", { delta: { type: "visible-thinking", text: "b" } }),
      at("turn.delta", { delta: { type: "text", text: "one " } }),
      at("turn.delta", { delta: { type: "text", text: "two" } }),
      at("turn.delta", { delta: { type: "tool-call", call } }),
      at("tool.started", { call }),
      at("tool.output", { chunk: "x\n", callId: "c1" }),
      at("tool.output", { chunk: "y\n", callId: "c1" }),
      at("tool.finished", { callId: "c1", output: "x\ny\n", isError: false }),
      at("turn.delta", { delta: { type: "text", text: "three" } }),
      at("turn.completed", { message: assistant, usage: { inputTokens: 1, outputTokens: 1 } }),
    ];
    const merged = coalesceEnvelopes(stream);
    expect(merged).toHaveLength(stream.length - 3);
    expect(projectAll(emptyProjection, merged)).toEqual(projectAll(emptyProjection, stream));
  });

  it("keeps replayed and live runs of text apart and keeps sessions apart", () => {
    const a = at("turn.delta", { delta: { type: "text", text: "a" } });
    const b = at("turn.delta", { delta: { type: "text", text: "b" }, replay: true });
    const c = { ...at("turn.delta", { delta: { type: "text", text: "c" } }), sessionId: "s2" };
    expect(coalesceEnvelopes([a, b, c])).toHaveLength(3);
  });
});

function runOf(state: ReturnType<typeof project>, index: number) {
  const entry = state.entries[index];
  if (entry?.kind !== "tool") throw new Error(`entry ${index} is not a tool`);
  return entry.run;
}
