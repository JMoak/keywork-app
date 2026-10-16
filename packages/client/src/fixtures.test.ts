import { readFile } from "node:fs/promises";
import type {
  BusEnvelope,
  ContextReport,
  CostReport,
  Redone,
  SessionDetail,
  SessionEntries,
  SessionSummary,
  TurnRestored,
  Undone,
} from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { coalesceEnvelopes } from "./projection/coalesce.ts";
import { sessionControls } from "./projection/controls.ts";
import { historyEnvelopes } from "./projection/history.ts";
import { childStateOf, lineageOfProjection } from "./projection/lineage.ts";
import { projectAll } from "./projection/project.ts";
import { toolRowText } from "./projection/tool-row.ts";
import { emptyProjection, type SessionProjection, type ToolRun } from "./projection/types.ts";
import { envelopeOf, sseFrames } from "./sse.ts";

const fixture = (name: string): URL => new URL(`./fixtures/${name}`, import.meta.url);

async function envelopes(name: string): Promise<BusEnvelope[]> {
  const text = await readFile(fixture(`${name}.jsonl`), "utf8");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as BusEnvelope);
}

async function projected(name: string): Promise<SessionProjection> {
  return projectAll(emptyProjection, await envelopes(name));
}

function toolRun(state: SessionProjection, index: number): ToolRun {
  const entry = state.entries[index];
  if (entry?.kind !== "tool") throw new Error(`entry ${index} is ${entry?.kind}`);
  return entry.run;
}

describe("fixtures recorded from keywork serve", () => {
  it("plain: one prompt, one settled answer, priced usage counted once", async () => {
    const state = await projected("plain");
    expect(state.entries).toEqual([
      { kind: "user", text: "say hello", replay: false },
      { kind: "assistant", text: "Hello from keywork.", replay: false, settled: true },
    ]);
    expect(state.usage).toMatchObject({
      inputTokens: 12,
      outputTokens: 5,
      lastTurnContextTokens: 12,
      turns: 1,
      unpricedTurns: 1,
    });
    expect(state.turn).toBeUndefined();
    expect(state.lastEventId).toBe(6);
  });

  it("thinking: visible thinking folds into one entry ahead of the answer", async () => {
    const state = await projected("thinking");
    expect(state.entries.map((entry) => entry.kind)).toEqual(["user", "thinking", "assistant"]);
    expect(state.entries[1]).toMatchObject({ text: "Two files changed; the second one matters." });
    expect(state.entries[2]).toMatchObject({
      text: "The change is in `layout.ts`.",
      settled: true,
    });
  });

  it("tool: the wire fires tool.started before the policy grant, tails output, and settles with a duration", async () => {
    const stream = await envelopes("tool");
    expect(stream.map((envelope) => envelope.type).slice(2, 7)).toEqual([
      "turn.delta",
      "turn.delta",
      "tool.started",
      "gate.permission",
      "tool.output",
    ]);
    const state = projectAll(emptyProjection, stream);
    expect(state.entries.map((entry) => entry.kind)).toEqual(["user", "tool", "assistant"]);
    const run = toolRun(state, 1);
    expect(run).toMatchObject({
      phase: "done",
      subject: "echo served",
      durationMs: 1250,
      outputChars: 6,
      detail: ["served"],
      decision: { verdict: "granted", gate: "policy" },
    });
    expect(toolRowText(run)).toBe("bash echo served · 1.3s · done");
    expect(state.running).toEqual({});
  });

  it("decided: recall decides after the grant and before it injects, and each decision rides its call", async () => {
    const stream = await envelopes("decided");
    const types = stream.map((envelope) => envelope.type);
    const first = types.indexOf("memory.decided");
    expect(types.slice(first - 1, first + 3)).toEqual([
      "gate.permission",
      "memory.decided",
      "context.injected",
      "tool.finished",
    ]);
    const state = projectAll(emptyProjection, stream);
    expect(state.entries.map((entry) => entry.kind)).toEqual(["user", "tool", "tool", "assistant"]);
    expect(state.memoryDecisions.map((decision) => decision.choice)).toEqual([
      { kept: ["Layout Rects"], dropped: [] },
      { kept: [], dropped: ["Layout Rects"] },
    ]);
    expect(state.memoryDecisions.every((decision) => decision.decider === "builtin")).toBe(true);
    expect(toolRowText(toolRun(state, 1))).toBe(
      'write src/layout/rects.ts · 1.0s · done · recalled [[Layout Rects]] · shares "layout", "rects" with the path',
    );
    expect(toolRun(state, 2).recall?.rule).toBe("[[Layout Rects]] was already surfaced");
    expect(toolRowText(toolRun(state, 2))).not.toContain("recalled");
  });

  it("delegated: the child rides the parent's delegate call and its result names the child first", async () => {
    const stream = await envelopes("delegated");
    expect(stream.map((envelope) => envelope.type).slice(4, 9)).toEqual([
      "tool.started",
      "gate.permission",
      "child.started",
      "child.finished",
      "tool.finished",
    ]);
    expect(stream.every((envelope) => envelope.sessionId === "s1")).toBe(true);
    const working = toolRun(projectAll(emptyProjection, stream.slice(0, 7)), 1);
    expect(working.child).toMatchObject({
      title: "audit the trust rules",
      sessionId: "q1",
      bot: "researcher",
      outcome: undefined,
    });
    expect(childStateOf(working)).toBe("running");
    const state = projectAll(emptyProjection, stream);
    const run = toolRun(state, 1);
    expect(run).toMatchObject({
      name: "delegate",
      phase: "done",
      reason: undefined,
      detail: ["Two rules allow more than they say."],
      child: {
        sessionId: "q1",
        bot: "researcher",
        outcome: "completed",
        usage: { inputTokens: 12, outputTokens: 5 },
        costNanos: undefined,
        refused: undefined,
      },
    });
    expect(childStateOf(run)).toBe("completed");
    expect(state.entries.at(-1)).toMatchObject({ text: "The researcher found two loose rules." });
  });

  it("denied: an unanswered ask arrives as tool.started, the ask, the timed-out denial, then an error result", async () => {
    const stream = await envelopes("denied");
    expect(stream.map((envelope) => envelope.type).slice(4, 8)).toEqual([
      "tool.started",
      "gate.ask",
      "gate.permission",
      "tool.finished",
    ]);
    const asking = projectAll(emptyProjection, stream.slice(0, 6));
    expect(toolRun(asking, 1)).toMatchObject({ phase: "asking", ask: { rule: "default" } });
    expect(toolRowText(toolRun(asking, 1))).toBe("bash echo served · waiting for your answer");
    const state = projectAll(emptyProjection, stream);
    const run = toolRun(state, 1);
    expect(run.phase).toBe("refused");
    expect(run.decision).toEqual({
      tool: "bash",
      callId: "c1",
      verdict: "denied",
      gate: "headless",
    });
    expect(toolRowText(run)).toBe("bash echo served · refused · no one answered");
    expect(run.detail).toEqual([
      "not approved: this run has no one to ask, so the call was refused",
    ]);
    expect(state.entries.at(-1)).toMatchObject({ kind: "assistant", text: "I could not run it." });
  });

  it("asked-granted: answering yes lets the tool run under a user gate", async () => {
    const stream = await envelopes("asked-granted");
    const run = toolRun(projectAll(emptyProjection, stream), 1);
    expect(run).toMatchObject({
      phase: "done",
      ask: undefined,
      decision: { verdict: "granted", gate: "user" },
      durationMs: 1250,
      waitedMs: 250,
      askedAt: undefined,
    });
    expect(toolRowText(run)).toBe("bash echo served · 1.3s · waited 250ms · done");
  });

  it("asked-denied: answering no refuses the call with the user's reason", async () => {
    const stream = await envelopes("asked-denied");
    const state = projectAll(emptyProjection, stream);
    const run = toolRun(state, 1);
    expect(run).toMatchObject({ phase: "refused", decision: { verdict: "denied", gate: "user" } });
    expect(toolRowText(run)).toBe("bash echo served · refused · you said no");
    expect(state.entries.at(-1)).toMatchObject({
      kind: "assistant",
      text: "Understood, I will not.",
    });
  });

  it("interrupt: the partial answer stays and the turn ends with a notice", async () => {
    const state = await projected("interrupt");
    expect(state.entries).toEqual([
      { kind: "user", text: "wait forever", replay: false },
      { kind: "assistant", text: "Working on it", replay: false, settled: true },
      { kind: "notice", level: "info", text: "· interrupted" },
    ]);
    expect(state.turn).toBeUndefined();
    expect(state.usage.turns).toBe(0);
  });

  it("queued: a second prompt waits in the queue and runs as its own turn afterwards", async () => {
    const stream = await envelopes("queued");
    const midway = projectAll(emptyProjection, stream.slice(0, 4));
    expect(midway.queue).toEqual([{ id: "q1", text: "second", behavior: "queue" }]);
    expect(midway.turn?.userText).toBe("first");
    const state = projectAll(midway, stream.slice(4));
    expect(state.queue).toEqual([]);
    expect(
      state.entries.map((entry) => (entry.kind === "tool" ? entry.run.name : entry.text)),
    ).toEqual(["first", "First answer, finished.", "second", "Second answer."]);
    expect(state.usage.turns).toBe(2);
  });

  it("injected: a prompt from another client queues with its origin and runs as its own turn", async () => {
    const stream = await envelopes("injected");
    const origin = { kind: "external", client: "wispr-flow" };
    const midway = projectAll(emptyProjection, stream.slice(0, 4));
    expect(midway.queue).toEqual([{ id: "q1", text: "second", behavior: "queue", origin }]);
    expect(midway.turn).toMatchObject({ userText: "first" });
    expect(midway.turn?.origin).toBeUndefined();
    const state = projectAll(midway, stream.slice(4));
    expect(state.queue).toEqual([]);
    expect(state.entries[2]).toEqual({ kind: "user", text: "second", origin, replay: false });
    expect(state.usage.turns).toBe(2);
  });

  it("every fixture projects identically whether or not deltas are coalesced per frame", async () => {
    for (const name of [
      "plain",
      "thinking",
      "tool",
      "denied",
      "asked-granted",
      "asked-denied",
      "interrupt",
      "queued",
      "injected",
      "controls",
      "delegated",
      "restored",
      "decided",
    ]) {
      const stream = await envelopes(name);
      expect(projectAll(emptyProjection, coalesceEnvelopes(stream)), name).toEqual(
        projectAll(emptyProjection, stream),
      );
    }
  });

  it("every fixture snapshot stays stable", async () => {
    for (const name of [
      "plain",
      "thinking",
      "tool",
      "denied",
      "asked-granted",
      "asked-denied",
      "interrupt",
      "queued",
      "injected",
      "controls",
      "delegated",
      "restored",
      "decided",
    ]) {
      expect(await projected(name)).toMatchSnapshot(name);
    }
  });
});

describe("controls recorded from K1's session verbs", () => {
  interface Answer<Body> {
    status: number;
    body: Body;
  }

  async function answers(): Promise<Record<string, Answer<unknown>>> {
    return JSON.parse(await readFile(fixture("controls.json"), "utf8"));
  }

  it("folds each session.state into the projection's standing, whole rather than merged", async () => {
    const stream = await envelopes("controls");
    const states = stream.filter((envelope) => envelope.type === "session.state");
    expect(states).toHaveLength(7);
    const afterThinking = projectAll(emptyProjection, stream.slice(0, 8));
    expect(afterThinking.standing).toMatchObject({ model: "mock/beta", thinking: true });
    expect(afterThinking.standing?.effort).toBeUndefined();
    const undone = projectAll(emptyProjection, stream.slice(0, 11));
    expect(undone.standing).toMatchObject({ leafId: null, undoable: false, redoable: true });
    const state = await projected("controls");
    expect(state.standing).toEqual({
      model: "mock/beta",
      thinking: true,
      effort: "high",
      title: "Lights",
      leafId: null,
      undoable: false,
      redoable: true,
    });
  });

  it("carries the preset switch on every live session's stream", async () => {
    const preset = (await envelopes("controls")).find(
      (envelope) => envelope.type === "gate.preset",
    );
    expect(preset).toMatchObject({ sessionId: "s1", payload: { from: "standard", to: "open" } });
  });

  it("seeds the same controls from the session summary before any event arrives", async () => {
    const recorded = await answers();
    const listed = recorded.sessions as Answer<{ sessions: SessionSummary[] }>;
    const summary = listed.body.sessions[0];
    expect(sessionControls(summary, emptyProjection)).toEqual({
      model: "mock/beta",
      thinking: true,
      effort: "high",
      title: "Lights",
      leafId: undefined,
      undoable: undefined,
      redoable: undefined,
      basis: "summary",
    });
    expect(sessionControls(summary, await projected("controls"))).toMatchObject({
      basis: "reported",
      undoable: false,
      redoable: true,
    });
  });

  it("answers undo with the prompt text and refuses a second undo as nothing to undo", async () => {
    const recorded = await answers();
    expect((recorded.undo as Answer<Undone>).body).toMatchObject({
      prompt: { text: "turn on the lights" },
      undoable: false,
      redoable: true,
    });
    expect(recorded.undoAgain).toEqual({ status: 404, body: { error: "nothing to undo" } });
    expect(recorded.redo).toEqual({ status: 404, body: { error: "nothing to redo" } });
    expect(recorded.redoAgain).toEqual({ status: 404, body: { error: "nothing to redo" } });
  });

  it("refuses unknown words with 400 and loosening without confirmation with 409", async () => {
    const recorded = await answers();
    expect(recorded.modelUnknown).toMatchObject({
      status: 400,
      body: { failure: { code: "unknown-model", known: ["mock/alpha", "mock/beta"] } },
    });
    expect(recorded.effortUnknown?.status).toBe(400);
    expect(recorded.presetLoosening).toEqual({
      status: 409,
      body: { error: "loosening needs confirmed: true" },
    });
    expect(recorded.preset).toEqual({ status: 200, body: { from: "standard", to: "open" } });
  });

  it("reports cost per model and a context reading with its basis", async () => {
    const recorded = await answers();
    const cost = (recorded.cost as Answer<CostReport>).body;
    expect(cost.models.map((row) => [row.reference, row.turns])).toEqual([
      ["mock/alpha", 1],
      ["mock/beta", 0],
    ]);
    expect(cost.rollup.unpricedTurns).toBe(1);
    expect(recorded.context).toMatchObject({
      status: 200,
      body: { window: 200_000, declared: false, basis: "estimated" },
    });
  });

  it("splits the next request into parts that fill the window and draws both lines across them", async () => {
    const context = ((await answers()).context as Answer<ContextReport>).body;
    const { system, tools, injected, conversation, free } = context.parts;
    const parts = [system, tools, injected, conversation, free];
    expect(parts.reduce((sum, part) => sum + part.tokens, 0)).toBe(context.window);
    expect([system, tools, injected].map((part) => part.basis)).toEqual([
      "estimated",
      "estimated",
      "estimated",
    ]);
    const beyondConversation = system.tokens + tools.tokens + injected.tokens;
    expect(context.thresholds).toEqual({
      flushAt: context.flushAt + beyondConversation,
      compactAt: context.compactAt + beyondConversation,
    });
  });
});

describe("a turn restore recorded from the server", () => {
  interface Answer<Body> {
    status: number;
    body: Body;
  }

  interface Restore {
    restored: Answer<TurnRestored>;
    restoreUnknownTurn: Answer<{ error: string }>;
    restoreMalformed: Answer<{ error: string }>;
    redo: Answer<Redone>;
    entries: Answer<SessionEntries>;
  }

  const restore = async (): Promise<Restore> =>
    JSON.parse(await readFile(fixture("restored.json"), "utf8")) as Restore;

  it("hands back the turn's prompt, the turns it took off the path, and every file it put back", async () => {
    const { restored } = await restore();
    expect(restored).toEqual({
      status: 200,
      body: {
        turn: 1,
        prompt: { entryId: "q5", text: "write two lines to notes.txt" },
        leafId: "q3",
        undoneTurns: 2,
        files: [{ path: "notes.txt", added: 0, deleted: 2 }],
        filesNote: "files put back",
        undoable: true,
        redoable: true,
      },
    });
  });

  it("moves the leaf to the recorded entry, then reports the files that moved", async () => {
    const stream = await envelopes("restored");
    const moved = stream.findIndex((envelope) => envelope.type === "session.tree");
    expect(stream[moved]?.payload).toEqual({ reason: "leaf", entryId: "q3" });
    expect(stream[moved - 1]).toMatchObject({
      type: "session.state",
      payload: { leafId: "q3", redoable: true },
    });
    expect(stream.slice(moved)).toContainEqual(
      expect.objectContaining({
        type: "changes.updated",
        payload: { paths: ["notes.txt"], turn: 1 },
      }),
    );
  });

  it("refuses a turn off the path as 404 and a turn below one as 400, in the server's words", async () => {
    const { restoreUnknownTurn, restoreMalformed } = await restore();
    expect(restoreUnknownTurn).toEqual({
      status: 404,
      body: { error: "no turn 9 on this session's path" },
    });
    expect(restoreMalformed).toEqual({
      status: 400,
      body: { error: "the body must be { turn: a positive integer }" },
    });
  });

  it("stages the restore like an undo: redo takes it back and the log keeps both entries", async () => {
    const { redo, entries } = await restore();
    expect(redo).toEqual({
      status: 200,
      body: { restored: true, undoable: true, redoable: false },
    });
    const custom = entries.body.entries.flatMap((entry) =>
      entry.type === "custom" ? [[entry.id, entry.customType, entry.data]] : [],
    );
    expect(custom.slice(1)).toEqual([
      ["q3", "restore", { turn: 1, from: "q2", files: expect.any(String) }],
      ["q4", "restore-undone", { restore: "q3" }],
    ]);
    expect(entries.body.leafId).toBe("q4");
  });
});

describe("the raw SSE capture", () => {
  it.each(["plain", "controls"])(
    "%s.sse parses byte for byte into the jsonl envelopes",
    async (name) => {
      const raw = await readFile(fixture(`${name}.sse`));
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let at = 0; at < raw.length; at += 13) controller.enqueue(raw.subarray(at, at + 13));
          controller.close();
        },
      });
      const parsed: BusEnvelope[] = [];
      let connected = false;
      for await (const frame of sseFrames(body)) {
        if (frame.comments.includes("connected")) connected = true;
        const envelope = envelopeOf(frame);
        if (envelope !== undefined) parsed.push(envelope);
      }
      expect(connected).toBe(true);
      expect(parsed).toEqual(await envelopes(name));
    },
  );
});

describe("stored history", () => {
  it("replays GET /sessions/{id} into the same transcript the live tool stream produced", async () => {
    const detail = JSON.parse(
      await readFile(fixture("session-detail.json"), "utf8"),
    ) as SessionDetail;
    const replayed = projectAll(emptyProjection, historyEnvelopes(detail));
    const live = await projected("tool");
    expect(replayed.entries.map(shape)).toEqual(live.entries.map(shape));
    expect(toolRun(replayed, 1)).toMatchObject({
      replay: true,
      phase: "done",
      durationMs: undefined,
      decision: undefined,
    });
    expect(replayed.usage.turns).toBe(0);
  });
});

describe("lineage on the wire", () => {
  interface Answer<Body> {
    status: number;
    body: Body;
  }

  interface Delegated {
    parent: Answer<SessionDetail>;
    child: Answer<SessionDetail>;
    sessions: Answer<{ sessions: SessionSummary[] }>;
  }

  const delegated = async (): Promise<Delegated> =>
    JSON.parse(await readFile(fixture("delegated.json"), "utf8")) as Delegated;

  it("rebuilds the child row from the stored delegate result, since child events never replay", async () => {
    const { parent } = await delegated();
    const replayed = projectAll(emptyProjection, historyEnvelopes(parent.body));
    expect(toolRun(replayed, 1)).toMatchObject({
      replay: true,
      phase: "done",
      detail: ["Two rules allow more than they say."],
      child: { title: "audit the trust rules", sessionId: "q1", bot: "researcher" },
    });
    expect(lineageOfProjection({}, "s1", replayed)).toEqual({
      s1: [
        {
          sessionId: "q1",
          parentId: "s1",
          callId: "d1",
          title: "audit the trust rules",
          bot: "researcher",
          state: "completed",
          costNanos: undefined,
        },
      ],
    });
  });

  it("reads the child by id but lists only the parent, and names no parent on the child", async () => {
    const { child, sessions } = await delegated();
    expect(child.status).toBe(200);
    expect(child.body).toMatchObject({
      id: "q1",
      title: "audit the trust rules",
      bot: "researcher",
    });
    expect(Object.keys(child.body)).not.toContain("spawnedBy");
    expect(sessions.body.sessions.map((summary) => summary.id)).toEqual(["s1"]);
  });
});

function shape(entry: SessionProjection["entries"][number]): unknown {
  switch (entry.kind) {
    case "tool":
      return {
        kind: "tool",
        name: entry.run.name,
        subject: entry.run.subject,
        phase: entry.run.phase,
        detail: entry.run.detail,
      };
    case "notice":
      return { kind: "notice", text: entry.text };
    default:
      return { kind: entry.kind, text: entry.text };
  }
}
