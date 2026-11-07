import { describe, expect, it } from "vitest";
import type { SignalMessage } from "./messages.ts";
import {
  connected,
  type Direction,
  newSession,
  type Phase,
  type Role,
  type SignalSession,
  type Step,
  step,
} from "./session.ts";
import { grantA, sessionA, signal } from "./testing.ts";

function walk(role: Role, moves: ReadonlyArray<[Direction, SignalMessage] | "connected">) {
  let session: SignalSession = newSession(role, sessionA);
  const phases: Phase[] = [];
  for (const move of moves) {
    if (move === "connected") session = connected(session);
    else session = expectOk(step(session, move[0], move[1]));
    phases.push(session.phase);
  }
  return { session, phases };
}

function expectOk(result: Step): SignalSession {
  if (!result.ok) throw new Error(result.problem);
  return result.session;
}

describe("the viewer's signaling state machine", () => {
  it("asks, is granted, answers the offer, trickles candidates and goes live", () => {
    const { session, phases } = walk("viewer", [
      ["out", signal.request()],
      ["in", signal.granted()],
      ["in", signal.offer()],
      ["in", signal.candidate()],
      ["out", signal.answer()],
      ["out", signal.candidate()],
      "connected",
      ["out", signal.keepalive()],
      ["out", signal["switch-display"]()],
      ["in", signal.displays()],
      ["in", signal.end({ grantId: grantA, reason: "local-user" })],
    ]);
    expect(phases).toEqual([
      "asking",
      "awaiting-offer",
      "answering",
      "answering",
      "connecting",
      "connecting",
      "live",
      "live",
      "live",
      "live",
      "ended",
    ]);
    expect(session.endReason).toBe("local-user");
    expect(session.grantId).toBe(grantA);
  });

  it("ends on a denial and refuses everything after", () => {
    const { session } = walk("viewer", [
      ["out", signal.request()],
      ["in", signal.denied({ reason: "timed-out" })],
    ]);
    expect(session.phase).toBe("ended");
    expect(session.endReason).toBe("denied");
    expect(step(session, "in", signal.offer())).toMatchObject({ ok: false });
  });
});

describe("the sharer's signaling state machine", () => {
  it("consents, grants, offers, takes the answer and goes live", () => {
    const { phases } = walk("sharer", [
      ["in", signal.request()],
      ["out", signal.granted()],
      ["out", signal.offer()],
      ["out", signal.candidate()],
      ["in", signal.answer()],
      ["in", signal.candidate()],
      "connected",
      ["in", signal.keepalive()],
      ["in", signal["switch-display"]()],
      ["out", signal.displays()],
      ["out", signal.end({ reason: "kill-switch" })],
    ]);
    expect(phases).toEqual([
      "consenting",
      "offering",
      "awaiting-answer",
      "awaiting-answer",
      "connecting",
      "connecting",
      "live",
      "live",
      "live",
      "live",
      "ended",
    ]);
  });
});

describe("step order", () => {
  it.each<[string, Role, ReadonlyArray<[Direction, SignalMessage]>, [Direction, SignalMessage]]>([
    ["an offer before any grant", "viewer", [["out", signal.request()]], ["in", signal.offer()]],
    ["a grant nobody asked for", "viewer", [], ["in", signal.granted()]],
    [
      "a candidate before the offer",
      "viewer",
      [
        ["out", signal.request()],
        ["in", signal.granted()],
      ],
      ["in", signal.candidate()],
    ],
    [
      "a display switch before the stream is live",
      "viewer",
      [
        ["out", signal.request()],
        ["in", signal.granted()],
        ["in", signal.offer()],
        ["out", signal.answer()],
      ],
      ["out", signal["switch-display"]()],
    ],
    ["an offer before consent", "sharer", [["in", signal.request()]], ["out", signal.offer()]],
    [
      "an answer before the offer",
      "sharer",
      [
        ["in", signal.request()],
        ["out", signal.granted()],
      ],
      ["in", signal.answer()],
    ],
    ["a second request", "sharer", [["in", signal.request()]], ["in", signal.request()]],
    [
      "a viewer candidate before its answer",
      "sharer",
      [
        ["in", signal.request()],
        ["out", signal.granted()],
        ["out", signal.offer()],
      ],
      ["in", signal.candidate()],
    ],
    [
      "a message carrying another grant",
      "sharer",
      [
        ["in", signal.request()],
        ["out", signal.granted()],
        ["out", signal.offer()],
      ],
      ["in", signal.answer({ grantId: "grant-zzzz-9999" })],
    ],
    [
      "a message for another session",
      "sharer",
      [["in", signal.request()]],
      ["out", signal.granted({ sessionId: "session-other-01" })],
    ],
  ])("refuses %s", (_name, role, before, attempt) => {
    const { session } = walk(role, before);
    const result = step(session, attempt[0], attempt[1]);
    expect(result.ok).toBe(false);
    expect(session.phase).not.toBe("ended");
  });

  it("never lets a phase be skipped: only the next phase is reachable from each", () => {
    const reachable: Record<Role, Partial<Record<Phase, Phase[]>>> = { viewer: {}, sharer: {} };
    const everything: Array<[Direction, SignalMessage]> = (["in", "out"] as const).flatMap(
      (direction) =>
        Object.values(signal)
          .filter((build) => build !== signal.end)
          .map((build): [Direction, SignalMessage] => [direction, build()]),
    );
    const phases: Phase[] = [
      "idle",
      "asking",
      "consenting",
      "awaiting-offer",
      "answering",
      "offering",
      "awaiting-answer",
      "connecting",
      "live",
    ];
    for (const role of ["viewer", "sharer"] as const) {
      for (const phase of phases) {
        const session: SignalSession = { role, sessionId: sessionA, phase, grantId: grantA };
        const next = everything.flatMap(([direction, message]) => {
          const result = step(session, direction, message);
          return result.ok && result.session.phase !== phase ? [result.session.phase] : [];
        });
        reachable[role][phase] = [...new Set(next)].sort();
      }
    }
    expect(reachable).toEqual({
      viewer: {
        idle: ["asking"],
        asking: ["awaiting-offer", "ended"],
        consenting: [],
        "awaiting-offer": ["answering"],
        answering: ["connecting"],
        offering: [],
        "awaiting-answer": [],
        connecting: [],
        live: [],
      },
      sharer: {
        idle: ["consenting"],
        asking: [],
        consenting: ["ended", "offering"],
        "awaiting-offer": [],
        answering: [],
        offering: ["awaiting-answer"],
        "awaiting-answer": ["connecting"],
        connecting: [],
        live: [],
      },
    });
  });

  it("goes live only from connecting", () => {
    expect(connected(newSession("viewer", sessionA)).phase).toBe("idle");
  });
});
