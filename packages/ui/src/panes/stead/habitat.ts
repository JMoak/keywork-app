import type { ServerFeed } from "@keywork-app/client";
import {
  type CreatureSummary,
  coldStart,
  type DecidedForKeeper,
  type HabitatState,
  project,
  projectAll,
  withCreatures,
} from "@keywork-app/habitat";
import type {
  BotSummary,
  BusEnvelope,
  CreatureSummary as CreatureOnTheWire,
  PendingAsk,
  RoutineNeed,
  RoutineView,
  ServedRefusal,
  SessionRow,
} from "@keywork-app/protocol";
import { type Accessor, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import type { DecidedForYou } from "../../shell/needs-you.ts";

export interface HabitatSeams {
  rows(): readonly SessionRow[];
  bots(): readonly BotSummary[];
  currentSession(): string | undefined;
  asks?: (() => readonly PendingAsk[]) | undefined;
  chores?: (() => readonly RoutineNeed[]) | undefined;
  decided?: (() => readonly DecidedForYou[]) | undefined;
  routines?: ((creature: string) => Promise<readonly RoutineView[] | ServedRefusal>) | undefined;
  creatures?: (() => Promise<readonly CreatureOnTheWire[] | ServedRefusal>) | undefined;
  readonly feed: Pick<ServerFeed, "subscribe">;
  now(): number;
  readonly offsetMinutes: number;
}

export function createHabitatState(seams: HabitatSeams): Accessor<HabitatState> {
  const stamp = (): string => new Date(seams.now()).toISOString();
  const rows = createMemo(() => seams.rows().map(readEveryField));
  const bots = createMemo(() => seams.bots().map(readEveryField));
  const queued = seams.asks;
  const asQueued = (world: HabitatState): HabitatState =>
    queued === undefined ? world : withQueuedAsks(world, queued(), stamp());
  const [state, setState] = createSignal<HabitatState>(
    coldStart({ at: stamp(), sessions: rows(), offsetMinutes: seams.offsetMinutes }),
  );
  createEffect(
    on(
      rows,
      (sessions) =>
        setState((held) =>
          asQueued(project(held, { type: "keeper.sessions", ts: stamp(), sessions })),
        ),
      { defer: true },
    ),
  );
  if (queued !== undefined) {
    createEffect(
      on(queued, (pending) => setState((held) => withQueuedAsks(held, pending, stamp()))),
    );
  }
  const chores = seams.chores;
  if (chores !== undefined) {
    createEffect(
      on(
        () => chores().map(readEveryField),
        (needs) => setState((held) => project(held, { type: "keeper.chores", ts: stamp(), needs })),
      ),
    );
  }
  const decided = seams.decided;
  if (decided !== undefined) {
    createEffect(
      on(
        () => decided().map(readEveryField),
        (standing) =>
          setState((held) =>
            project(held, {
              type: "keeper.decided",
              ts: stamp(),
              standing: standing.map(standingDecision),
            }),
          ),
      ),
    );
  }
  createEffect(
    on(seams.currentSession, (sessionId) => {
      if (sessionId === undefined) return;
      setState((held) => project(held, { type: "keeper.viewed", ts: stamp(), sessionId }));
    }),
  );
  onCleanup(seams.feed.subscribe((batch) => setState((held) => projectAll(held, batch))));
  const readBoard = boardReader(seams.routines, (creature, routines) =>
    setState((held) => project(held, { type: "keeper.routines", ts: stamp(), creature, routines })),
  );
  onCleanup(
    seams.feed.subscribe((batch) => {
      for (const creature of choreKeepersIn(batch)) readBoard(creature);
    }),
  );
  const creatures = seams.creatures;
  if (creatures !== undefined) {
    const readSummaries = (): void => {
      void Promise.resolve()
        .then(() => creatures())
        .then(
          (listed) => {
            if (!Array.isArray(listed)) return;
            setState((held) => seatCreatures(held, listed));
            for (const creature of listed) readBoard(creature.slug);
          },
          () => undefined,
        );
    };
    createEffect(on(bots, readSummaries));
    onCleanup(
      seams.feed.subscribe((batch) => {
        if (batch.some((envelope) => envelope.type === "creature.changed")) readSummaries();
      }),
    );
  }
  return state;
}

export function seatCreatures(
  state: HabitatState,
  listed: readonly CreatureOnTheWire[],
): HabitatState {
  return listed.reduce((held, wire) => withCreatures(held, [summaryOf(wire)], wire.created), state);
}

export function withQueuedAsks(
  world: HabitatState,
  pending: readonly PendingAsk[],
  ts: string,
): HabitatState {
  const reconciled = project(world, { type: "keeper.asks", ts, asks: pending });
  return reconciled.threads === world.threads ? world : reconciled;
}

export function summaryOf(wire: CreatureOnTheWire): CreatureSummary {
  return {
    slug: wire.slug,
    name: wire.name,
    skin: wire.skin,
    seed: wire.seed,
    paused: wire.paused ?? null,
    ...(wire.conversation === null ? {} : { conversation: wire.conversation }),
  };
}

export function standingDecision(decided: DecidedForYou): DecidedForKeeper {
  return {
    recordId: decided.recordId,
    sessionId: decided.sessionId,
    creature: decided.creature,
    ruleClass: decided.ruleClass,
    tool: decided.tool,
    at: decided.since,
  };
}

export function choreKeepersIn(batch: readonly BusEnvelope[]): Set<string> {
  const keepers = new Set<string>();
  for (const envelope of batch) {
    if (envelope.type === "routine.fired" || envelope.type === "routine.needs") {
      keepers.add(envelope.payload.creature);
    } else if (envelope.type === "routine.finished") {
      keepers.add(envelope.payload.run.creature);
    }
  }
  return keepers;
}

export function houseOffsetMinutes(now = new Date()): number {
  return -now.getTimezoneOffset();
}

// A Solid store reconciled by key keeps its array and row identities, so a reader that
// only takes the array reference never learns that a row's fields changed underneath it.
export function readEveryField<T>(value: T): T {
  if (Array.isArray(value)) return value.map(readEveryField) as T;
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, held]) => [key, readEveryField(held)]),
  ) as T;
}

function boardReader(
  routines: HabitatSeams["routines"],
  post: (creature: string, routines: readonly RoutineView[]) => void,
): (creature: string) => void {
  if (routines === undefined) return () => undefined;
  return (creature) => {
    void Promise.resolve()
      .then(() => routines(creature))
      .then(
        (posted) => {
          if (Array.isArray(posted)) post(creature, posted);
        },
        () => undefined,
      );
  };
}
