import { readFile } from "node:fs/promises";
import { coalesceEnvelopes } from "@keywork-app/client";
import type { BusEnvelope, SessionRow } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { ringingTheBell } from "./bell.ts";
import { coldStart } from "./cold-start.ts";
import { projectAll } from "./project.ts";
import { emptyHabitat } from "./types.ts";

const recorded = [
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
  "changes",
  "grants",
  "memory",
  "trash",
  "tree",
  "workspace",
];

const fixture = (name: string): URL =>
  new URL(`../../../client/src/fixtures/${name}`, import.meta.url);

async function envelopes(name: string): Promise<BusEnvelope[]> {
  const text = await readFile(fixture(`${name}.jsonl`), "utf8");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as BusEnvelope);
}

describe("the stead against every recorded scenario", () => {
  it("rings the bell for exactly what the desk lists, at every moment of every scenario", async () => {
    for (const name of recorded) {
      const stream = await envelopes(name);
      for (let upTo = 0; upTo <= stream.length; upTo++) {
        const prefix = stream.slice(0, upTo);
        const stead = ringingTheBell(projectAll(emptyHabitat(), prefix))
          .filter((item) => item.kind !== "inbox")
          .map((item) => item.key)
          .sort();
        expect(stead, `${name} after ${upTo} events`).toEqual([...deskNeedsYou(prefix)].sort());
      }
    }
  });

  it("rings the bell for a chore the wire says needs the keeper, and stops when the wire clears it", () => {
    const need = {
      creature: "wren",
      routineId: "triage",
      kind: "grants" as const,
      reason: "accept the write grant set 3f9c1a2b",
      runId: "wren:triage:1:1",
      since: "2026-11-05T09:02:00.000Z",
      action: { verb: "accept" as const, digest: "3f9c1a2b" },
    };
    const envelope = (id: number, items: (typeof need)[]): BusEnvelope =>
      ({
        id,
        ts: "2026-11-05T09:02:01.000Z",
        sessionId: "",
        type: "routine.needs",
        payload: { creature: "wren", routineId: "triage", items },
      }) as BusEnvelope;
    const held = projectAll(emptyHabitat(), [envelope(1, [need])]);
    expect(ringingTheBell(held)).toEqual([
      {
        kind: "chore",
        key: "chore:wren/triage/grants",
        creature: "wren",
        routineId: "triage",
        need: "grants",
        reason: need.reason,
        runId: need.runId,
        since: need.since,
        digest: "3f9c1a2b",
      },
    ]);
    expect(ringingTheBell(projectAll(held, [envelope(2, [])]))).toEqual([]);
    const cold = projectAll(emptyHabitat(), [
      { type: "keeper.chores", ts: "2026-11-05T09:02:01.000Z", needs: [need] },
    ]);
    expect(ringingTheBell(cold).map((item) => item.key)).toEqual(["chore:wren/triage/grants"]);
  });

  it("projects identically whether or not deltas are coalesced per frame", async () => {
    for (const name of recorded) {
      const stream = await envelopes(name);
      expect(projectAll(emptyHabitat(), coalesceEnvelopes(stream)), name).toEqual(
        projectAll(emptyHabitat(), stream),
      );
    }
  });

  it("keeps a stable picture of every scenario's threads", async () => {
    for (const name of recorded) {
      const state = projectAll(emptyHabitat(), await envelopes(name));
      expect({
        threads: state.threads,
        porch: state.porch,
        history: state.history,
      }).toMatchSnapshot(name);
    }
  });

  it("asks ring while the ask is open and fall silent on the answer, whoever answers", async () => {
    for (const name of ["denied", "asked-granted", "asked-denied"]) {
      const stream = await envelopes(name);
      const asked = stream.findIndex((envelope) => envelope.type === "gate.ask");
      const ringing = projectAll(emptyHabitat(), stream.slice(0, asked + 1));
      expect(ringingTheBell(ringing), name).toEqual([
        expect.objectContaining({
          kind: "ask",
          callId: "c1",
          tool: "bash",
          subject: "echo served",
        }),
      ]);
      expect(ringingTheBell(projectAll(ringing, stream.slice(asked + 1))), name).toEqual([]);
    }
  });

  it("counts the memory inbox from the tally and settles on the last count", async () => {
    const state = projectAll(emptyHabitat(), await envelopes("memory"));
    expect(state.porch.inbox?.count).toBe(2);
    expect(ringingTheBell(state)).toEqual([{ kind: "inbox", key: "inbox", count: 2 }]);
  });

  it("carries the delegated child as a loft lantern that goes out when the child finishes", async () => {
    const stream = await envelopes("delegated");
    const started = stream.findIndex((envelope) => envelope.type === "child.started");
    const lit = projectAll(emptyHabitat(), stream.slice(0, started + 1));
    expect(lit.threads.q2?.turn).toBeDefined();
    expect(lit.threads.s1?.children).toEqual(["q2"]);
    const done = projectAll(lit, stream.slice(started + 1));
    expect(done.threads.q2).toMatchObject({ turn: undefined, outcome: "completed", kind: "child" });
    expect(done.threads.s1?.turn).toBeUndefined();
  });

  it("brings a crate back from the changes scenario and puts it back on the restore", async () => {
    const changed = projectAll(emptyHabitat(), await envelopes("changes"));
    expect(changed.threads.s1?.back).toMatchObject({
      preview: "Wrote notes.txt.",
      changes: ["notes.txt"],
    });
    const stream = await envelopes("restored");
    const moved = stream.findIndex((envelope) => envelope.type === "session.tree");
    const restored = projectAll(emptyHabitat(), stream.slice(0, moved + 1));
    expect(restored.threads.s1?.back?.changes).toEqual([]);
    const redone = projectAll(restored, stream.slice(moved + 1));
    expect(redone.threads.s1?.back?.changes).toEqual(["notes.txt"]);
  });

  it("cold starts from the recorded GET /sessions rows", async () => {
    const listed = JSON.parse(await readFile(fixture("sessions.json"), "utf8")) as {
      sessions: SessionRow[];
    };
    const state = coldStart({ at: "2026-09-07T12:00:00.000Z", sessions: listed.sessions });
    expect(state.threads.s1).toMatchObject({ title: "(untitled session)", turn: undefined });
    expect(ringingTheBell(state)).toEqual([]);
  });
});

function deskNeedsYou(stream: readonly BusEnvelope[]): Set<string> {
  const asks = new Map<string, string>();
  const answered = new Set<string>();
  const failures = new Map<string, string>();
  const betweenTurns = new Set<string>();
  const chores = new Set<string>();
  for (const envelope of stream) {
    if (envelope.type === "gate.permission") {
      asks.delete(envelope.payload.decision.callId);
      answered.add(envelope.payload.decision.callId);
      continue;
    }
    if (envelope.payload.replay === true) continue;
    const session = envelope.sessionId;
    switch (envelope.type) {
      case "routine.needs":
        for (const key of [...chores.keys()]) {
          if (key.startsWith(`chore:${envelope.payload.creature}/${envelope.payload.routineId}/`)) {
            chores.delete(key);
          }
        }
        for (const item of envelope.payload.items) {
          chores.add(`chore:${item.creature}/${item.routineId}/${item.kind}`);
        }
        break;
      case "gate.ask":
        if (!answered.has(envelope.payload.ask.callId)) {
          asks.set(envelope.payload.ask.callId, `ask:${envelope.payload.ask.callId}`);
        }
        break;
      case "turn.started":
        failures.delete(session);
        betweenTurns.delete(session);
        break;
      case "turn.completed":
      case "turn.interrupted":
        betweenTurns.add(session);
        break;
      case "engine.error":
        if (session === "" || betweenTurns.has(session)) break;
        failures.set(session, `failed:${session}:${envelope.id}`);
        betweenTurns.add(session);
        break;
      case "session.removed":
        failures.delete(envelope.payload.sessionId);
        break;
      default:
        break;
    }
  }
  return new Set([...asks.values(), ...failures.values(), ...chores]);
}
