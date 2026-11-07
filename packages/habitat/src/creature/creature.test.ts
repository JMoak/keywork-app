import type { BusEnvelope, EventPayloads, EventType, Replayable } from "@keywork-app/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hour, minute, second } from "../clock/clock.ts";
import { type Place, slotOf } from "../pose/pose.ts";
import type { PoseName } from "../pose/skin.ts";
import { quickMs } from "../pose/tempo.ts";
import type { HabitatInput, KeeperNotice, RanchEvent } from "../world/inputs.ts";
import { projectAll, withCreatures } from "../world/project.ts";
import { emptyHabitat, type HabitatState } from "../world/types.ts";
import {
  type Creature,
  createCreature,
  gazeTimeoutMs,
  greetCooldownMs,
  type Pose,
  poseOf,
  quietContext,
  type StepContext,
  step,
} from "./creature.ts";
import type { IdleKind } from "./idle.ts";
import { toolBeatMs } from "./semantic.ts";

const t0 = Date.parse("2026-11-05T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
let nextId = 0;

function envelope<K extends EventType>(
  type: K,
  payload: EventPayloads[K] & Replayable,
  at: number,
  sessionId = "s1",
): BusEnvelope {
  nextId += 1;
  return { id: nextId, ts: iso(at), sessionId, type, payload } as BusEnvelope;
}

function ranch<T extends RanchEvent["type"]>(
  type: T,
  payload: Extract<RanchEvent, { type: T }>["payload"],
  at: number,
): RanchEvent {
  nextId += 1;
  return { id: nextId, ts: iso(at), type, payload } as RanchEvent;
}

const viewed = (sessionId: string, at: number): KeeperNotice => ({
  type: "keeper.viewed",
  ts: iso(at),
  sessionId,
});
const said = (text: string) => ({ role: "assistant", parts: [{ type: "text", text }] }) as const;
const usage = { inputTokens: 1, outputTokens: 1 };
const call = (callId: string, name: string, args: Record<string, unknown>) =>
  ({ type: "tool-call", callId, name, arguments: args }) as const;

const tinkerSessions: KeeperNotice = {
  type: "keeper.sessions",
  ts: iso(t0),
  sessions: [
    {
      id: "s1",
      title: "the job",
      createdAt: iso(t0 - hour),
      lastActivityAt: iso(t0 - hour),
      messageCount: 1,
      bot: "tinker",
    },
  ],
};

const heldChore = {
  creature: "tinker",
  routineId: "triage",
  kind: "grants" as const,
  reason: "accept the write grant set 3f9c1a2b",
  runId: "tinker:triage:1:1",
  since: iso(t0),
  action: { verb: "accept" as const, digest: "3f9c1a2b" },
};

function stead(inputs: readonly HabitatInput[] = []): HabitatState {
  return projectAll(emptyHabitat(), [tinkerSessions, ...inputs]);
}

function settle(
  creature: Creature,
  world: HabitatState,
  from: number,
  ms: number,
  context: StepContext = quietContext,
  every = 100,
): Creature {
  let current = creature;
  for (let at = from + every; at <= from + ms; at += every)
    current = step(current, world, at, context);
  return current;
}

function trace(
  creature: Creature,
  world: HabitatState,
  from: number,
  ms: number,
  context: StepContext = quietContext,
  every = 100,
): Pose[] {
  const poses: Pose[] = [];
  let current = creature;
  for (let at = from + every; at <= from + ms; at += every) {
    current = step(current, world, at, context);
    poses.push(poseOf(current, { reducedMotion: context.reducedMotion, tier: context.tier }));
  }
  return poses;
}

function clipsOf(poses: readonly Pose[]): PoseName[] {
  const names: PoseName[] = [];
  for (const pose of poses) if (names.at(-1) !== pose.clip) names.push(pose.clip);
  return names;
}

describe("the body never lies about the state", () => {
  const cases: {
    name: string;
    inputs: HabitatInput[];
    clip: PoseName;
    glyph: Pose["glyph"];
    place: Place;
  }[] = [
    {
      name: "working at the bench",
      inputs: [envelope("turn.started", { userText: "go" }, t0)],
      clip: "work",
      glyph: "dot",
      place: "bench",
    },
    {
      name: "hammering while bash runs",
      inputs: [
        envelope("turn.started", { userText: "go" }, t0),
        envelope("tool.started", { call: call("c1", "bash", { command: "make" }) }, t0 + 1),
      ],
      clip: "hammer",
      glyph: "dot",
      place: "bench",
    },
    {
      name: "reading while read runs",
      inputs: [
        envelope("turn.started", { userText: "go" }, t0),
        envelope("tool.started", { call: call("c1", "read", { path: "a" }) }, t0 + 1),
      ],
      clip: "read",
      glyph: "dot",
      place: "bench",
    },
    {
      name: "carving while edit runs",
      inputs: [
        envelope("turn.started", { userText: "go" }, t0),
        envelope("tool.started", { call: call("c1", "edit", { path: "a" }) }, t0 + 1),
      ],
      clip: "carve",
      glyph: "dot",
      place: "bench",
    },
    {
      name: "blocked after an error",
      inputs: [
        envelope("turn.started", { userText: "go" }, t0),
        envelope("engine.error", { error: { name: "E", message: "boom" } }, t0 + 1),
      ],
      clip: "blocked",
      glyph: "cross",
      place: "bench",
    },
    {
      name: "waiting at the porch on an ask",
      inputs: [
        envelope("turn.started", { userText: "go" }, t0),
        envelope(
          "gate.ask",
          { ask: { tool: "bash", callId: "c1", arguments: { command: "rm" }, rule: "default" } },
          t0 + 1,
        ),
      ],
      clip: "wait",
      glyph: "bell",
      place: "porch",
    },
    {
      name: "waiting at the porch on a chore held on the keeper's grants",
      inputs: [{ type: "keeper.chores", ts: iso(t0), needs: [heldChore] }],
      clip: "wait",
      glyph: "bell",
      place: "porch",
    },
    {
      name: "paused on the stool when the provider says wait",
      inputs: [
        envelope("turn.started", { userText: "go" }, t0),
        ranch("turn.waiting", { sessionId: "s1", reason: "overloaded" }, t0 + 1),
      ],
      clip: "sit",
      glyph: "pause",
      place: "bench",
    },
    {
      name: "idle when nothing holds",
      inputs: [],
      clip: "idle",
      glyph: "none",
      place: "bench",
    },
  ];

  for (const { name, inputs, clip, glyph, place } of cases) {
    it(name, () => {
      const world = stead(inputs);
      const creature = settle(createCreature("tinker", t0), world, t0, 8 * second);
      const pose = poseOf(creature, { reducedMotion: false, tier: "ambient" });
      expect(pose).toMatchObject({ clip, glyph, place });
    });
  }

  it("leaves the porch the moment the held chore's grants are accepted and routine.needs clears it", () => {
    const held = stead([{ type: "keeper.chores", ts: iso(t0), needs: [heldChore] }]);
    const ringing = settle(createCreature("tinker", t0), held, t0, 8 * second);
    expect(poseOf(ringing, { reducedMotion: false, tier: "ambient" })).toMatchObject({
      state: "porch",
      place: "porch",
      glyph: "bell",
    });
    const cleared = projectAll(held, [
      {
        id: 900,
        ts: iso(t0 + 9 * second),
        sessionId: "",
        type: "routine.needs",
        payload: { creature: "tinker", routineId: "triage", items: [] },
      } as BusEnvelope,
    ]);
    const resting = settle(ringing, cleared, t0 + 8 * second, 2 * second);
    expect(poseOf(resting, { reducedMotion: false, tier: "ambient" })).toMatchObject({
      state: "idle",
      glyph: "none",
    });
  });

  it("goes back to work the moment the ask is answered, and idle at once when interrupted", () => {
    const asked = stead([
      envelope("turn.started", { userText: "go" }, t0),
      envelope(
        "gate.ask",
        { ask: { tool: "bash", callId: "c1", arguments: {}, rule: "default" } },
        t0 + 1,
      ),
    ]);
    const waiting = settle(createCreature("tinker", t0), asked, t0, 6 * second);
    expect(poseOf(waiting, { reducedMotion: false, tier: "ambient" }).clip).toBe("wait");
    const answered = projectAll(asked, [
      envelope(
        "gate.permission",
        { decision: { tool: "bash", callId: "c1", verdict: "granted", gate: "user", asked: true } },
        t0 + 6 * second,
      ),
    ]);
    const working = settle(waiting, answered, t0 + 6 * second, 4 * second);
    expect(poseOf(working, { reducedMotion: false, tier: "ambient" })).toMatchObject({
      clip: "work",
      place: "bench",
    });
    const stopped = projectAll(answered, [
      envelope("turn.interrupted", { message: said("…") }, t0 + 10 * second),
    ]);
    const idle = step(working, stopped, t0 + 10 * second + 1, quietContext);
    expect(idle.reading.state).toBe("idle");
    expect(
      poseOf(settle(idle, stopped, t0 + 10 * second + 1, 2 * second), {
        reducedMotion: false,
        tier: "ambient",
      }).clip,
    ).toBe("idle");
  });
});

describe("arrivals", () => {
  it("walks to the porch and rings the bell once, then waits on the step", () => {
    const world = stead([
      envelope("turn.started", { userText: "go" }, t0),
      envelope(
        "gate.ask",
        { ask: { tool: "bash", callId: "c1", arguments: {}, rule: "default" } },
        t0 + 1,
      ),
    ]);
    const poses = trace(createCreature("tinker", t0), world, t0, 10 * second);
    expect(clipsOf(poses)).toEqual(["idle", "walk-left", "ring", "wait"]);
    expect(poses.at(-1)?.place).toBe("porch");
    expect(poses.filter((pose) => pose.clip === "ring").length).toBeLessThan(15);
  });

  it("carries the crate to the porch, sets it down, celebrates for about three seconds, then rests beside it", () => {
    const world = stead([
      envelope("turn.started", { userText: "write" }, t0),
      envelope("turn.completed", { message: said("Wrote it."), usage }, t0 + 1),
      envelope("changes.updated", { paths: ["notes.txt"] }, t0 + 2),
    ]);
    const poses = trace(createCreature("tinker", t0), world, t0, 12 * second);
    expect(clipsOf(poses)).toEqual(["idle", "carry", "deliver", "celebrate", "idle"]);
    const celebrating = poses.filter((pose) => pose.clip === "celebrate").length * 100;
    expect(celebrating).toBeGreaterThan(2_500);
    expect(celebrating).toBeLessThan(4_000);
    expect(poses.at(-1)).toMatchObject({ place: "porch", glyph: "check", state: "back" });
    const seen = projectAll(world, [viewed("s1", t0 + 13 * second)]);
    const after = step(
      settle(createCreature("tinker", t0), world, t0, 12 * second),
      seen,
      t0 + 13 * second,
      quietContext,
    );
    expect(after.reading.state).toBe("idle");
  });

  it("sets the crate down and then lives: within ten minutes a back creature has left the porch and returned, the crate still shown", () => {
    const world = stead([
      envelope("turn.started", { userText: "write" }, t0),
      envelope("turn.completed", { message: said("Wrote it."), usage }, t0 + 1),
      envelope("changes.updated", { paths: ["notes.txt"] }, t0 + 2),
    ]);
    let creature = settle(createCreature("tinker", t0), world, t0, 12 * second);
    const starts: IdleKind[] = [];
    const places: Place[] = [];
    let over: { clip: PoseName; at: number } | undefined;
    for (let at = t0 + 13 * second; at <= t0 + 10 * minute; at += 500) {
      const next = step(creature, world, at, quietContext);
      if (next.activity !== undefined && next.activity !== creature.activity) {
        starts.push(next.activity.choice.kind);
        over = undefined;
      }
      if (next.activity === undefined && creature.activity !== undefined) {
        over = { clip: creature.activity.choice.clip, at };
      }
      const pose = poseOf(next, { reducedMotion: false, tier: "ambient" });
      if (over !== undefined && over.clip !== "idle" && at >= over.at + 2 * second) {
        expect(pose.clip).not.toBe(over.clip);
      }
      if (pose.place !== undefined && places.at(-1) !== pose.place) places.push(pose.place);
      expect(pose).toMatchObject({ state: "back", glyph: "check" });
      expect(next.reading.crates).toBe(1);
      creature = next;
    }
    expect(starts.length).toBeGreaterThanOrEqual(4);
    const left = places.findIndex((place) => place !== "porch");
    expect(left).toBeGreaterThan(0);
    expect(places.lastIndexOf("porch")).toBeGreaterThan(left);
  });

  it("carries and delivers a crate for a finished turn even when nothing changed", () => {
    const world = stead([
      envelope("turn.started", { userText: "say hi" }, t0),
      envelope("turn.completed", { message: said("Hi."), usage }, t0 + 1),
    ]);
    const poses = trace(createCreature("tinker", t0), world, t0, 10 * second);
    expect(clipsOf(poses)).toEqual(["idle", "carry", "deliver", "celebrate", "idle"]);
    expect(poses.at(-1)).toMatchObject({ place: "porch", glyph: "check", state: "back" });
  });

  it("shows a sub-second tool for a full beat where it stands before walking back to the bench", () => {
    const asked = stead([
      envelope("turn.started", { userText: "go" }, t0),
      envelope("tool.started", { call: call("c1", "bash", { command: "ls" }) }, t0 + 1),
      envelope(
        "gate.ask",
        { ask: { tool: "bash", callId: "c1", arguments: {}, rule: "default" } },
        t0 + 2,
      ),
    ]);
    const waiting = settle(createCreature("tinker", t0), asked, t0, 6 * second);
    const answeredAt = t0 + 6 * second;
    const ran = projectAll(asked, [
      envelope(
        "gate.permission",
        { decision: { tool: "bash", callId: "c1", verdict: "granted", gate: "user", asked: true } },
        answeredAt,
      ),
      envelope("tool.finished", { callId: "c1", output: "ok", isError: false }, answeredAt + 100),
    ]);
    const poses = trace(waiting, ran, answeredAt, 4 * second, quietContext, 50);
    expect(clipsOf(poses)).toEqual(["wait", "hammer", "walk-right", "work"]);
    const hammering = poses.filter((pose) => pose.clip === "hammer");
    expect(hammering.length * 50).toBeGreaterThanOrEqual(toolBeatMs - quickMs);
    expect(hammering.every((pose) => pose.x === slotOf("porch"))).toBe(true);
    expect(poses.at(-1)).toMatchObject({ clip: "work", place: "bench" });
  });

  it("draws a hundred-millisecond read at the bench for a beat, then works on", () => {
    const working = stead([envelope("turn.started", { userText: "go" }, t0)]);
    const atTheBench = settle(createCreature("tinker", t0), working, t0, 3 * second);
    const readAt = t0 + 3 * second;
    const read = projectAll(working, [
      envelope("tool.started", { call: call("c2", "read", { path: "a.md" }) }, readAt),
      envelope("tool.finished", { callId: "c2", output: "...", isError: false }, readAt + 100),
    ]);
    const poses = trace(atTheBench, read, readAt, 3 * second, quietContext, 50);
    expect(clipsOf(poses)).toEqual(["work", "read", "work"]);
    expect(poses.filter((pose) => pose.clip === "read").length * 50).toBeGreaterThanOrEqual(
      toolBeatMs - quickMs,
    );
  });

  it("stumbles once on a tool error and goes on working", () => {
    const working = stead([envelope("turn.started", { userText: "go" }, t0)]);
    const settled = settle(createCreature("tinker", t0), working, t0, 3 * second);
    const stumbled = projectAll(working, [
      envelope("tool.started", { call: call("c1", "bash", { command: "false" }) }, t0 + 3 * second),
      envelope(
        "tool.finished",
        { callId: "c1", output: "exit 1", isError: true },
        t0 + 3 * second + 1,
      ),
    ]);
    const poses = trace(settled, stumbled, t0 + 3 * second, 4 * second);
    expect(clipsOf(poses).filter((clip) => clip !== "work")).toEqual(["stumble"]);
    expect(poses.at(-1)?.clip).toBe("work");
    const again = trace(
      settle(settled, stumbled, t0 + 3 * second, 4 * second),
      stumbled,
      t0 + 7 * second,
      3 * second,
    );
    expect(clipsOf(again)).toEqual(["work"]);
  });

  it("raises its workshop once when it is made, and not when it merely wakes up on an old stead", () => {
    const raised = stead([
      ranch("creature.changed", { slug: "tinker", change: "created" }, t0 + 1),
    ]);
    const poses = trace(createCreature("tinker", t0), raised, t0, 8 * second);
    expect(clipsOf(poses)).toEqual(["idle", "walk-left", "raise", "idle"]);
    const old = createCreature("tinker", t0 + hour);
    expect(clipsOf(trace(old, raised, t0 + hour, 5 * second))).toEqual(["idle"]);
  });
});

describe("idle is where the character lives", () => {
  it("picks bounded activities twenty to ninety seconds apart, never the same twice running, within each cooldown, and every beat passes the gate", () => {
    const world = stead([
      ranch(
        "mesh.parcel",
        {
          parcel: {
            id: "spark",
            name: "spark",
            roles: ["host"],
            online: true,
            servers: [{ id: "o", name: "Ollama", loaded: [] }],
          },
        },
        t0,
      ),
    ]);
    let creature = createCreature("tinker", t0);
    const starts: { kind: IdleKind; at: number }[] = [];
    for (let at = t0 + 250; at <= t0 + 40 * minute; at += 250) {
      const next = step(creature, world, at, quietContext);
      if (next.activity !== undefined && next.activity !== creature.activity) {
        starts.push({ kind: next.activity.choice.kind, at });
      }
      creature = next;
    }
    expect(starts.length).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < starts.length; i++) {
      const gap = (starts[i]?.at ?? 0) - (starts[i - 1]?.at ?? 0);
      expect(gap).toBeGreaterThanOrEqual(20 * second);
      expect(gap).toBeLessThanOrEqual(90 * second + 40 * second + 500);
      expect(starts[i]?.kind === starts[i - 1]?.kind && starts[i]?.kind !== "rest").toBe(false);
    }
    const kinds = new Set(starts.map((start) => start.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    expect(creature.decisions.length).toBeGreaterThan(0);
    expect(creature.decisions.length).toBeLessThanOrEqual(32);
    expect(creature.decisions.every((decision) => decision.verdict === "play")).toBe(true);
    expect(creature.beats).toBeGreaterThanOrEqual(starts.length);
  });

  it("keeps living on the rest tier: an unfocused, still pane sees the same beats, each passing the gate", () => {
    const resting: StepContext = { ...quietContext, focused: false, tier: "rest" };
    const world = stead();
    let creature = createCreature("tinker", t0);
    const starts: IdleKind[] = [];
    for (let at = t0 + second; at <= t0 + 10 * minute; at += second) {
      const next = step(creature, world, at, resting);
      if (next.activity !== undefined && next.activity !== creature.activity) {
        starts.push(next.activity.choice.kind);
      }
      creature = next;
    }
    expect(starts.length).toBeGreaterThanOrEqual(5);
    expect(new Set(starts).size).toBeGreaterThanOrEqual(2);
    expect(creature.decisions.every((decision) => decision.verdict === "play")).toBe(true);
    expect(creature.decisions.some((decision) => decision.lane === "ambient")).toBe(true);
  });

  it("wanders only through open gates, never a latched one", () => {
    const grant = (id: string, node: string) => ({ id, creature: "tinker", node, caps: ["exec"] });
    const world = stead([
      ranch(
        "mesh.parcel",
        { parcel: { id: "spark", name: "spark", roles: ["host"], online: true } },
        t0,
      ),
      ranch(
        "mesh.parcel",
        { parcel: { id: "moon", name: "moon", roles: ["pasture"], online: true } },
        t0,
      ),
      ranch("mesh.grant", { grant: grant("g1", "spark") }, t0),
      ranch("mesh.grant", { grant: grant("g2", "moon") }, t0),
      ranch("mesh.grant", { grant: grant("g2", "moon"), revoked: true }, t0 + 1),
    ]);
    const visited = new Set<Place>();
    for (const slug of ["tinker", "tinker-two", "tinker-three"]) {
      let creature = createCreature(slug, t0);
      const own = withCreatures(
        world,
        [{ slug, name: slug, threads: [{ id: "s1", kind: "thread" }] }],
        iso(t0 - 1),
      );
      for (let at = t0 + 250; at <= t0 + 60 * minute; at += 250) {
        creature = step(creature, own, at, quietContext);
        if (
          creature.activity?.choice.kind === "wander" &&
          creature.activity.choice.target !== undefined
        ) {
          visited.add(creature.activity.choice.target);
        }
      }
    }
    expect(visited.has("parcel:moon")).toBe(false);
    expect(visited.size).toBeGreaterThan(0);
  });

  it("yields to task state at once: a turn starting mid-wander sends it back to the bench", () => {
    const world = stead([]);
    let creature = createCreature("tinker", t0);
    let at = t0;
    while (creature.activity?.choice.kind !== "wander" && at < t0 + 30 * minute) {
      at += 250;
      creature = step(creature, world, at, quietContext);
    }
    expect(creature.activity?.choice.kind).toBe("wander");
    const called = projectAll(world, [envelope("turn.started", { userText: "go" }, at + 100)]);
    const recalled = step(creature, called, at + 200, quietContext);
    expect(recalled.activity).toBeUndefined();
    expect(recalled.body.walk?.to ?? recalled.body.place).toBe("bench");
    const working = settle(recalled, called, at + 200, 8 * second);
    expect(poseOf(working, { reducedMotion: false, tier: "ambient" })).toMatchObject({
      clip: "work",
      place: "bench",
    });
  });

  it("forgets a working thread that has been silent for thirty minutes, waking exactly at the deadline", () => {
    const world = stead([envelope("turn.started", { userText: "go" }, t0)]);
    const working = step(createCreature("tinker", t0), world, t0 + 1000, quietContext);
    expect(working.reading.state).toBe("working");
    expect(working.nextThoughtAt).toBe(t0 + 30 * minute);
    expect(step(working, world, t0 + 31 * minute, quietContext).reading.state).toBe("idle");
  });
});

describe("the keeper nearby", () => {
  it("follows the pointer within a radius, ignores the deadzone, lets go after three seconds, and looks again when it moves", () => {
    const world = stead([]);
    const near = (dx: number, dy: number): StepContext => ({
      ...quietContext,
      pointer: { dx, dy },
    });
    const looking = step(createCreature("tinker", t0), world, t0 + 100, near(1.5, 0));
    expect(looking.gaze?.direction).toBe(0);
    expect(poseOf(looking, { reducedMotion: false, tier: "ambient" }).gaze?.direction).toBe(0);
    const tooClose = step(createCreature("tinker", t0), world, t0 + 100, near(0.1, 0.1));
    expect(tooClose.gaze).toBeUndefined();
    const tooFar = step(createCreature("tinker", t0), world, t0 + 100, near(4, 0));
    expect(tooFar.gaze).toBeUndefined();
    const held = settle(looking, world, t0 + 100, gazeTimeoutMs + 200, near(1.5, 0));
    expect(held.gaze?.released).toBe(true);
    expect(held.body.gaze.direction).toBeUndefined();
    const moved = step(held, world, held.at + 100, near(0, 1.5));
    expect(moved.gaze).toMatchObject({ direction: 2, released: false });
    const gone = step(moved, world, moved.at + 100, quietContext);
    expect(gone.gaze).toBeUndefined();
  });

  it("holds its gaze through small pointer jitter around a sector edge", () => {
    const world = stead([]);
    const near = (dx: number, dy: number): StepContext => ({
      ...quietContext,
      pointer: { dx, dy },
    });
    const first = step(createCreature("tinker", t0), world, t0 + 100, near(1.5, 0.05));
    expect(first.gaze?.direction).toBe(0);
    const edge = step(first, world, t0 + 200, near(1.4, 0.75));
    expect(edge.gaze?.direction).toBe(0);
    const over = step(edge, world, t0 + 300, near(1.0, 1.1));
    expect(over.gaze?.direction).toBe(1);
  });

  it("greets a hover once per two seconds, waves on a press, and walks the way it is dragged", () => {
    const world = stead([]);
    const hover: StepContext = { ...quietContext, gestures: [{ kind: "hover" }] };
    const greeted = step(createCreature("tinker", t0), world, t0 + 100, hover);
    expect(greeted.body.pending?.beat.clip ?? greeted.body.clip.name).toBe("greet");
    expect(greeted.decisions.at(-1)).toMatchObject({
      lane: "input",
      clip: "greet",
      verdict: "play",
    });
    const again = step(greeted, world, t0 + 600, hover);
    expect(again.decisions.filter((decision) => decision.clip === "greet")).toHaveLength(1);
    const later = step(again, world, t0 + 100 + greetCooldownMs, hover);
    expect(later.decisions.filter((decision) => decision.clip === "greet")).toHaveLength(2);
    const pressed = step(createCreature("tinker", t0), world, t0 + 100, {
      ...quietContext,
      gestures: [{ kind: "press" }],
    });
    expect(pressed.body.pending?.beat.clip ?? pressed.body.clip.name).toBe("wave");
    const dragged = settle(createCreature("tinker", t0), world, t0, 500, {
      ...quietContext,
      gestures: [{ kind: "drag", direction: "left" }],
    });
    expect(dragged.body.clip).toMatchObject({ name: "walk-left", lane: "input" });
    expect(dragged.body.facing).toBe("left");
    const dropped = settle(dragged, world, dragged.at, 1000);
    expect(dropped.body.clip.name).toBe("idle");
    expect(dropped.dragging).toBe(false);
  });

  it("answers a hover within one quick tempo whatever it was doing", () => {
    const world = stead([envelope("turn.started", { userText: "go" }, t0)]);
    const working = settle(createCreature("tinker", t0), world, t0, 5 * second);
    const greeted = step(working, world, working.at + 1, {
      ...quietContext,
      gestures: [{ kind: "hover" }],
    });
    const soon = step(greeted, world, working.at + 1 + quickMs, quietContext);
    expect(poseOf(soon, { reducedMotion: false, tier: "ambient" }).clip).toBe("greet");
    const back = settle(soon, world, soon.at, 3 * second);
    expect(poseOf(back, { reducedMotion: false, tier: "ambient" }).clip).toBe("work");
  });
});

describe("properties", () => {
  const world = stead([]);
  const contextArb: fc.Arbitrary<StepContext> = fc.record({
    visible: fc.boolean(),
    focused: fc.boolean(),
    fullscreen: fc.boolean(),
    doNotDisturb: fc.boolean(),
    tier: fc.constantFrom("interact", "active", "ambient", "rest", "hidden"),
    reducedMotion: fc.boolean(),
    quietHours: fc.boolean(),
    pointer: fc.option(
      fc.record({
        dx: fc.double({ min: -3, max: 3, noNaN: true }),
        dy: fc.double({ min: -3, max: 3, noNaN: true }),
      }),
      { nil: undefined },
    ),
    gestures: fc.array(
      fc.oneof(
        fc.record({ kind: fc.constant("hover" as const) }),
        fc.record({ kind: fc.constant("press" as const) }),
        fc.record({
          kind: fc.constant("drag" as const),
          direction: fc.constantFrom("left" as const, "right" as const),
        }),
      ),
      { maxLength: 2 },
    ),
  });
  const worlds = [
    world,
    stead([envelope("turn.started", { userText: "go" }, t0)]),
    stead([
      envelope("turn.started", { userText: "go" }, t0),
      envelope(
        "gate.ask",
        { ask: { tool: "bash", callId: "c1", arguments: {}, rule: "default" } },
        t0 + 1,
      ),
    ]),
    stead([
      envelope("turn.started", { userText: "go" }, t0),
      envelope("turn.completed", { message: said("ok"), usage }, t0 + 1),
      envelope("changes.updated", { paths: ["x"] }, t0 + 2),
    ]),
    stead([
      envelope("turn.started", { userText: "go" }, t0),
      envelope("engine.error", { error: { name: "E", message: "boom" } }, t0 + 1),
    ]),
  ];

  it("is total and deterministic by seed: the same slug, day and inputs give the same poses", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        fc.array(fc.tuple(fc.integer({ min: 1, max: 20_000 }), contextArb), { maxLength: 25 }),
        (which, steps) => {
          const run = (slug: string) => {
            let creature = createCreature(slug, t0, { dayKey: "2026-11-05" });
            const poses: Pose[] = [];
            for (const [ms, context] of steps) {
              creature = step(creature, worlds[which] ?? world, creature.at + ms, context);
              poses.push(
                poseOf(creature, { reducedMotion: context.reducedMotion, tier: context.tier }),
              );
            }
            return poses;
          };
          const first = run("tinker");
          expect(run("tinker")).toEqual(first);
          for (const pose of first) {
            expect(pose.frame).toBeGreaterThanOrEqual(0);
            expect(pose.scale.x * pose.scale.y).toBeCloseTo(1, 6);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it("schedules zero wakeups when hidden, and none for a still creature under reduced motion", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        fc.array(fc.tuple(fc.integer({ min: 1, max: 20_000 }), contextArb), { maxLength: 20 }),
        (which, steps) => {
          let creature = createCreature("tinker", t0);
          for (const [ms, context] of steps)
            creature = step(creature, worlds[which] ?? world, creature.at + ms, context);
          const hidden = step(creature, worlds[which] ?? world, creature.at + 1, {
            ...quietContext,
            tier: "hidden",
          });
          expect(
            poseOf(hidden, { reducedMotion: false, tier: "hidden" }).nextWakeAt,
          ).toBeUndefined();
          const reduced: StepContext = { ...quietContext, reducedMotion: true };
          let still = step(creature, world, creature.at + 1, reduced);
          still = step(still, world, still.at + 60 * second, reduced);
          expect(
            poseOf(still, { reducedMotion: true, tier: "ambient" }).nextWakeAt,
          ).toBeUndefined();
          expect(still.activity).toBeUndefined();
        },
      ),
      { numRuns: 60 },
    );
  });

  it("never sticks: whatever happened, a quiet stead and an idle thread set bring it to idle at the resting loop", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4 }),
        fc.array(fc.tuple(fc.integer({ min: 1, max: 20_000 }), contextArb), { maxLength: 20 }),
        (which, steps) => {
          let creature = createCreature("tinker", t0);
          for (const [ms, context] of steps)
            creature = step(creature, worlds[which] ?? world, creature.at + ms, context);
          const calm = settle(creature, world, creature.at, 12 * second, {
            ...quietContext,
            reducedMotion: true,
          });
          expect(calm.reading.state).toBe("idle");
          expect(poseOf(calm, { reducedMotion: true, tier: "ambient" }).clip).toBe("idle");
          expect(calm.body.walk).toBeUndefined();
        },
      ),
      { numRuns: 60 },
    );
  });

  it("keeps its place on the stead a real slot and its facing a real direction", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 1, max: 20_000 }), contextArb), { maxLength: 20 }),
        (steps) => {
          let creature = createCreature("tinker", t0);
          for (const [ms, context] of steps)
            creature = step(creature, world, creature.at + ms, context);
          const pose = poseOf(creature, { reducedMotion: false, tier: "ambient" });
          expect(pose.x).toBeGreaterThanOrEqual(slotOf("tree"));
          expect(pose.x).toBeLessThanOrEqual(slotOf("parcel:any"));
          expect(["left", "right"]).toContain(pose.facing);
        },
      ),
      { numRuns: 60 },
    );
  });
});
