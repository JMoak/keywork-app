import { readFile } from "node:fs/promises";
import type { BusEnvelope, SessionDetail } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { coalesceEnvelopes } from "./projection/coalesce.ts";
import { historyEnvelopes } from "./projection/history.ts";
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
      turns: 1,
      unpricedTurns: 1,
    });
    expect(state.turn).toBeUndefined();
    expect(state.lastEventId).toBe(4);
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
    expect(stream.map((envelope) => envelope.type).slice(1, 6)).toEqual([
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

  it("denied: a headless refusal arrives as tool.started, then the denial, then an error result", async () => {
    const stream = await envelopes("denied");
    expect(stream.map((envelope) => envelope.type).slice(3, 6)).toEqual([
      "tool.started",
      "gate.permission",
      "tool.finished",
    ]);
    const state = projectAll(emptyProjection, stream);
    const run = toolRun(state, 1);
    expect(run.phase).toBe("refused");
    expect(run.decision).toEqual({
      tool: "bash",
      callId: "c1",
      verdict: "denied",
      gate: "headless",
    });
    expect(toolRowText(run)).toBe("bash echo served · refused · no one to ask");
    expect(run.detail).toEqual([
      "not approved: this run has no one to ask, so the call was refused",
    ]);
    expect(state.entries.at(-1)).toMatchObject({ kind: "assistant", text: "I could not run it." });
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
    const midway = projectAll(emptyProjection, stream.slice(0, 3));
    expect(midway.queue).toEqual([{ id: "q1", text: "second", behavior: "queue" }]);
    expect(midway.turn?.userText).toBe("first");
    const state = projectAll(midway, stream.slice(3));
    expect(state.queue).toEqual([]);
    expect(
      state.entries.map((entry) => (entry.kind === "tool" ? entry.run.name : entry.text)),
    ).toEqual(["first", "First answer, finished.", "second", "Second answer."]);
    expect(state.usage.turns).toBe(2);
  });

  it("every fixture projects identically whether or not deltas are coalesced per frame", async () => {
    for (const name of ["plain", "thinking", "tool", "denied", "interrupt", "queued"]) {
      const stream = await envelopes(name);
      expect(projectAll(emptyProjection, coalesceEnvelopes(stream)), name).toEqual(
        projectAll(emptyProjection, stream),
      );
    }
  });

  it("every fixture snapshot stays stable", async () => {
    for (const name of ["plain", "thinking", "tool", "denied", "interrupt", "queued"]) {
      expect(await projected(name)).toMatchSnapshot(name);
    }
  });
});

describe("the raw SSE capture", () => {
  it("parses byte for byte into the same envelopes the jsonl fixture holds", async () => {
    const raw = await readFile(fixture("plain.sse"));
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
    expect(parsed).toEqual(await envelopes("plain"));
  });
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
