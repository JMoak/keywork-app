import type { BusEnvelope } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { parseJsonl, replayEnvelopes } from "./replay.ts";

const stream: BusEnvelope[] = [
  { id: 1, ts: "t", sessionId: "s1", type: "turn.started", payload: { userText: "go" } },
  {
    id: 2,
    ts: "t",
    sessionId: "s1",
    type: "turn.delta",
    payload: { delta: { type: "text", text: "a" } },
  },
  { id: 3, ts: "t", sessionId: "s1", type: "tool.output", payload: { chunk: "x" } },
];

describe("replayEnvelopes", () => {
  it("delivers every envelope in order with a cadence shaped by the event type", async () => {
    const delays: number[] = [];
    const seen: number[] = [];
    const replay = replayEnvelopes(stream, (envelope) => seen.push(envelope.id), {
      cadenceMs: 10,
      schedule: (run, delay) => {
        delays.push(delay);
        run();
        return () => {};
      },
    });
    await replay.done;
    expect(seen).toEqual([1, 2, 3]);
    expect(delays).toEqual([80, 10, 5]);
  });

  it("stops between envelopes when asked", async () => {
    const seen: number[] = [];
    let resume: () => void = () => {};
    const replay = replayEnvelopes(stream, (envelope) => seen.push(envelope.id), {
      schedule: (run) => {
        resume = run;
        return () => {
          resume = () => {};
        };
      },
    });
    replay.stop();
    resume();
    await replay.done;
    expect(seen).toEqual([1]);
  });

  it("parses jsonl and skips blank lines", () => {
    expect(parseJsonl(`${JSON.stringify(stream[0])}\n\n${JSON.stringify(stream[1])}\n`)).toEqual([
      stream[0],
      stream[1],
    ]);
  });
});
