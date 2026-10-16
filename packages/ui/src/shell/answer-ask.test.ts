import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import type {
  AnswerOutcome,
  AskScope,
  AskVerdict,
  BusEnvelope,
  PermissionRule,
} from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  type AskAnswering,
  answerHeldAsk,
  askingRun,
  nothingAsking,
  onceOnlyNotice,
} from "./answer-ask.ts";

describe("one answer path for the card's chords and the desk's keys", () => {
  it("finds the asking run in a session, or the one with the call it holds", () => {
    const projection = asking(["c1", "c2"]);
    expect(askingRun(projection)?.callId).toBe("c1");
    expect(askingRun(projection, "c2")?.callId).toBe("c2");
    expect(askingRun(projection, "gone")).toBeUndefined();
    expect(askingRun(emptyProjection)).toBeUndefined();
  });

  it("sends the choice the card would send, with the session's quiet posture", async () => {
    const plain = answering(asking(["c1"], [bunTest]));
    expect(await answerHeldAsk(plain, { sessionId: "s1" }, "approve")).toBeUndefined();
    const quiet = answering(asking(["c1"], [bunTest]), ["s1"]);
    await answerHeldAsk(quiet, { sessionId: "s1", callId: "c1" }, "approve");
    await answerHeldAsk(quiet, { sessionId: "s1", callId: "c1" }, "once");
    await answerHeldAsk(quiet, { sessionId: "s1", callId: "c1" }, "deny");
    expect([...plain.sent, ...quiet.sent]).toEqual([
      ["c1", "granted", undefined],
      ["c1", "granted", "session"],
      ["c1", "granted", undefined],
      ["c1", "denied", undefined],
    ]);
  });

  it("says why it sent nothing: no ask held, or an ask nothing could remember", async () => {
    const held = answering(asking(["c1"]));
    expect(await answerHeldAsk(held, { sessionId: "s1", callId: "gone" }, "approve")).toBe(
      nothingAsking,
    );
    expect(await answerHeldAsk(held, { sessionId: "s1" }, "workspace")).toBe(onceOnlyNotice("y"));
    expect(onceOnlyNotice("ctrl+y")).toBe(
      "this ask can only be answered once · ctrl+y approves it",
    );
    expect(held.sent).toEqual([]);
  });

  it("passes the server's refusal and a failed request on in their own words", async () => {
    const refused = answering(asking(["c1"], [bunTest]), [], {
      refused: "nothing-to-remember",
      detail: "keywork remembers nothing for this call",
    });
    expect(await answerHeldAsk(refused, { sessionId: "s1" }, "session")).toBe(
      "keywork remembers nothing for this call",
    );
    const broken = answering(asking(["c1"]), [], new Error("the server went away"));
    expect(await answerHeldAsk(broken, { sessionId: "s1" }, "deny")).toBe("the server went away");
  });
});

const bunTest: PermissionRule = { action: "bash", resource: "bun test *", effect: "allow" };

type Sent = [string, AskVerdict, AskScope | undefined];

function answering(
  projection: SessionProjection,
  quiet: string[] = [],
  reply: AnswerOutcome | Error = "settled",
): AskAnswering & { sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    approveKey: "y",
    quiet: { has: (sessionId) => sessionId !== undefined && quiet.includes(sessionId) },
    store: {
      projection: (sessionId) => (sessionId === "s1" ? projection : emptyProjection),
      answerAsk: async (callId, verdict, scope) => {
        sent.push([callId, verdict, scope]);
        if (reply instanceof Error) throw reply;
        return reply;
      },
    },
  };
}

function asking(callIds: string[], rules: PermissionRule[] = []): SessionProjection {
  return projectAll(
    emptyProjection,
    callIds.map((callId, at) => ({
      id: at + 1,
      ts: "2026-10-15T16:00:00.000Z",
      sessionId: "s1",
      type: "gate.ask",
      payload: {
        ask: { tool: "bash", callId, arguments: { command: "bun test" }, rule: "default", rules },
      },
    })) as BusEnvelope[],
  );
}
