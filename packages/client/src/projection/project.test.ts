import type {
  BusEnvelope,
  EngineEventType,
  EnginePayloads,
  MemoryDecision,
  Replayable,
} from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { coalesceEnvelopes } from "./coalesce.ts";
import { historyEnvelopes } from "./history.ts";
import { crateDeliveredLine, emptyReplyLine, project, projectAll } from "./project.ts";
import { toolRowSpans, toolRowText } from "./tool-row.ts";
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

  it("shows the latest whole line of live output, never lines glued together, and how long it has run", () => {
    const started = projectAll(emptyProjection, [
      at("turn.started", { userText: "ping" }),
      at("tool.started", { call }),
    ]);
    const startedAt = Date.parse(runOf(started, 1).startedAt ?? "");
    const tailed = projectAll(started, [
      at("tool.output", { chunk: "line1\r\n", callId: "c1" }),
      at("tool.output", { chunk: "line2\r\n", callId: "c1" }),
      at("tool.output", { chunk: "line3\n", callId: "c1" }),
    ]);
    expect(runOf(tailed, 1).live).toBe("line3");
    expect(toolRowText(runOf(tailed, 1))).toBe("bash echo hi · line3");
    expect(
      toolRowSpans(runOf(tailed, 1), { now: startedAt + 4_200 })
        .map((span) => span.text)
        .join(""),
    ).toBe("bash echo hi · 4.0s · line3");
  });

  it("keeps what a stopped command printed and calls the stop a stop, not a failure", () => {
    const stopped = projectAll(emptyProjection, [
      at("turn.started", { userText: "ping" }),
      at("tool.started", { call }),
      at("tool.output", {
        chunk: "Reply from 127.0.0.103\nReply from 127.0.0.103\n",
        callId: "c1",
      }),
      at("tool.finished", { callId: "c1", output: "Command aborted", isError: true }, 17_900),
      at("turn.interrupted", { message: { role: "assistant", parts: [] } }),
    ]);
    expect(runOf(stopped, 1)).toMatchObject({
      stopped: true,
      reason: undefined,
      detail: ["Reply from 127.0.0.103", "Reply from 127.0.0.103"],
    });
    expect(toolRowText(runOf(stopped, 1))).toBe("bash echo hi · 17.9s · stopped");
  });

  it("reads a non-zero exit from the wire's exit code instead of calling it done", () => {
    const finished = (output: string, exitCode?: number) =>
      runOf(
        projectAll(emptyProjection, [
          at("turn.started", { userText: "ls" }),
          at("tool.started", { call }),
          at(
            "tool.finished",
            { callId: "c1", output, isError: false, ...(exitCode !== undefined && { exitCode }) },
            255,
          ),
        ]),
        1,
      );
    expect(toolRowText(finished("ls: nope_dir: No such file\n(exit code 2)", 2))).toBe(
      "bash echo hi · 255ms · exit 2",
    );
    expect(toolRowSpans(finished("(exit code 2)", 2)).at(-1)).toMatchObject({ tone: "bad" });
    expect(finished("(shell exited; a fresh shell starts on the next command)").exitNote).toBe(
      "shell exited",
    );
    expect(toolRowText(finished("all good", 0))).toBe("bash echo hi · 255ms · done");
    expect(toolRowText(finished("(exit code 2)"))).toBe("bash echo hi · 255ms · done");
  });

  it("keeps a stored exit code when a reload replays the tool", () => {
    const detail = {
      id: "s1",
      title: "ls",
      createdAt: "2026-09-06T12:00:00.000Z",
      lastActivityAt: "2026-09-06T12:00:00.000Z",
      messageCount: 3,
      cwd: "/work",
      live: false,
      asOf: 0,
      messages: [
        { role: "user", parts: [{ type: "text", text: "ls" }] },
        { role: "assistant", parts: [{ ...call }] },
        {
          role: "tool",
          parts: [{ type: "tool-result", callId: "c1", output: "", isError: false, exitCode: 2 }],
        },
      ],
    } as const;
    const replayed = projectAll(emptyProjection, historyEnvelopes(detail));
    expect(runOf(replayed, 1).exitNote).toBe("exit 2");
  });

  it("says a missing file plainly instead of the system's error and absolute path", () => {
    const read = {
      type: "tool-call",
      callId: "r1",
      name: "read",
      arguments: { path: "nope.txt" },
    } as const;
    const failed = projectAll(emptyProjection, [
      at("turn.started", { userText: "read it" }),
      at("tool.started", { call: read }),
      at("tool.finished", {
        callId: "r1",
        output: "ENOENT: no such file or directory, open 'C:\\Users\\k\\workspace\\nope.txt'",
        isError: true,
      }),
    ]);
    expect(runOf(failed, 1).reason).toBe("nope.txt not found");
  });

  it("times the tool's own run apart from the minute it waited for a human answer", () => {
    const asked = projectAll(emptyProjection, [
      at("turn.started", { userText: "run it" }),
      at("tool.started", { call }),
      at(
        "gate.ask",
        {
          ask: { tool: "bash", callId: "c1", arguments: call.arguments, rule: "default" },
        },
        200,
      ),
    ]);
    const answered = project(
      asked,
      at(
        "gate.permission",
        {
          decision: { tool: "bash", callId: "c1", verdict: "granted", gate: "user", scope: "once" },
        },
        61_000,
      ),
    );
    expect(runOf(answered, 1)).toMatchObject({ phase: "running", waitedMs: 61_000 });
    const settled = project(
      answered,
      at("tool.finished", { callId: "c1", output: "hi", isError: false }, 800),
    );
    expect(runOf(settled, 1)).toMatchObject({ durationMs: 1000, waitedMs: 61_000 });
    expect(toolRowText(runOf(settled, 1))).toBe("bash echo hi · 1.0s · waited 1m · done");
  });

  it("marks a headless refusal on the proposed call and keeps it refused when the error result lands", () => {
    const refused = projectAll(emptyProjection, [
      at("turn.started", { userText: "rm it" }),
      at("turn.delta", { delta: { type: "tool-call", call } }),
      at("gate.permission", {
        decision: { tool: "bash", callId: "c1", verdict: "denied", gate: "headless" },
      }),
    ]);
    expect(runOf(refused, 1)).toMatchObject({ phase: "refused", reason: "no one answered" });
    const settled = project(
      refused,
      at("tool.finished", { callId: "c1", output: "not approved", isError: true }),
    );
    expect(runOf(settled, 1).phase).toBe("refused");
    expect(toolRowText(runOf(settled, 1))).toBe("bash echo hi · refused · no one answered");
    expect(settled.decisions.c1?.gate).toBe("headless");
  });

  it("ends a turn that failed with its error and its prompt, ready to try again", () => {
    const state = projectAll(emptyProjection, [
      at("turn.started", { userText: "summarize the log", entryId: "p1" }),
      at("turn.delta", { delta: { type: "text", text: "Reading" } }),
      at("engine.error", { error: { name: "Error", message: "upstream 529 overloaded" } }),
    ]);
    expect(state.turn).toBeUndefined();
    expect(state.lastError).toBe("upstream 529 overloaded");
    expect(state.entries.at(-1)).toEqual({
      kind: "ending",
      outcome: "failed",
      text: "upstream 529 overloaded",
      prompt: "summarize the log",
      replay: false,
    });
  });

  it("draws a failed turn once when a snapshot that already held its outcome is followed by its live retelling", () => {
    const error = { name: "Error", message: "upstream 529 overloaded" };
    const state = projectAll(emptyProjection, [
      at("turn.started", { userText: "failnow", entryId: "p1", replay: true }),
      at("engine.error", { error, replay: true }),
      at("turn.started", { userText: "failnow", entryId: "p1" }),
      at("engine.error", { error }),
    ]);
    expect(state.entries.map((entry) => entry.kind)).toEqual(["user", "ending"]);
    expect(state.entries[1]).toMatchObject({ outcome: "failed", replay: false });
  });

  it("offers no resend for a turn a creature framed, whose prompt the keeper never wrote", () => {
    const origin = { kind: "creature", creature: "wren", thread: "s1" } as const;
    const state = projectAll(emptyProjection, [
      at("turn.started", { userText: "You are Wren.", origin }),
      at("turn.interrupted", { message: { role: "assistant", parts: [] } }),
    ]);
    expect(state.entries).toEqual([
      {
        kind: "ending",
        outcome: "interrupted",
        text: "interrupted",
        prompt: undefined,
        replay: false,
      },
    ]);
  });

  it("leaves a trace when the model answers with nothing at all", () => {
    const empty = { role: "assistant", parts: [] } as const;
    const usage = { inputTokens: 3, outputTokens: 0 };
    const state = projectAll(emptyProjection, [
      at("turn.started", { userText: "nothing" }),
      at("turn.delta", { delta: { type: "done", usage } }),
      at("turn.completed", { message: empty, usage }),
      at("turn.started", { userText: "say hi" }),
      at("turn.delta", { delta: { type: "text", text: "hi there" } }),
      at("turn.completed", { message: assistant, usage }),
    ]);
    expect(state.entries.map((entry) => ("text" in entry ? entry.text : entry.kind))).toEqual([
      "nothing",
      emptyReplyLine,
      "say hi",
      "hi there",
    ]);
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

describe("a setting taken back", () => {
  it("is named by the title show gave it, not by its id", () => {
    const id = "b445d1c2-0f6e-4a55-9a0e-1c2d3e4f5a6b";
    const asked = (callId: string, name: string, args: Record<string, unknown>) =>
      at("tool.started", { call: { type: "tool-call", callId, name, arguments: args } });
    const answer = `Set out as a card.
To set out what grows from it, name ${id} as from.`;
    const state = projectAll(emptyProjection, [
      asked("s1", "show", { what: { kind: "note", ref: "n1", title: "One more thing" } }),
      at("tool.finished", { callId: "s1", output: answer, isError: false }),
      asked("w1", "withdraw", { id }),
      asked("w2", "withdraw", { id: "some-other-id" }),
    ]);
    const subjects = state.entries.flatMap((entry) =>
      entry.kind === "tool" ? [entry.run.subject] : [],
    );
    expect(subjects).toEqual(["note · One more thing", "note · One more thing", "some-other-id"]);
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

describe("a creature's report lines", () => {
  it("draws a thread's report as its one line, and the conversation's own label as the delivery, never the sentence twice", () => {
    const report = (thread: string, replay = false) =>
      at("extension.notice", {
        extension: "creature",
        level: "info",
        message: "I wrote the five largest files to notes/largest.md.",
        detail: { origin: { kind: "creature", creature: "hal", thread }, entryId: "e9" },
        ...(replay && { replay }),
      });
    const lines = (state: ReturnType<typeof project>) =>
      state.entries.flatMap((entry) => (entry.kind === "notice" ? [entry.text] : []));
    expect(lines(projectAll(emptyProjection, [report("s1")]))).toEqual([crateDeliveredLine]);
    expect(lines(projectAll(emptyProjection, [report("s1", true)]))).toEqual([crateDeliveredLine]);
    expect(lines(projectAll(emptyProjection, [report("thread-2")]))).toEqual([
      "I wrote the five largest files to notes/largest.md.",
    ]);
    const frame = at("extension.notice", {
      extension: "creature",
      level: "info",
      message: "Hal reads the workspace and introduces itself.",
      detail: { kind: "frame", origin: { kind: "creature", creature: "hal", thread: "s1" } },
    });
    expect(lines(projectAll(emptyProjection, [frame]))).toEqual([]);
  });
});

function runOf(state: ReturnType<typeof project>, index: number) {
  const entry = state.entries[index];
  if (entry?.kind !== "tool") throw new Error(`entry ${index} is not a tool`);
  return entry.run;
}

describe("extension notices and session state", () => {
  it("folds an extension notice into a quiet row whose density mark follows its level", () => {
    const state = projectAll(emptyProjection, [
      at("extension.notice", { extension: "counter", level: "info", message: "counted 3" }),
      at("extension.notice", { extension: "lint", level: "warn", message: "slow" }),
      at("extension.notice", {
        extension: "lint",
        level: "error",
        message: "quarantined in activate: boom",
        detail: { phase: "activate" },
      }),
      at("extension.notice", {
        extension: "counter",
        level: "info",
        message: "replayed",
        replay: true,
      }),
    ]);
    expect(state.entries).toEqual([
      { kind: "notice", level: "info", text: "░ counter · counted 3" },
      { kind: "notice", level: "info", text: "▒ lint · slow" },
      {
        kind: "notice",
        level: "info",
        text: "█ lint · quarantined in activate: boom · phase activate",
      },
    ]);
    expect(state.lastError).toBeUndefined();
  });
});

describe("delegated children on the parent's transcript", () => {
  const delegate = (args: Record<string, unknown>, callId = "d1") =>
    ({ type: "tool-call", callId, name: "delegate", arguments: args }) as const;
  const usage = { inputTokens: 40, outputTokens: 9 };

  it("marks a delegate call as a child from its arguments, flattening and capping the title", () => {
    const long = `audit\n\tthe ${"trust ".repeat(20)}rules`;
    const state = projectAll(emptyProjection, [
      at("tool.started", { call: delegate({ title: long, prompt: "p", bot: "scout" }) }),
      at("tool.started", { call: delegate({ prompt: "p" }, "d2") }),
      at("tool.started", { call }),
    ]);
    const titled = runOf(state, 0).child;
    expect(titled?.title).toHaveLength(60);
    expect(titled?.title.startsWith("audit the trust trust")).toBe(true);
    expect(titled?.title.endsWith("…")).toBe(true);
    expect(titled?.bot).toBe("scout");
    expect(runOf(state, 1).child?.title).toBe("child");
    expect(runOf(state, 2).child).toBeUndefined();
  });

  it("takes the server's title, id, outcome, usage, cost and refusals from the child events", () => {
    const state = projectAll(emptyProjection, [
      at("tool.started", { call: delegate({ title: "draft", prompt: "p" }) }),
      at("child.started", {
        callId: "d1",
        sessionId: "k1",
        title: "find the callers",
        bot: "scout",
      }),
      at("tool.output", { chunk: "read src/a.ts\n", callId: "d1" }),
    ]);
    expect(runOf(state, 0)).toMatchObject({
      live: "read src/a.ts",
      child: { title: "find the callers", sessionId: "k1", bot: "scout", outcome: undefined },
    });
    const refused = [{ tool: "bash", callId: "c9" }];
    const ended = projectAll(state, [
      at("child.finished", {
        callId: "d1",
        sessionId: "k1",
        outcome: "denied",
        usage,
        costNanos: 3_100_000,
        refused,
      }),
      at("tool.finished", {
        callId: "d1",
        output:
          "↳ child k1 · scout · denied\n\nthe child stopped at a call no one could approve: bash",
        isError: true,
      }),
    ]);
    expect(runOf(ended, 0)).toMatchObject({
      phase: "failed",
      reason: undefined,
      detail: ["the child stopped at a call no one could approve: bash"],
      child: { outcome: "denied", usage, costNanos: 3_100_000, refused },
    });
  });

  it("keeps a delegate refused before any child existed a plain failure with its reason", () => {
    const state = projectAll(emptyProjection, [
      at("tool.started", { call: delegate({ title: "scout it", prompt: "p", bot: "ghost" }) }),
      at("tool.finished", {
        callId: "d1",
        output: "no bot named ghost · bots here: scout",
        isError: true,
      }),
    ]);
    expect(runOf(state, 0)).toMatchObject({
      phase: "failed",
      reason: "no bot named ghost · bots here: scout",
      child: { title: "scout it", sessionId: undefined, outcome: undefined },
    });
  });
});

describe("memory decisions", () => {
  const recall: MemoryDecision = {
    id: "m1",
    question: "action-relevance@1",
    about: { kind: "call", callId: "c1" },
    candidates: ["Shell Echo"],
    choice: { kept: ["Shell Echo"], dropped: [] },
    decider: "builtin",
    rule: '[[Shell Echo]] shares "echo" with the command',
    latencyMs: 2,
  };

  it("finds a settled call for a decision the journal replays after the turn", () => {
    const settled = projectAll(emptyProjection, [
      at("tool.started", { call, replay: true }),
      at("tool.finished", { callId: "c1", output: "hi", isError: false, replay: true }),
    ]);
    const replayed = project(settled, at("memory.decided", { decision: recall, replay: true }));
    expect(runOf(replayed, 0).recall?.id).toBe("m1");
  });

  it("holds one record per decision id when a replay repeats a decision it already has", () => {
    const state = projectAll(emptyProjection, [
      at("memory.decided", { decision: recall }),
      at("memory.decided", { decision: { ...recall, latencyMs: 3 }, replay: true }),
    ]);
    expect(state.memoryDecisions).toEqual([{ ...recall, latencyMs: 3 }]);
  });
});
