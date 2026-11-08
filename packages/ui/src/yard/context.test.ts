import type { BusEnvelope } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { keeperSpokeAfter } from "./context.ts";

describe("when the keeper last spoke", () => {
  it("takes the keeper's own turns per thread and ignores creature, external and replayed ones", () => {
    const batch: BusEnvelope[] = [
      turn(1, "s1", "2026-11-08T09:00:00.000Z"),
      turn(2, "s1", "2026-11-08T09:01:00.000Z"),
      turn(3, "s2", "2026-11-08T09:02:00.000Z", { origin: { kind: "external", client: "cli" } }),
      turn(4, "s3", "2026-11-08T09:03:00.000Z", { replay: true }),
      turn(5, "s4", "2026-11-08T09:04:00.000Z", {
        origin: { kind: "creature", creature: "wren", thread: "s1" },
      }),
    ];
    expect(keeperSpokeAfter({}, batch)).toEqual({ s1: Date.parse("2026-11-08T09:01:00.000Z") });
  });

  it("keeps the record as it was when a batch holds nothing the keeper said", () => {
    const held = { s1: 1 };
    expect(keeperSpokeAfter(held, [])).toBe(held);
  });
});

function turn(
  id: number,
  sessionId: string,
  ts: string,
  extra: Record<string, unknown> = {},
): BusEnvelope {
  return {
    id,
    ts,
    sessionId,
    type: "turn.started",
    payload: { userText: "hello", ...extra },
  } as BusEnvelope;
}
