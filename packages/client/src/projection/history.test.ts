import type { SessionDetail } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { historyEnvelopes, replayBase } from "./history.ts";
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

  it("keeps a framed prompt, the creature's own instructions, out of the transcript, live and after a reload", () => {
    const frame = "You are Vey, the keeper's creature, and this is your first thread.";
    const origin = { kind: "creature", creature: "vey", thread: "s2" } as const;
    const introduced: SessionDetail = {
      ...detail,
      id: "s2",
      messages: [
        { role: "user", parts: [{ type: "text", text: frame }] },
        { role: "assistant", parts: [{ type: "text", text: "I am Vey." }] },
      ],
      reports: [
        { index: 0, entryId: "e1", at: detail.createdAt, text: frame, origin, kind: "frame" },
      ],
    };
    const reloaded = projectAll(emptyProjection, historyEnvelopes(introduced));
    expect(reloaded.entries.map((entry) => entry.kind)).toEqual(["assistant"]);
    const live = projectAll(emptyProjection, [
      {
        id: 1,
        ts: detail.createdAt,
        sessionId: "s2",
        type: "extension.notice",
        payload: {
          extension: "creature",
          level: "info",
          message: frame,
          detail: { origin, kind: "frame" },
        },
      },
      {
        id: 2,
        ts: detail.createdAt,
        sessionId: "s2",
        type: "turn.started",
        payload: { userText: frame, entryId: "e2", origin },
      },
    ]);
    expect(live.entries).toEqual([]);
    expect(live.turn).toMatchObject({ userText: frame, origin });
  });

  it("replays how each turn ended after its last message, so a reload keeps failures and stops", () => {
    const said = (role: "user" | "assistant", text: string) =>
      ({ role, parts: [{ type: "text", text }] }) as const;
    const ended: SessionDetail = {
      ...detail,
      messages: [
        said("user", "fail the provider fell over"),
        said("user", "slow"),
        said("assistant", "Starting to answer and then"),
        said("user", "slow 300 100"),
        said("user", "say hello"),
        said("assistant", "Hello."),
      ],
      outcomes: [
        { index: 0, entryId: "p1", outcome: "failed", error: "the provider fell over" },
        { index: 1, entryId: "p2", outcome: "interrupted" },
        { index: 3, entryId: "p3", outcome: "shutdown" },
        { index: 4, entryId: "p4", outcome: "completed" },
      ],
    };
    const state = projectAll(replayBase(ended), historyEnvelopes(ended));
    const line = (entry: (typeof state.entries)[number]) =>
      entry.kind === "ending" ? `${entry.outcome}: ${entry.text} ← ${entry.prompt}` : entry.kind;
    expect(state.entries.map(line)).toEqual([
      "user",
      "failed: the provider fell over ← fail the provider fell over",
      "user",
      "assistant",
      "interrupted: interrupted ← slow",
      "user",
      "shutdown: the server stopped while this turn ran ← slow 300 100",
      "user",
      "assistant",
    ]);
    expect(state.entries[0]).toMatchObject({ kind: "user", entryId: "p1" });
    expect(state.entries.every((entry) => entry.kind !== "ending" || entry.replay)).toBe(true);
  });

  it("treats a turn with no mark as unknown, never as a failure", () => {
    const unmarked: SessionDetail = { ...detail, outcomes: [] };
    const state = projectAll(replayBase(unmarked), historyEnvelopes(unmarked));
    expect(state.entries.some((entry) => entry.kind === "ending")).toBe(false);
  });

  it("gives replayed envelopes negative ids so they never advance the resume point", () => {
    const state = projectAll(emptyProjection, historyEnvelopes(detail));
    expect(state.lastEventId).toBeLessThan(0);
  });
});
