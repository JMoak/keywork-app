import { creatureReading, type HabitatState, type Thread } from "@keywork-app/habitat";
import type {
  BotSummary,
  BusEnvelope,
  CreatureSummary,
  PendingAsk,
  ServedRefusal,
  SessionRow,
} from "@keywork-app/protocol";
import { type Accessor, createRoot, createSignal } from "solid-js";
import { createStore, reconcile, type SetStoreFunction } from "solid-js/store";
import { describe, expect, it } from "vitest";
import { residents } from "../../companion/feed.ts";
import { createHabitatState, readEveryField, seatCreatures, withQueuedAsks } from "./habitat.ts";

const now = Date.parse("2026-11-06T06:23:10.000Z");

describe("the stead's reader over the shell's session store", () => {
  it("follows rows the store reconciles in place, as the shell does after every GET /sessions", async () => {
    const { world, setStore, dispose } = reader();
    await settle();
    expect(creatureReading(world(), "bea", now).state).toBe("idle");

    setStore("summaries", reconcile([row("conv", { working: true })], { key: "id" }));
    expect(creatureReading(world(), "bea", now)).toMatchObject({ state: "working", lamps: 1 });

    setStore(
      "summaries",
      reconcile([row("conv", { working: true }), row("t2", { working: true })], { key: "id" }),
    );
    expect(creatureReading(world(), "bea", now).lamps).toBe(2);

    setStore(
      "summaries",
      reconcile([row("conv", { working: true, waiting: { asks: 1, tools: ["write"] } })], {
        key: "id",
      }),
    );
    expect(creatureReading(world(), "bea", now)).toMatchObject({ state: "porch", asks: 1 });
    dispose();
  });

  it("keeps the wire's end of turn when the refresh sent on turn.completed still lists the row as working", async () => {
    const { world, setStore, emit, dispose } = reader();
    await settle();
    const settled = Date.parse("2026-11-06T06:24:10.000Z");
    setStore("summaries", reconcile([row("conv", { working: true })], { key: "id" }));
    expect(creatureReading(world(), "bea", settled)).toMatchObject({ state: "working", lamps: 1 });

    emit([
      {
        id: 12,
        ts: "2026-11-06T06:24:07.000Z",
        sessionId: "conv",
        type: "turn.completed",
        payload: {
          message: { role: "assistant", parts: [{ type: "text", text: "Done." }] },
          usage: { inputTokens: 1, outputTokens: 1 },
        },
      } as BusEnvelope,
    ]);
    expect(creatureReading(world(), "bea", settled)).toMatchObject({ state: "back", lamps: 0 });

    const stillSettling = { working: true, lastActivityAt: "2026-11-06T06:24:07.055Z" };
    setStore("summaries", reconcile([row("conv", stillSettling)], { key: "id" }));
    expect(creatureReading(world(), "bea", settled)).toMatchObject({ state: "back", lamps: 0 });

    const atRest = { working: false, lastActivityAt: "2026-11-06T06:24:07.055Z" };
    setStore("summaries", reconcile([row("conv", atRest)], { key: "id" }));
    expect(creatureReading(world(), "bea", settled)).toMatchObject({ state: "back", lamps: 0 });
    dispose();
  });

  it("seats what GET /creatures lists, at the time each was made, and never a plain bot", async () => {
    const listed = reader();
    await settle();
    expect(Object.keys(listed.world().creatures)).toEqual(["bea"]);
    expect(listed.world().creatures.bea?.workshop.raisedAt).toBe(beaOnTheWire.created);
    expect(residents(listed.world()).map((resident) => resident.slug)).toEqual(["bea"]);
    listed.dispose();

    const botOnly = reader({ creatures: [] });
    await settle();
    expect(botOnly.world().creatures).toEqual({});
    expect(residents(botOnly.world())).toEqual([]);
    botOnly.dispose();

    const refused = reader({ creatures: { refused: "unserved", detail: "not served" } });
    await settle();
    expect(refused.world().creatures).toEqual({});
    refused.dispose();
  });

  it("lists again when a creature changes on the wire or the bots surface moves", async () => {
    let listing: CreatureSummary[] = [];
    const { world, emit, setBots, dispose } = reader({ creatures: () => listing });
    await settle();
    expect(world().creatures).toEqual({});

    listing = [beaOnTheWire];
    emit([
      {
        id: 13,
        ts: "2026-11-06T06:24:08.000Z",
        sessionId: "",
        type: "creature.changed",
        payload: { slug: "bea", change: "created" },
      } as BusEnvelope,
    ]);
    await settle();
    expect(Object.keys(world().creatures)).toEqual(["bea"]);

    listing = [beaOnTheWire, { ...beaOnTheWire, slug: "pip", name: "Pip" }];
    setBots([bea, { ...bea, name: "pip" }]);
    await settle();
    expect(Object.keys(world().creatures).sort()).toEqual(["bea", "pip"]);
    dispose();
  });

  it("seats a listing in one pass, each creature at its own creation time", () => {
    const seated = seatCreatures(
      {
        ...createRoot(() => reader({ creatures: [] }).world()),
      } as HabitatState,
      [
        beaOnTheWire,
        { ...beaOnTheWire, slug: "pip", name: "Pip", created: "2026-11-02T00:00:00.000Z" },
      ],
    );
    expect(seated.creatures.bea?.workshop.raisedAt).toBe(beaOnTheWire.created);
    expect(seated.creatures.pip?.workshop.raisedAt).toBe("2026-11-02T00:00:00.000Z");
  });

  it("reads every field of a store row, nested ones included, into a plain copy", () => {
    const [store] = createStore({ rows: [row("conv", { waiting: { asks: 1, tools: ["bash"] } })] });
    const copy = readEveryField(store.rows);
    expect(copy).toEqual([row("conv", { waiting: { asks: 1, tools: ["bash"] } })]);
    expect(copy[0]?.waiting).not.toBe(store.rows[0]?.waiting);
  });
});

describe("the stead's asks, held to the needs-you queue", () => {
  it("lets go of an ask answered on another surface though the refresh sent before the answer lands after it", async () => {
    const [queued, setQueued] = createSignal<readonly PendingAsk[]>([]);
    const { world, setStore, emit, dispose } = reader({ asks: queued });
    await settle();
    setStore("summaries", reconcile([row("conv", { working: true })], { key: "id" }));
    emit([gateAsk(14, "c1")]);
    setQueued([pendingWrite("c1")]);
    expect(Object.keys(asksOn(world(), "conv"))).toEqual(["c1"]);
    expect(creatureReading(world(), "bea", now)).toMatchObject({ state: "porch", asks: 1 });

    emit([gatePermission(15, "c1")]);
    setQueued([]);
    const sentBeforeTheAnswer = { working: true, waiting: { asks: 1, tools: ["write"] } };
    setStore("summaries", reconcile([row("conv", sentBeforeTheAnswer)], { key: "id" }));
    expect(asksOn(world(), "conv")).toEqual({});
    expect(creatureReading(world(), "bea", now)).toMatchObject({ state: "working", asks: 0 });

    setStore("summaries", reconcile([row("conv", { working: false })], { key: "id" }));
    expect(asksOn(world(), "conv")).toEqual({});
    dispose();
  });

  it("trades the stand-ins a cold start reads off the rows for the queue's own asks, and lets them go with the queue", async () => {
    const [queued, setQueued] = createSignal<readonly PendingAsk[]>([]);
    const waitingRow = row("conv", { waiting: { asks: 1, tools: ["write"] } });
    const { world, dispose } = reader({ asks: queued, summaries: [waitingRow] });
    await settle();
    expect(asksOn(world(), "conv")).toEqual({});

    setQueued([pendingWrite("c1")]);
    expect(asksOn(world(), "conv")).toEqual({
      c1: {
        callId: "c1",
        tool: "write",
        subject: "notes/first-light.md",
        askedAt: "2026-11-06T06:23:05.000Z",
      },
    });

    setQueued([]);
    expect(asksOn(world(), "conv")).toEqual({});
    expect(creatureReading(world(), "bea", now).state).not.toBe("porch");
    dispose();
  });

  it("hands back the same world when the queue already agrees, so nothing downstream redraws", async () => {
    const { world, emit, dispose } = reader();
    await settle();
    emit([gateAsk(14, "c1")]);
    const agreed = world();
    expect(withQueuedAsks(agreed, [pendingWrite("c1")], "2026-11-06T06:23:09.000Z")).toBe(agreed);
    expect(withQueuedAsks(agreed, [], "2026-11-06T06:23:09.000Z").threads.conv?.asks).toEqual({});
    dispose();
  });
});

type Listing = readonly CreatureSummary[] | ServedRefusal | (() => readonly CreatureSummary[]);

interface ReaderOptions {
  creatures?: Listing;
  asks?: Accessor<readonly PendingAsk[]>;
  summaries?: SessionRow[];
}

function reader(options: ReaderOptions = {}): {
  world: Accessor<HabitatState>;
  setStore: SetStoreFunction<{ summaries: SessionRow[] }>;
  setBots: (bots: BotSummary[]) => void;
  emit: (batch: readonly BusEnvelope[]) => void;
  dispose: () => void;
} {
  return createRoot((dispose) => {
    const [store, setStore] = createStore<{ summaries: SessionRow[]; bots: BotSummary[] }>({
      summaries: options.summaries ?? [],
      bots: [bea],
    });
    const listeners = new Set<(batch: readonly BusEnvelope[]) => void>();
    const listing = options.creatures ?? [beaOnTheWire];
    const world = createHabitatState({
      rows: () => store.summaries,
      bots: () => store.bots,
      currentSession: () => undefined,
      asks: options.asks,
      creatures: async () => (typeof listing === "function" ? listing() : listing),
      feed: {
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      now: () => now,
      offsetMinutes: 0,
    });
    const emit = (batch: readonly BusEnvelope[]): void => {
      for (const listener of listeners) listener(batch);
    };
    return { world, setStore, setBots: (bots) => setStore("bots", bots), emit, dispose };
  });
}

const bea: BotSummary = { name: "bea", sigil: "◆", source: "project", sessions: 1 };

const beaOnTheWire: CreatureSummary = {
  slug: "bea",
  name: "bea",
  sigil: "◆",
  created: "2026-11-01T09:00:00.000Z",
  skin: "kid",
  seed: 0,
  workshop: "host",
  models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
  conversation: null,
  threads: 0,
};

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function row(id: string, extra: Partial<SessionRow>): SessionRow {
  return {
    id,
    title: "",
    createdAt: "2026-11-06T06:21:41.705Z",
    lastActivityAt: "2026-11-06T06:23:02.050Z",
    messageCount: 1,
    bot: "bea",
    ...extra,
  };
}

function asksOn(world: HabitatState, sessionId: string): Thread["asks"] {
  return world.threads[sessionId]?.asks ?? {};
}

function pendingWrite(callId: string): PendingAsk {
  return {
    sessionId: "conv",
    callId,
    tool: "write",
    arguments: { path: "notes/first-light.md" },
    askedAt: "2026-11-06T06:23:05.000Z",
  };
}

function gateAsk(id: number, callId: string): BusEnvelope {
  return {
    id,
    ts: "2026-11-06T06:23:05.000Z",
    sessionId: "conv",
    type: "gate.ask",
    payload: {
      ask: {
        tool: "write",
        callId,
        arguments: { path: "notes/first-light.md" },
        rule: "default",
      },
    },
  } as BusEnvelope;
}

function gatePermission(id: number, callId: string): BusEnvelope {
  return {
    id,
    ts: "2026-11-06T06:23:07.000Z",
    sessionId: "conv",
    type: "gate.permission",
    payload: {
      decision: { tool: "write", callId, verdict: "granted", gate: "user", asked: true },
    },
  } as BusEnvelope;
}
