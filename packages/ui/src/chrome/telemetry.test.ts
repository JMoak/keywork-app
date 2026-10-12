import { emptyProjection, projectAll } from "@keywork-app/client";
import type { BusEnvelope, CostReport } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import recordedAnswers from "../../../client/src/fixtures/controls.json";
import { liveTurnsOnly, telemetry } from "./telemetry.ts";

const recordedCost = recordedAnswers.cost.body as CostReport;

const liveTurn: BusEnvelope = {
  id: 1,
  ts: "2026-09-07T12:00:00.000Z",
  sessionId: "s1",
  type: "turn.completed",
  payload: {
    message: { role: "assistant", parts: [{ type: "text", text: "done" }] },
    usage: { inputTokens: 200_000, outputTokens: 10_000, costUsd: 0.0492 },
  },
};

describe("telemetry", () => {
  it("speaks the server's whole-session report when it has one, whatever this window saw", () => {
    const watched = projectAll(emptyProjection, [liveTurn]);
    expect(telemetry(watched, recordedCost)).toBe("17 tokens · unpriced");
    expect(telemetry(emptyProjection, recordedCost)).toBe("17 tokens · unpriced");
  });

  it("names a count of only the turns streamed into this window as exactly that", () => {
    const watched = projectAll(emptyProjection, [liveTurn]);
    expect(telemetry(watched)).toBe(`210k tokens · $0.0492 · ${liveTurnsOnly}`);
  });

  it("says nothing before a turn has been seen or reported", () => {
    expect(telemetry(emptyProjection)).toBe("");
  });
});
