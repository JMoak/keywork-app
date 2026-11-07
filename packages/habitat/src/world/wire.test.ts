import type {
  BusEnvelope,
  EventPayloads,
  EventType,
  MeshGrant,
  Replayable,
  RunRow,
  WorkshopView,
} from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { project, projectAll } from "./project.ts";
import { emptyHabitat, type HabitatState } from "./types.ts";

let nextId = 0;
let clock = Date.parse("2026-11-05T12:00:00.000Z");

function wire<K extends EventType>(
  type: K,
  payload: EventPayloads[K] & Replayable,
  sessionId = "",
): BusEnvelope {
  clock += 250;
  nextId += 1;
  return { id: nextId, ts: new Date(clock).toISOString(), sessionId, type, payload } as BusEnvelope;
}

const grant: MeshGrant = {
  id: "g1",
  issuer: "console-1",
  subject: { creature: "pip", node: "house-1" },
  target: "spark-1",
  caps: [
    { kind: "exec", commands: ["ls"] },
    { kind: "files:read", paths: ["/srv"] },
  ],
  issuedAt: "2026-11-05T12:00:00.000Z",
  expiresAt: "2026-11-06T12:00:00.000Z",
  nonce: "n1",
  signature: "sig",
};

const workshop: WorkshopView = {
  id: "pip-0a1b2c",
  creature: "pip",
  substrate: "sbx",
  state: "running",
  workdir: "/home/agent/workspace",
  brokers: [],
  limitations: [],
  display: true,
  createdAt: "2026-11-05T12:00:00.000Z",
};

const run: RunRow = {
  runId: "r1",
  creature: "pip",
  routineId: "nightly-digest",
  attempt: 1,
  trigger: "cron",
  catchUp: false,
  firedAt: "2026-11-05T12:00:00.000Z",
  scheduledFor: "2026-11-05T12:00:01.000Z",
  status: "ended",
  sessionId: "run-1",
  startedAt: "2026-11-05T12:00:02.000Z",
  endedAt: "2026-11-05T12:05:00.000Z",
  process: "completed",
  delivery: "delivered",
  verified: null,
  reason: null,
  usage: { inputTokens: 10, outputTokens: 4 },
  cost: { usd: 0.01 },
  output: "outputs/r1.md",
  notify: { tier: "log", at: null },
};

function seated(): HabitatState {
  return project(emptyHabitat(), wire("creature.changed", { slug: "pip", change: "created" }));
}

describe("the real ranch events on the bus", () => {
  it("seats a creature on creature.changed created and boards its workshop up on removed", () => {
    const world = seated();
    expect(world.creatures.pip).toMatchObject({ slug: "pip", name: "pip" });
    const gone = project(world, wire("creature.changed", { slug: "pip", change: "removed" }));
    expect(gone.creatures.pip?.workshop.boardedAt).toBeDefined();
    expect(gone.history.at(-1)?.kind).toBe("boarded");
    const same = project(gone, wire("creature.changed", { slug: "pip", change: "threads" }));
    expect(same.creatures).toEqual(gone.creatures);
  });

  it("runs a chore on routine.fired and rests it on routine.finished", () => {
    const fired = project(
      seated(),
      wire("routine.fired", {
        runId: "r1",
        creature: "pip",
        routineId: "nightly-digest",
        attempt: 1,
        trigger: "cron",
        catchUp: false,
        firedAt: run.firedAt,
        scheduledFor: run.scheduledFor,
        startedAt: run.startedAt ?? run.firedAt,
        sessionId: "run-1",
      }),
    );
    const chore = fired.creatures.pip?.chores.find((held) => held.id === "nightly-digest");
    expect(chore?.running).toBe("run-1");
    expect(fired.threads["run-1"]).toMatchObject({ creature: "pip", kind: "routine" });
    const finished = project(fired, wire("routine.finished", { run, disabled: null }));
    const rested = finished.creatures.pip?.chores.find((held) => held.id === "nightly-digest");
    expect(rested?.running).toBeUndefined();
    expect(rested?.lastRanAt).toBe(finished.asOf);
  });

  it("raises a workshop with its substrate, lights it while running and boards it up on removed", () => {
    const created = project(
      emptyHabitat(),
      wire("workshop.changed", { change: "created", workshop: { ...workshop, state: "stopped" } }),
    );
    expect(created.creatures.pip?.workshop).toMatchObject({ substrate: "sbx", health: undefined });
    const started = project(created, wire("workshop.changed", { change: "started", workshop }));
    expect(started.creatures.pip?.workshop.health).toBe("up");
    const stopped = project(
      started,
      wire("workshop.changed", { change: "stopped", workshop: { ...workshop, state: "stopped" } }),
    );
    expect(stopped.creatures.pip?.workshop.health).toBe("down");
    const removed = project(
      stopped,
      wire("workshop.changed", { change: "removed", workshop: { ...workshop, state: "stopped" } }),
    );
    expect(removed.creatures.pip?.workshop.boardedAt).toBeDefined();
  });

  it("opens a gate on mesh.grant issued, counts mesh.walked through it and latches it on revoked", () => {
    const opened = project(seated(), wire("mesh.grant", { change: "issued", grant }));
    expect(opened.gates.g1).toMatchObject({
      creature: "pip",
      parcel: "spark-1",
      caps: ["exec", "files:read"],
      expiresAt: grant.expiresAt,
      walks: 0,
    });
    const walked = project(
      opened,
      wire("mesh.walked", {
        origin: { kind: "mesh", creature: "pip", node: "house-1" },
        grantId: "g1",
        call: { type: "tool-call", callId: "c1", name: "bash", arguments: { command: "ls" } },
        rules: [],
      }),
    );
    expect(walked.gates.g1?.walks).toBe(1);
    expect(walked.landmarks.some((landmark) => landmark.kind === "lantern-post")).toBe(true);
    const latched = project(
      walked,
      wire("mesh.grant", { change: "revoked", grantId: "g1", by: "keeper" }),
    );
    expect(latched.gates.g1?.latchedAt).toBeDefined();
    const refused = project(
      latched,
      wire("mesh.grant", { change: "refused", issuer: "stranger", reason: "unknown-issuer" }),
    );
    expect(refused.gates).toEqual(latched.gates);
  });

  it("leaves the stead as it was for the events that only say re-fetch", () => {
    const world = seated();
    const after = projectAll(world, [
      wire("models.changed", { node: "spark-1", reason: "probe" }),
      wire("mesh.listener", { change: "bound", address: "100.64.0.1", port: 47800 }),
      wire("mesh.pairing", { change: "refused", peerStableId: "n1", reason: "other-tailnet" }),
      wire("mesh.pair", { change: "removed", pairId: "p1", peerStableId: "n1", by: "keeper" }),
      wire("mesh.revocation", {
        change: "undelivered",
        revocation: {
          kind: "grant",
          id: "g1",
          issuer: "console-1",
          target: "spark-1",
          revokedAt: "2026-11-05T12:00:00.000Z",
          nonce: "n2",
          signature: "sig",
        },
        attempts: 2,
        error: "ECONNREFUSED",
      }),
    ]);
    expect(after.creatures).toEqual(world.creatures);
    expect(after.mills).toEqual(world.mills);
    expect(after.parcels).toEqual(world.parcels);
    expect(after.history).toEqual(world.history);
  });

  it("counts model.fallback as progress on the thread whose turn switched", () => {
    const working = project(seated(), wire("turn.started", { userText: "go" }, "s1"));
    const fallen = project(
      working,
      wire(
        "model.fallback",
        {
          class: "strong",
          from: "local/qwen",
          to: "anthropic/claude",
          trigger: "down",
          cloud: true,
        },
        "s1",
      ),
    );
    expect(fallen.threads.s1?.turn?.lastProgressAt).toBe(fallen.asOf);
  });
});
