import type {
  BusEnvelope,
  EventPayloads,
  EventType,
  Replayable,
  RoutineView,
} from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { hour } from "../clock/clock.ts";
import { bellLine, ringingTheBell } from "./bell.ts";
import { coldStart } from "./cold-start.ts";
import type { HabitatInput, KeeperNotice, RanchEvent } from "./inputs.ts";
import { project, projectAll, throughTheNight, withCreatures } from "./project.ts";
import { crateOf, emptyHabitat, type HabitatState, historyLimit, shelvesPerWing } from "./types.ts";

let nextId = 0;
let clock = Date.parse("2026-11-05T12:00:00.000Z");

function at<K extends EventType>(
  type: K,
  payload: EventPayloads[K] & Replayable,
  options: { sessionId?: string; ms?: number } = {},
): BusEnvelope {
  clock += options.ms ?? 250;
  nextId += 1;
  return {
    id: nextId,
    ts: new Date(clock).toISOString(),
    sessionId: options.sessionId ?? "s1",
    type,
    payload,
  } as BusEnvelope;
}

function ranch<T extends RanchEvent["type"]>(
  type: T,
  payload: Extract<RanchEvent, { type: T }>["payload"],
  ms = 250,
): RanchEvent {
  clock += ms;
  nextId += 1;
  return { id: nextId, ts: new Date(clock).toISOString(), type, payload } as RanchEvent;
}

function keeper<T extends KeeperNotice["type"]>(
  type: T,
  fields: Omit<Extract<KeeperNotice, { type: T }>, "type" | "ts">,
  ms = 250,
): KeeperNotice {
  clock += ms;
  return { type, ts: new Date(clock).toISOString(), ...fields } as unknown as KeeperNotice;
}

const call = (callId: string, name: string, args: Record<string, unknown>) =>
  ({ type: "tool-call", callId, name, arguments: args }) as const;
const said = (text: string) => ({ role: "assistant", parts: [{ type: "text", text }] }) as const;
const usage = { inputTokens: 1, outputTokens: 1 };

function run(inputs: readonly HabitatInput[], from: HabitatState = emptyHabitat()): HabitatState {
  return projectAll(from, inputs);
}

describe("a thread's day", () => {
  it("lights the lamp on turn.started, puts a tool in hand, and renews progress on every event", () => {
    const started = run([at("turn.started", { userText: "build it" })]);
    const thread = started.threads.s1;
    expect(thread?.turn).toMatchObject({ tool: undefined, stumbledAt: undefined });
    const hammering = run(
      [at("tool.started", { call: call("c1", "bash", { command: "make" }) })],
      started,
    );
    expect(hammering.threads.s1?.turn?.tool).toMatchObject({ callId: "c1", name: "bash" });
    const later = run(
      [at("tool.output", { chunk: "...", callId: "c1" }, { ms: 5_000 })],
      hammering,
    );
    expect(later.threads.s1?.turn?.lastProgressAt).toBe(later.asOf);
    const done = run([at("tool.finished", { callId: "c1", output: "ok", isError: false })], later);
    expect(done.threads.s1?.turn?.tool).toMatchObject({ callId: "c1", until: done.asOf });
    expect(done.threads.s1?.turn?.stumbledAt).toBeUndefined();
  });

  it("stumbles once on a tool error, but a refused call is not a stumble", () => {
    const errored = run([
      at("turn.started", { userText: "go" }),
      at("tool.started", { call: call("c1", "bash", { command: "false" }) }),
      at("tool.finished", { callId: "c1", output: "exit 1", isError: true }),
    ]);
    expect(errored.threads.s1?.turn?.stumbledAt).toBe(errored.asOf);
    const refused = run([
      at("turn.started", { userText: "go" }),
      at("tool.started", { call: call("c2", "bash", { command: "rm -rf" }) }),
      at("gate.ask", {
        ask: { tool: "bash", callId: "c2", arguments: { command: "rm -rf" }, rule: "default" },
      }),
      at("gate.permission", {
        decision: { tool: "bash", callId: "c2", verdict: "denied", gate: "user", asked: true },
      }),
      at("tool.finished", { callId: "c2", output: "declined by user", isError: true }),
    ]);
    expect(refused.threads.s1?.turn?.stumbledAt).toBeUndefined();
  });

  it("comes back with a crate when the turn changed files, shelves it when viewed, and plants the tree once", () => {
    const back = run([
      at("turn.started", { userText: "write notes" }),
      at("turn.completed", { message: said("Wrote notes.txt."), usage }),
      at("changes.updated", { paths: ["notes.txt"], turn: 1 }),
    ]);
    expect(back.threads.s1?.turn).toBeUndefined();
    expect(back.threads.s1?.back).toEqual({
      at: expect.any(String),
      preview: "Wrote notes.txt.",
      changes: ["notes.txt"],
    });
    expect(crateOf(back.threads.s1 as NonNullable<typeof back.threads.s1>)?.changes).toEqual([
      "notes.txt",
    ]);
    const viewed = run([keeper("keeper.viewed", { sessionId: "s1" })], back);
    expect(viewed.threads.s1?.back).toBeUndefined();
    expect(viewed.storehouse.shelves).toEqual([
      { thread: "s1", creature: undefined, title: "", deliveredAt: viewed.asOf, changes: 1 },
    ]);
    expect(viewed.landmarks.map((landmark) => landmark.kind)).toEqual(["tree"]);
    expect(viewed.history.map((happening) => happening.kind)).toEqual(["delivered", "first"]);
    const again = run(
      [
        at("turn.started", { userText: "more" }),
        at("turn.completed", { message: said("More."), usage }),
        at("changes.updated", { paths: ["a.ts", "b.ts"], turn: 2 }),
        keeper("keeper.viewed", { sessionId: "s1" }),
      ],
      viewed,
    );
    expect(again.landmarks).toHaveLength(1);
    expect(again.storehouse.shelves).toHaveLength(2);
  });

  it("comes back with a crate when nothing changed, labelled by the creature's report line", () => {
    const back = run([
      at("turn.started", { userText: "say hi" }),
      at("turn.completed", { message: said("Hi."), usage }),
    ]);
    expect(crateOf(back.threads.s1 as NonNullable<typeof back.threads.s1>)).toEqual({
      at: back.asOf,
      preview: "Hi.",
      changes: [],
    });
    expect(back.threads.s1?.report).toBeUndefined();
    const reported = run(
      [
        at("extension.notice", {
          extension: "creature",
          level: "info",
          message: "Said hello.\nNothing to change.",
          detail: { origin: { kind: "creature", creature: "tinker", thread: "s1" }, entryId: "e1" },
        }),
        at("extension.notice", {
          extension: "memory",
          level: "info",
          message: "flushed",
        }),
      ],
      back,
    );
    expect(reported.threads.s1?.report).toBe("Said hello. Nothing to change.");
    const viewed = run([keeper("keeper.viewed", { sessionId: "s1" })], reported);
    expect(viewed.storehouse.shelves).toMatchObject([{ thread: "s1", changes: 0 }]);
    expect(viewed.landmarks.map((landmark) => landmark.kind)).toEqual(["tree"]);
    const next = run([at("turn.started", { userText: "again" })], viewed);
    expect(next.threads.s1?.report).toBeUndefined();
  });

  it("keeps the introduction frame off the crate: a frame notice is progress, not a report", () => {
    const framed = run([
      at("turn.started", { userText: "hello" }),
      at("extension.notice", {
        extension: "creature",
        level: "info",
        message: "You are Tinker...",
        detail: { origin: { kind: "creature", creature: "tinker", thread: "s1" }, kind: "frame" },
      }),
    ]);
    expect(framed.threads.s1?.report).toBeUndefined();
    expect(framed.threads.s1?.turn?.lastProgressAt).toBe(framed.asOf);
  });

  it("goes idle at once when interrupted, with nothing to carry", () => {
    const stopped = run([
      at("turn.started", { userText: "wait" }),
      at("turn.interrupted", { message: said("Working on it") }),
    ]);
    expect(stopped.threads.s1).toMatchObject({
      turn: undefined,
      back: undefined,
      failure: undefined,
    });
    expect(stopped.threads.s1?.restingSince).toBe(stopped.asOf);
  });

  it("counts bench notes from the queue and keeps the title from session.state", () => {
    const state = run([
      at("session.state", {
        model: "m",
        thinking: false,
        title: "Lights",
        leafId: null,
        quiet: false,
        undoable: false,
        redoable: false,
      }),
      at("queue.changed", { queued: [{ id: "q2", text: "second", behavior: "queue" }] }),
    ]);
    expect(state.threads.s1).toMatchObject({ title: "Lights", queued: 1 });
    expect(run([at("queue.changed", { queued: [] })], state).threads.s1?.queued).toBe(0);
  });

  it("paints replayed history as a known thread, never as a live turn", () => {
    const replayed = run([
      at("turn.started", { userText: "old", replay: true }),
      at("turn.completed", { message: said("done"), usage, replay: true }),
      at("gate.ask", {
        ask: { tool: "bash", callId: "c9", arguments: {}, rule: "default" },
        replay: true,
      }),
    ]);
    expect(replayed.threads.s1).toMatchObject({ turn: undefined, back: undefined, asks: {} });
  });
});

describe("blocked, and the repair after a third failure", () => {
  const failing = (n: number) => [
    at("turn.started", { userText: `try ${n}` }),
    at("engine.error", {
      error: { name: "Error", message: "provider answered 529 overloaded\nstack" },
    }),
  ];

  it("blocks on an error during a turn and clears on the next turn", () => {
    const blocked = run(failing(1));
    expect(blocked.threads.s1?.failure).toMatchObject({
      message: "provider answered 529 overloaded",
    });
    expect(blocked.threads.s1?.failures).toBe(1);
    const retried = run([at("turn.started", { userText: "again" })], blocked);
    expect(retried.threads.s1?.failure).toBeUndefined();
    expect(retried.threads.s1?.failures).toBe(1);
  });

  it("ignores an error between turns, as the desk does, and a process-level error", () => {
    const settled = run([
      at("turn.started", { userText: "go" }),
      at("turn.completed", { message: said("ok"), usage }),
      at("engine.error", { error: { name: "Error", message: "settling failed" } }),
    ]);
    expect(settled.threads.s1?.failure).toBeUndefined();
    const process = run([
      at("engine.error", { error: { name: "Error", message: "boom" } }, { sessionId: "" }),
    ]);
    expect(Object.keys(process.threads)).toEqual([]);
  });

  it("counts failures in a row, resets on a completion, and viewing clears the block", () => {
    const thrice = run([...failing(1), ...failing(2), ...failing(3)]);
    expect(thrice.threads.s1?.failures).toBe(3);
    const viewed = run([keeper("keeper.viewed", { sessionId: "s1" })], thrice);
    expect(viewed.threads.s1?.failure).toBeUndefined();
    expect(viewed.threads.s1?.failures).toBe(3);
    const mended = run(
      [
        at("turn.started", { userText: "once more" }),
        at("turn.completed", { message: said("fixed"), usage }),
      ],
      viewed,
    );
    expect(mended.threads.s1?.failures).toBe(0);
  });

  it("drops the failure when the session is removed and keeps the thread when restored", () => {
    const removed = run([
      ...failing(1),
      at("session.removed", { sessionId: "s1" }, { sessionId: "" }),
    ]);
    expect(removed.threads.s1).toMatchObject({ removed: true, failure: undefined });
    expect(
      run([at("session.restored", { sessionId: "s1" }, { sessionId: "" })], removed).threads.s1
        ?.removed,
    ).toBe(false);
  });
});

describe("the bell", () => {
  it("rings for an ask until its answer, never for a replayed ask or one already answered", () => {
    const asked = run([
      at("turn.started", { userText: "go" }),
      at("tool.started", { call: call("c1", "bash", { command: "echo served" }) }),
      at("gate.ask", {
        ask: { tool: "bash", callId: "c1", arguments: { command: "echo served" }, rule: "default" },
      }),
    ]);
    expect(ringingTheBell(asked)).toEqual([
      {
        kind: "ask",
        key: "ask:c1",
        sessionId: "s1",
        callId: "c1",
        tool: "bash",
        subject: "echo served",
        since: asked.asOf,
      },
    ]);
    const answered = run(
      [
        at("gate.permission", {
          decision: { tool: "bash", callId: "c1", verdict: "granted", gate: "user", asked: true },
        }),
        at("gate.ask", { ask: { tool: "bash", callId: "c1", arguments: {}, rule: "default" } }),
      ],
      asked,
    );
    expect(ringingTheBell(answered)).toEqual([]);
  });

  it("rings for a decision made in the keeper's name until the keeper overturns it or lets it stand, never for a replayed one", () => {
    const decidedFor = (recordId: string, sessionId: string, replay = false) =>
      at(
        "extension.notice",
        {
          extension: "keeper",
          level: "info",
          message: `decided for you: bash (shell.read) · overturn it with POST /creatures/{slug}/overturn { recordId: "${recordId}" }`,
          detail: {
            recordId,
            ruleClass: "shell.read",
            callId: "c1",
            tool: "bash",
            creature: "wren",
          },
          ...(replay && { replay }),
        },
        { sessionId },
      );
    const first = decidedFor("r7", "s1");
    const decided = run([first, decidedFor("r8", "s2", true)]);
    expect(ringingTheBell(decided)).toEqual([
      {
        kind: "decided",
        key: "decided:r7",
        recordId: "r7",
        sessionId: "s1",
        creature: "wren",
        ruleClass: "shell.read",
        tool: "bash",
        at: first.ts,
        since: first.ts,
      },
    ]);
    expect(ringingTheBell(decided).map(bellLine)).toEqual(["decided for you · approved bash"]);
    const nameless = run([
      at(
        "extension.notice",
        { extension: "keeper", level: "info", message: "decided for you", detail: {} },
        { sessionId: "s3" },
      ),
    ]);
    expect(ringingTheBell(nameless)).toEqual([]);
    const standing = run([keeper("keeper.decided", { standing: [] })], decided);
    expect(ringingTheBell(standing)).toEqual([]);
    const removed = run([at("session.removed", { sessionId: "s1" }, { sessionId: "" })], decided);
    expect(ringingTheBell(removed)).toEqual([]);
  });

  it("rings for the memory inbox from the tally", () => {
    const tally = run([
      at(
        "memory.inbox",
        { count: 2, staged: 2, airlock: 0, proposals: 0, contradictions: 0 },
        { sessionId: "" },
      ),
    ]);
    expect(ringingTheBell(tally)).toEqual([{ kind: "inbox", key: "inbox", count: 2 }]);
    const cleared = run(
      [
        at(
          "memory.inbox",
          { count: 0, staged: 0, airlock: 0, proposals: 0, contradictions: 0 },
          { sessionId: "" },
        ),
      ],
      tally,
    );
    expect(ringingTheBell(cleared)).toEqual([]);
  });
});

describe("children", () => {
  it("light a loft lantern from child.started to child.finished and belong to the parent's creature", () => {
    const lit = run([
      keeper("keeper.sessions", {
        sessions: [
          {
            id: "s1",
            title: "parent",
            createdAt: "2026-11-05T11:00:00.000Z",
            lastActivityAt: "2026-11-05T11:00:00.000Z",
            messageCount: 1,
            bot: "tinker",
          },
        ],
      }),
      at("turn.started", { userText: "delegate" }),
      at("child.started", { callId: "d1", sessionId: "q2", title: "audit", bot: "researcher" }),
    ]);
    expect(lit.threads.s1?.children).toEqual(["q2"]);
    expect(lit.threads.q2).toMatchObject({
      kind: "child",
      parent: "s1",
      creature: "researcher",
      title: "audit",
    });
    expect(lit.threads.q2?.turn).toBeDefined();
    const out = run(
      [at("child.finished", { callId: "d1", sessionId: "q2", outcome: "completed", usage })],
      lit,
    );
    expect(out.threads.q2).toMatchObject({ turn: undefined, outcome: "completed" });
    const unnamed = run([
      at("turn.started", { userText: "d" }),
      at("child.started", { callId: "d2", title: "x" }),
    ]);
    expect(Object.keys(unnamed.threads)).toEqual(["s1"]);
  });
});

describe("cold start", () => {
  const rows = [
    {
      id: "w",
      title: "working",
      createdAt: "2026-11-05T11:00:00.000Z",
      lastActivityAt: "2026-11-05T11:30:00.000Z",
      messageCount: 2,
      bot: "tinker",
      live: true,
      working: true,
    },
    {
      id: "a",
      title: "asking",
      createdAt: "2026-11-05T11:00:00.000Z",
      lastActivityAt: "2026-11-05T11:40:00.000Z",
      messageCount: 2,
      live: true,
      working: true,
      waiting: { asks: 1, tools: ["bash"] },
    },
    {
      id: "q",
      title: "quiet",
      createdAt: "2026-11-05T10:00:00.000Z",
      lastActivityAt: "2026-11-05T10:30:00.000Z",
      messageCount: 4,
      changes: { files: 2, added: 3, deleted: 1 },
    },
  ];

  it("seats the desk's rows so a stead opened mid-day is right before the first event", () => {
    const state = coldStart({ at: "2026-11-05T12:00:00.000Z", sessions: rows, offsetMinutes: -60 });
    expect(state.house.offsetMinutes).toBe(-60);
    expect(state.threads.w).toMatchObject({ creature: "tinker", title: "working" });
    expect(state.threads.w?.turn).toMatchObject({
      startedAt: "2026-11-05T11:30:00.000Z",
      lastProgressAt: "2026-11-05T12:00:00.000Z",
    });
    expect(ringingTheBell(state)).toEqual([
      expect.objectContaining({ kind: "ask", sessionId: "a", callId: "cold:a:0", tool: "bash" }),
    ]);
    expect(state.threads.q).toMatchObject({ turn: undefined, back: undefined });
  });

  it("swaps placeholder asks for the server's pending asks and drops the ones it no longer holds", () => {
    const state = coldStart({ at: "2026-11-05T12:00:00.000Z", sessions: rows });
    const reconciled = run(
      [
        keeper("keeper.asks", {
          asks: [
            {
              sessionId: "a",
              callId: "c7",
              tool: "bash",
              arguments: { command: "echo" },
              askedAt: "2026-11-05T11:41:00.000Z",
            },
          ],
        }),
      ],
      state,
    );
    expect(ringingTheBell(reconciled).map((item) => item.key)).toEqual(["ask:c7"]);
    const emptied = run([keeper("keeper.asks", { asks: [] })], reconciled);
    expect(ringingTheBell(emptied)).toEqual([]);
  });

  it("seats creatures and adopts their conversation and threads", () => {
    const state = coldStart({
      at: "2026-11-05T12:00:00.000Z",
      sessions: rows,
      creatures: [
        {
          slug: "tinker",
          name: "Tinker",
          skin: "ridge-tinker",
          seed: 9,
          workshop: { substrate: "host", node: "moak-main" },
          conversation: "q",
          threads: [{ id: "w", kind: "thread" }],
        },
      ],
    });
    expect(state.creatures.tinker).toMatchObject({
      name: "Tinker",
      skin: "ridge-tinker",
      conversation: "q",
    });
    expect(state.threads.q).toMatchObject({ creature: "tinker", kind: "conversation" });
    expect(state.landmarks.map((landmark) => [landmark.kind, landmark.creature])).toEqual([
      ["workshop", "tinker"],
    ]);
  });
});

describe("the stead grows and never shrinks", () => {
  it("raises a workshop once per creature, remembers it as the creature's first first, and boards it up on removal", () => {
    const raised = run([ranch("creature.changed", { slug: "tinker", change: "created" })]);
    expect(raised.history.map((h) => h.kind)).toEqual(["raised", "first"]);
    const renamed = withCreatures(
      raised,
      [{ slug: "tinker", name: "Tinker II" }],
      new Date(clock).toISOString(),
    );
    expect(renamed.creatures.tinker?.name).toBe("Tinker II");
    expect(renamed.history).toHaveLength(2);
    expect(renamed.creatures.tinker?.workshop.raisedAt).toBe(
      raised.creatures.tinker?.workshop.raisedAt,
    );
    const boarded = run(
      [ranch("creature.changed", { slug: "tinker", change: "removed" })],
      renamed,
    );
    expect(boarded.creatures.tinker?.workshop.boardedAt).toBe(boarded.asOf);
    expect(boarded.history.at(-1)?.kind).toBe("boarded");
    expect(
      run([ranch("workshop.health", { creature: "tinker", health: "up" })], raised).creatures.tinker
        ?.workshop.health,
    ).toBe("up");
  });

  it("fences a parcel when a machine joins, fogs it when it drops, builds mills from its servers", () => {
    const fenced = run([
      ranch("mesh.parcel", {
        parcel: {
          id: "spark",
          name: "spark-ad4d",
          roles: ["host"],
          online: true,
          path: "direct",
          servers: [{ id: "ollama", name: "Ollama", loaded: ["qwen"] }],
        },
      }),
    ]);
    expect(fenced.parcels.spark).toMatchObject({ online: true, path: "direct" });
    expect(fenced.mills["spark/ollama"]).toMatchObject({
      parcel: "spark",
      loaded: ["qwen"],
      busy: false,
    });
    expect(fenced.history.map((h) => h.kind)).toEqual(["built", "fenced"]);
    const fogged = run(
      [
        ranch("mesh.parcel", {
          parcel: { id: "spark", name: "spark-ad4d", roles: ["host"], online: false },
        }),
      ],
      fenced,
    );
    expect(fogged.parcels.spark).toMatchObject({
      online: false,
      path: undefined,
      fencedAt: fenced.parcels.spark?.fencedAt,
    });
    expect(fogged.history.at(-1)?.kind).toBe("fogged");
    const cleared = run(
      [
        ranch("mesh.parcel", {
          parcel: { id: "spark", name: "spark-ad4d", roles: ["host"], online: true, path: "relay" },
        }),
      ],
      fogged,
    );
    expect(cleared.history.at(-1)?.kind).toBe("cleared");
    const turning = run(
      [
        ranch("models.changed", {
          node: "spark",
          servers: [{ id: "ollama", name: "Ollama", loaded: ["qwen", "llama"], busy: true }],
        }),
      ],
      cleared,
    );
    expect(turning.mills["spark/ollama"]).toMatchObject({
      loaded: ["qwen", "llama"],
      busy: true,
      builtAt: fenced.mills["spark/ollama"]?.builtAt,
    });
    expect(Object.keys(turning.mills)).toHaveLength(1);
  });

  it("opens a gate for a grant, hangs a lantern on each walk, latches it on revoke, and plants the lantern post once", () => {
    const grant = {
      id: "g1",
      creature: "tinker",
      node: "spark",
      caps: ["exec echo"],
      expiresAt: "2026-11-06T00:00:00.000Z",
    };
    const opened = run([ranch("mesh.grant", { grant })]);
    expect(opened.gates.g1).toMatchObject({
      creature: "tinker",
      parcel: "spark",
      latchedAt: undefined,
      walks: 0,
    });
    const walked = run(
      [
        ranch("mesh.walked", { grantId: "g1", creature: "tinker", node: "spark", callId: "c1" }),
        ranch("mesh.walked", { grantId: "g1", creature: "tinker", node: "spark", callId: "c2" }),
      ],
      opened,
    );
    expect(walked.gates.g1).toMatchObject({ walks: 2, lastWalkAt: walked.asOf });
    expect(walked.landmarks.map((l) => l.kind)).toEqual(["lantern-post"]);
    const latched = run([ranch("mesh.grant", { grant, revoked: true })], walked);
    expect(latched.gates.g1?.latchedAt).toBe(latched.asOf);
    expect(latched.history.at(-1)?.kind).toBe("latched");
    expect(
      run(
        [
          ranch("mesh.walked", {
            grantId: "nope",
            creature: "tinker",
            node: "spark",
            callId: "c3",
          }),
        ],
        latched,
      ).gates,
    ).toBe(latched.gates);
    const reopened = run([ranch("mesh.grant", { grant })], latched);
    expect(reopened.gates.g1?.latchedAt).toBeUndefined();
    expect(reopened.gates.g1?.walks).toBe(2);
  });

  it("keeps the chore board, adopts a fired routine's thread, and raises the weathervane for the first chore run while the keeper was away", () => {
    const routine = { id: "r1", title: "nightly tidy" };
    const scheduled = run([
      ranch("creature.changed", { slug: "tinker", change: "created" }),
      ranch("routine.scheduled", {
        creature: "tinker",
        routine,
        nextAt: "2026-11-06T02:00:00.000Z",
      }),
    ]);
    expect(scheduled.creatures.tinker?.chores).toEqual([
      {
        id: "r1",
        title: "nightly tidy",
        nextAt: "2026-11-06T02:00:00.000Z",
        lastRanAt: undefined,
        running: undefined,
      },
    ]);
    const fired = run(
      [ranch("routine.fired", { creature: "tinker", routine, sessionId: "run1" })],
      scheduled,
    );
    expect(fired.creatures.tinker?.chores[0]?.running).toBe("run1");
    expect(fired.threads.run1).toMatchObject({
      kind: "routine",
      creature: "tinker",
      title: "nightly tidy",
    });
    const present = run(
      [
        ranch("routine.finished", {
          creature: "tinker",
          routine,
          sessionId: "run1",
          outcome: "completed",
        }),
      ],
      fired,
    );
    expect(present.landmarks.map((l) => l.kind)).toEqual(["workshop"]);
    const away = run(
      [
        keeper("keeper.presence", { present: false }),
        ranch("routine.fired", { creature: "tinker", routine, sessionId: "run2" }),
        ranch("routine.finished", {
          creature: "tinker",
          routine,
          sessionId: "run2",
          outcome: "completed",
        }),
      ],
      present,
    );
    expect(away.landmarks.map((l) => l.kind)).toEqual(["workshop", "weathervane"]);
    expect(away.creatures.tinker?.chores[0]).toMatchObject({
      running: undefined,
      lastRanAt: away.asOf,
    });
    const unknownCreature = run([
      ranch("routine.scheduled", { creature: "ghost", routine, nextAt: null }),
    ]);
    expect(unknownCreature.creatures.ghost?.chores[0]?.nextAt).toBeUndefined();
  });

  it("shows a spyglass while a screen session is live and remembers the first takeover with a chair", () => {
    const viewing = run([
      ranch("screen.session", { id: "v1", node: "moak-main", kind: "view", live: true }),
    ]);
    expect(viewing.spyglasses.v1).toMatchObject({ parcel: "moak-main", kind: "view" });
    expect(viewing.landmarks).toEqual([]);
    const control = run(
      [ranch("screen.session", { id: "c1", node: "moak-main", kind: "control", live: true })],
      viewing,
    );
    expect(control.landmarks.map((l) => l.kind)).toEqual(["chair"]);
    const over = run(
      [ranch("screen.session", { id: "v1", node: "moak-main", kind: "view", live: false })],
      control,
    );
    expect(Object.keys(over.spyglasses)).toEqual(["c1"]);
  });

  it("pauses a thread on turn.waiting and resumes it", () => {
    const waiting = run([
      at("turn.started", { userText: "go" }),
      ranch("turn.waiting", {
        sessionId: "s1",
        reason: "overloaded",
        until: "2026-11-05T12:05:00.000Z",
      }),
    ]);
    expect(waiting.threads.s1?.waiting).toMatchObject({ reason: "overloaded" });
    expect(
      run([ranch("turn.resumed", { sessionId: "s1" })], waiting).threads.s1?.waiting,
    ).toBeUndefined();
    expect(
      run([at("turn.completed", { message: said("ok"), usage })], waiting).threads.s1?.waiting,
    ).toBeUndefined();
  });

  it("digs the well for the first turn worked through the night, in the house's own zone", () => {
    const midnightUtc = Date.parse("2026-11-06T00:00:00.000Z");
    expect(throughTheNight(midnightUtc, midnightUtc + 5 * hour, 0)).toBe(true);
    expect(throughTheNight(midnightUtc + 2 * hour, midnightUtc + 5 * hour, 0)).toBe(false);
    expect(throughTheNight(midnightUtc - 2 * hour, midnightUtc + 3 * hour, 0)).toBe(false);
    expect(throughTheNight(midnightUtc, midnightUtc + 5 * hour, -5 * 60)).toBe(false);
    expect(throughTheNight(midnightUtc - 5 * hour, midnightUtc, -5 * 60)).toBe(true);
    const start = emptyHabitat(0);
    const dug = run(
      [
        {
          ...at("turn.started", { userText: "long" }),
          ts: "2026-11-06T00:30:00.000Z",
        } as BusEnvelope,
        {
          ...at("turn.completed", { message: said("done"), usage }),
          ts: "2026-11-06T04:30:00.000Z",
        } as BusEnvelope,
      ],
      start,
    );
    expect(dug.landmarks.map((l) => l.kind)).toEqual(["well"]);
  });

  it("folds shelves beyond a wing's worth and gains a wing, and bounds the history", () => {
    let state = emptyHabitat();
    for (let i = 0; i < shelvesPerWing + 3; i++) {
      state = run(
        [
          at("turn.started", { userText: "n" }, { sessionId: `s${i}` }),
          at("turn.completed", { message: said("n"), usage }, { sessionId: `s${i}` }),
          at("changes.updated", { paths: ["f"] }, { sessionId: `s${i}` }),
          keeper("keeper.viewed", { sessionId: `s${i}` }),
        ],
        state,
      );
    }
    expect(state.storehouse).toMatchObject({ folded: 3, wings: 2 });
    expect(state.storehouse.shelves).toHaveLength(shelvesPerWing);
    expect(state.storehouse.shelves[0]?.thread).toBe("s3");
    expect(state.history.filter((h) => h.kind === "wing")).toHaveLength(1);
    for (let i = 0; i < historyLimit; i++) {
      state = run(
        [
          ranch("mesh.parcel", {
            parcel: { id: `n${i}`, name: `n${i}`, roles: ["pasture"], online: true },
          }),
        ],
        state,
      );
    }
    expect(state.history).toHaveLength(historyLimit);
  });
});

describe("the chore board", () => {
  it("posts each creature's routines from the wire with the next run, and takes down the ones gone", () => {
    const posted = run([
      keeper("keeper.routines", {
        creature: "tinker",
        routines: [
          routineView("docs-changes", "docs changes", "2026-11-05T12:02:00.000Z"),
          routineView("stamp-note", "stamp note", null),
        ],
      }),
    ]);
    expect(posted.creatures.tinker?.chores).toEqual([
      {
        id: "docs-changes",
        title: "docs changes",
        nextAt: "2026-11-05T12:02:00.000Z",
        lastRanAt: undefined,
        running: undefined,
      },
      {
        id: "stamp-note",
        title: "stamp note",
        nextAt: undefined,
        lastRanAt: undefined,
        running: undefined,
      },
    ]);
    const thinned = run(
      [
        keeper("keeper.routines", {
          creature: "tinker",
          routines: [routineView("stamp-note", "stamp note", "2026-11-05T13:00:00.000Z")],
        }),
      ],
      posted,
    );
    expect(thinned.creatures.tinker?.chores.map((chore) => [chore.id, chore.nextAt])).toEqual([
      ["stamp-note", "2026-11-05T13:00:00.000Z"],
    ]);
  });
});

function routineView(id: string, title: string, nextRunAt: string | null): RoutineView {
  return {
    creature: "tinker",
    id,
    file: `${id}.md`,
    routine: { id, title } as unknown as RoutineView["routine"],
    problem: null,
    grants: null,
    schedule: { enabled: true, disabled: null, nextRunAt, consecutiveErrors: 0, retryAt: null },
    activeRunId: null,
    lastRun: null,
  };
}

describe("stamps", () => {
  it("records the last event id and time, and keeper notices move the clock without an id", () => {
    const envelope = at("turn.started", { userText: "x" });
    const stamped = project(emptyHabitat(), envelope);
    expect(stamped).toMatchObject({ lastEventId: envelope.id, asOf: envelope.ts });
    const noticed = project(stamped, keeper("keeper.presence", { present: false }));
    expect(noticed.lastEventId).toBe(envelope.id);
    expect(noticed.keeper).toEqual({ present: false, since: noticed.asOf });
    expect(project(noticed, keeper("keeper.presence", { present: false })).keeper).toEqual(
      noticed.keeper,
    );
  });
});
