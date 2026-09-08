import type { SessionDetail } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { historyEnvelopes } from "./history.ts";
import { projectAll } from "./project.ts";
import { emptyProjection } from "./types.ts";

const detail: SessionDetail = {
  id: "s1",
  title: "echo",
  createdAt: "2026-09-06T12:00:00.000Z",
  lastActivityAt: "2026-09-06T12:05:00.000Z",
  messageCount: 4,
  cwd: "/work",
  live: false,
  asOf: 12,
  messages: [
    { role: "user", parts: [{ type: "text", text: "echo one" }] },
    {
      role: "assistant",
      parts: [
        { type: "tool-call", callId: "c1", name: "bash", arguments: { command: "echo one" } },
      ],
    },
    {
      role: "tool",
      parts: [{ type: "tool-result", callId: "c1", output: "one\n", isError: false }],
    },
    {
      role: "assistant",
      parts: [
        { type: "visible-thinking", text: "ok" },
        { type: "text", text: "done" },
      ],
    },
  ],
};

describe("historyEnvelopes", () => {
  it("replays stored messages as replay-flagged envelopes that project like the live stream did", () => {
    const envelopes = historyEnvelopes(detail);
    expect(envelopes.every((envelope) => envelope.payload.replay === true)).toBe(true);
    expect(envelopes.map((envelope) => envelope.type)).toEqual([
      "turn.started",
      "turn.delta",
      "tool.started",
      "tool.finished",
      "turn.delta",
      "turn.delta",
      "turn.completed",
    ]);
    const state = projectAll(emptyProjection, envelopes);
    expect(state.entries.map((entry) => entry.kind)).toEqual([
      "user",
      "tool",
      "thinking",
      "assistant",
    ]);
    expect(state.entries[1]).toMatchObject({
      run: { phase: "done", replay: true, durationMs: undefined, detail: ["one"] },
    });
    expect(state.entries[3]).toMatchObject({ text: "done", settled: true, replay: true });
    expect(state.usage.turns).toBe(0);
    expect(state.turn).toBeUndefined();
  });

  it("gives replayed envelopes negative ids so they never advance the resume point", () => {
    const state = projectAll(emptyProjection, historyEnvelopes(detail));
    expect(state.lastEventId).toBeLessThan(0);
  });
});
