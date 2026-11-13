import { toolSubject } from "@keywork-app/client";
import type {
  BusEnvelope,
  ChildStarted,
  CreatureChanged,
  EnginePayloads,
  ExtensionNotice,
  MeshGrantChange,
  Message,
  PendingAsk,
  PermissionAsk,
  PermissionDecision,
  RoutineFinished,
  RoutineNeed,
  RoutineView,
  SessionRow,
  Setting,
  WorkshopChange,
} from "@keywork-app/protocol";
import { day, hour, minute, parseTs } from "../clock/clock.ts";
import { attend } from "../yard/attention.ts";
import { type YardState, yardOf } from "../yard/types.ts";
import { proposeSetting, seatSettings, settleSetting } from "../yard/wire.ts";
import {
  type CreatureSummary,
  type GrantSummary,
  type HabitatInput,
  isBusEnvelope,
  isKeeperNotice,
  type KeeperNotice,
  type MillSummary,
  type ParcelSummary,
  type RanchEvent,
} from "./inputs.ts";
import {
  type Creature,
  crateOf,
  type DecidedForKeeper,
  emptyThread,
  type HabitatState,
  type Happening,
  type HappeningKind,
  type HeldChore,
  hasLandmark,
  historyLimit,
  type LandmarkKind,
  type LiveTurn,
  type NodeId,
  previewLimit,
  type SessionId,
  type Slug,
  shelvesPerWing,
  type Thread,
  type ThreadKind,
  type WaitingReason,
} from "./types.ts";

export function project(state: HabitatState, input: HabitatInput): HabitatState {
  const next = absorb(state, input);
  const stamped = next.asOf === input.ts ? next : { ...next, asOf: input.ts };
  if (isKeeperNotice(input) || stamped.lastEventId === input.id) return stamped;
  return { ...stamped, lastEventId: input.id };
}

export function projectAll(state: HabitatState, inputs: Iterable<HabitatInput>): HabitatState {
  let current = state;
  for (const input of inputs) current = project(current, input);
  return current;
}

export function withSessions(
  state: HabitatState,
  sessions: readonly SessionRow[],
  at: string,
): HabitatState {
  return sessions.reduce(
    (current, row) => withThread(current, row.id, at, (thread) => seatRow(thread, row, at)),
    state,
  );
}

export function withSettings(
  state: HabitatState,
  settings: readonly Setting[],
  at: string,
): HabitatState {
  return withYard(state, (yard) => seatSettings(yard, settings, at));
}

export function withCreatures(
  state: HabitatState,
  creatures: readonly CreatureSummary[],
  at: string,
): HabitatState {
  return creatures.reduce((current, summary) => upsertCreature(current, summary, at), state);
}

function absorb(state: HabitatState, input: HabitatInput): HabitatState {
  if (isKeeperNotice(input)) return absorbKeeper(state, input);
  if (isBusEnvelope(input)) return absorbBus(state, input);
  return absorbRanch(state, input);
}

function absorbBus(state: HabitatState, envelope: BusEnvelope): HabitatState {
  const replay = envelope.payload.replay === true;
  const id = envelope.sessionId;
  const at = envelope.ts;
  switch (envelope.type) {
    case "turn.started":
      return replay
        ? touch(state, id, at)
        : withThread(state, id, at, (thread) => startTurn(thread, at));
    case "turn.delta":
    case "tool.output":
      return replay ? state : progress(state, id, at);
    case "turn.completed":
      return replay ? touch(state, id, at) : completeTurn(state, id, envelope.payload.message, at);
    case "turn.interrupted":
      return replay
        ? touch(state, id, at)
        : withThread(state, id, at, (thread) => endTurn(thread, at));
    case "turn.waiting":
      return withThread(state, id, at, (thread) =>
        holdTurn(thread, envelope.payload.reason, envelope.payload.until, at),
      );
    case "turn.resumed":
      return withThread(state, id, at, resumeTurn);
    case "queue.changed":
      return withThread(state, id, at, (thread) => ({
        ...thread,
        queued: envelope.payload.queued.length,
      }));
    case "tool.started":
      return replay
        ? state
        : withThread(state, id, at, (thread) => pickUpTool(thread, envelope.payload.call, at));
    case "tool.finished":
      return replay
        ? state
        : withThread(state, id, at, (thread) => putDownTool(thread, envelope.payload, at));
    case "gate.ask":
      return replay
        ? state
        : withThread(state, id, at, (thread) => ask(thread, envelope.payload.ask, at));
    case "gate.permission":
      return withThread(state, id, at, (thread) => decide(thread, envelope.payload.decision, at));
    case "engine.error":
      return id === ""
        ? state
        : failTurn(state, id, envelope.id, envelope.payload.error.message, at);
    case "session.state":
      return withThread(state, id, at, (thread) => ({
        ...thread,
        title: envelope.payload.title,
        creature: envelope.payload.bot ?? thread.creature,
      }));
    case "child.started":
      return replay ? state : lightLantern(state, id, envelope.payload, at);
    case "child.finished":
      return replay
        ? state
        : snuffLantern(state, envelope.payload.sessionId, envelope.payload.outcome, at);
    case "changes.updated":
      return withThread(state, id, at, (thread) => noteChanges(thread, envelope.payload.paths));
    case "memory.inbox":
      return { ...state, porch: { ...state.porch, inbox: envelope.payload } };
    case "session.removed":
      return withThread(
        forgetDecided(state, envelope.payload.sessionId),
        envelope.payload.sessionId,
        at,
        (thread) => ({ ...thread, removed: true, failure: undefined }),
      );
    case "session.restored":
      return withThread(state, envelope.payload.sessionId, at, (thread) => ({
        ...thread,
        removed: false,
      }));
    case "creature.changed":
      return creatureChanged(state, envelope.payload, at);
    case "show.proposed":
      return setOut(state, envelope.payload.setting, at);
    case "show.settled":
      return withYard(state, (yard) => settleSetting(yard, envelope.payload, at));
    case "routine.fired":
      return fireChore(
        state,
        envelope.payload.creature,
        choreOf(envelope.payload.routineId),
        envelope.payload.sessionId,
        at,
      );
    case "routine.finished":
      return restChore(state, envelope.payload, envelope.id, at);
    case "routine.needs":
      return holdChores(
        state,
        envelope.payload.creature,
        envelope.payload.routineId,
        envelope.payload.items,
      );
    case "workshop.changed":
      return workshopChanged(state, envelope.payload, at);
    case "mesh.grant":
      return gateChanged(state, envelope.payload, at);
    case "mesh.walked":
      return walkThrough(
        state,
        envelope.payload.grantId,
        envelope.payload.origin.creature,
        envelope.id,
        at,
      );
    case "models.changed":
    case "workspace.changed":
    case "mesh.listener":
    case "mesh.pairing":
    case "mesh.pair":
    case "mesh.revocation":
    case "mesh.peers":
      return state;
    case "extension.notice":
      if (id === "") return state;
      return envelope.payload.extension === keeperExtension
        ? replay
          ? state
          : decideForKeeper(state, id, envelope.payload, at)
        : noteReport(state, id, envelope.payload, at);
    case "gate.preset":
    case "session.mode":
    case "context.injected":
    case "memory.decided":
    case "model.fallback":
    case "diagnostics.published":
    case "shell.reset":
    case "session.settled":
    case "session.tree":
    case "surface.changed":
      return id === "" ? state : progress(state, id, at);
  }
}

function creatureChanged(state: HabitatState, change: CreatureChanged, at: string): HabitatState {
  switch (change.change) {
    case "created":
      return upsertCreature(state, { slug: change.slug, name: change.slug }, at);
    case "removed":
      return boardUp(state, change.slug, at);
    case "paused":
      return withCreature(state, change.slug, (held) => ({ ...held, paused: held.paused ?? at }));
    case "resumed":
      return withCreature(state, change.slug, (held) => ({ ...held, paused: undefined }));
    case "updated":
    case "conversation":
    case "threads":
      return state;
  }
}

function choreOf(routineId: string): { id: string; title: string } {
  return { id: routineId, title: routineId };
}

function restChore(
  state: HabitatState,
  finished: RoutineFinished,
  eventId: number,
  at: string,
): HabitatState {
  const { creature, routineId, sessionId } = finished.run;
  return finishChore(state, creature, choreOf(routineId), sessionId ?? "", eventId, at);
}

function workshopChanged(state: HabitatState, change: WorkshopChange, at: string): HabitatState {
  const { workshop } = change;
  const seated =
    state.creatures[workshop.creature] === undefined
      ? upsertCreature(state, { slug: workshop.creature, name: workshop.creature }, at)
      : state;
  if (change.change === "removed") return boardUp(seated, workshop.creature, at);
  return withCreature(seated, workshop.creature, (held) => ({
    ...held,
    workshop: {
      ...held.workshop,
      substrate: workshop.substrate,
      health: workshopHealthOf(change.change) ?? held.workshop.health,
      boardedAt: undefined,
    },
  }));
}

function workshopHealthOf(change: WorkshopChange["change"]): Creature["workshop"]["health"] {
  if (change === "started") return "up";
  if (change === "stopped") return "down";
  return undefined;
}

function gateChanged(state: HabitatState, change: MeshGrantChange, at: string): HabitatState {
  switch (change.change) {
    case "issued":
    case "installed":
      return open(
        state,
        {
          id: change.grant.id,
          creature: change.grant.subject.creature,
          node: change.grant.target,
          caps: change.grant.caps.map((cap) => cap.kind),
          expiresAt: change.grant.expiresAt,
        },
        at,
      );
    case "revoked":
      return latch(state, change.grantId, at);
    case "refused":
      return state;
  }
}

function absorbKeeper(state: HabitatState, notice: KeeperNotice): HabitatState {
  switch (notice.type) {
    case "keeper.viewed":
      return view(state, notice.sessionId, notice.ts);
    case "keeper.presence":
      return state.keeper.present === notice.present
        ? state
        : { ...state, keeper: { present: notice.present, since: notice.ts } };
    case "keeper.asks":
      return reconcileAsks(state, notice.asks, notice.ts);
    case "keeper.sessions":
      return withSessions(state, notice.sessions, notice.ts);
    case "keeper.chores":
      return { ...state, porch: { ...state.porch, chores: heldChoresOf(notice.needs) } };
    case "keeper.decided":
      return { ...state, porch: { ...state.porch, decided: standingOf(notice.standing) } };
    case "keeper.routines":
      return postBoard(state, notice.creature, notice.routines, notice.ts);
    case "keeper.show":
      return withSettings(state, notice.settings, notice.ts);
    case "keeper.attend":
      return withYard(state, (yard) =>
        attend(yard, { id: notice.id, kind: notice.kind, at: parseTs(notice.ts) }),
      );
  }
}

function postBoard(
  state: HabitatState,
  creature: Slug,
  routines: readonly RoutineView[],
  at: string,
): HabitatState {
  const listed = new Set(routines.map((view) => view.id));
  const posted = routines.reduce(
    (current, view) =>
      withChore(
        current,
        creature,
        { id: view.id, title: view.routine?.title ?? view.id },
        at,
        (chore) => ({ ...chore, nextAt: nextRunOf(view) }),
      ),
    state,
  );
  return withCreature(posted, creature, (held) => {
    const kept = held.chores.filter((chore) => listed.has(chore.id));
    return kept.length === held.chores.length ? held : { ...held, chores: kept };
  });
}

function nextRunOf(view: RoutineView): string | undefined {
  return view.schedule.enabled ? (view.schedule.nextRunAt ?? undefined) : undefined;
}

function holdChores(
  state: HabitatState,
  creature: string,
  routineId: string,
  needs: readonly RoutineNeed[],
): HabitatState {
  const kept = Object.fromEntries(
    Object.entries(state.porch.chores).filter(
      ([, held]) => held.creature !== creature || held.routineId !== routineId,
    ),
  );
  return { ...state, porch: { ...state.porch, chores: { ...kept, ...heldChoresOf(needs) } } };
}

function heldChoresOf(needs: readonly RoutineNeed[]): Record<string, HeldChore> {
  return Object.fromEntries(
    needs.map((need) => [
      `${need.creature}/${need.routineId}/${need.kind}`,
      {
        creature: need.creature,
        routineId: need.routineId,
        need: need.kind,
        reason: need.reason,
        runId: need.runId,
        since: need.since ?? undefined,
        digest: need.action?.digest,
      },
    ]),
  );
}

function absorbRanch(state: HabitatState, event: RanchEvent): HabitatState {
  const at = event.ts;
  switch (event.type) {
    case "creature.changed":
      return creatureChanged(state, event.payload, at);
    case "mesh.parcel":
      return fence(state, event.payload.parcel, at);
    case "mesh.grant":
      return event.payload.revoked === true
        ? latch(state, event.payload.grant.id, at)
        : open(state, event.payload.grant, at);
    case "mesh.walked":
      return walkThrough(state, event.payload.grantId, event.payload.creature, event.id, at);
    case "models.changed":
      return buildMills(state, event.payload.node, event.payload.servers, at);
    case "routine.scheduled":
      return withChore(state, event.payload.creature, event.payload.routine, at, (chore) => ({
        ...chore,
        nextAt: event.payload.nextAt ?? undefined,
      }));
    case "routine.fired":
      return fireChore(
        state,
        event.payload.creature,
        event.payload.routine,
        event.payload.sessionId,
        at,
      );
    case "routine.finished":
      return finishChore(
        state,
        event.payload.creature,
        event.payload.routine,
        event.payload.sessionId,
        event.id,
        at,
      );
    case "screen.session":
      return sightSpyglass(state, event, at);
    case "workshop.health":
      return withCreature(state, event.payload.creature, (creature) => ({
        ...creature,
        workshop: { ...creature.workshop, health: event.payload.health },
      }));
    case "turn.waiting":
      return withThread(state, event.payload.sessionId, at, (thread) =>
        holdTurn(thread, event.payload.reason, event.payload.until, at),
      );
    case "turn.resumed":
      return withThread(state, event.payload.sessionId, at, resumeTurn);
  }
}

function holdTurn(
  thread: Thread,
  reason: WaitingReason,
  until: string | undefined,
  at: string,
): Thread {
  return { ...thread, waiting: { reason, since: at, until } };
}

function resumeTurn(thread: Thread): Thread {
  return { ...thread, waiting: undefined };
}

function seatRow(thread: Thread, row: SessionRow, at: string): Thread {
  const asks = Object.fromEntries(
    (row.waiting?.tools ?? []).map((tool, index) => {
      const callId = `cold:${row.id}:${index}`;
      return [callId, { callId, tool, subject: "", askedAt: row.lastActivityAt }];
    }),
  );
  const turn = turnSeatedBy(thread, row, at);
  const ended = turn === undefined && thread.turn !== undefined;
  return {
    ...thread,
    creature: row.bot ?? thread.creature,
    title: row.title,
    turn,
    restingSince: ended ? row.lastActivityAt : thread.restingSince,
    waiting: ended ? undefined : thread.waiting,
    asks: Object.keys(thread.asks).length === 0 ? asks : thread.asks,
    lastActivityAt: row.lastActivityAt,
  };
}

function turnSeatedBy(thread: Thread, row: SessionRow, at: string): LiveTurn | undefined {
  if (row.working === true) {
    if (thread.turn !== undefined || thread.restingSince !== undefined) return thread.turn;
    return {
      startedAt: row.lastActivityAt,
      lastProgressAt: at,
      tool: undefined,
      stumbledAt: undefined,
    };
  }
  if (thread.turn === undefined || parseTs(row.lastActivityAt) < parseTs(thread.turn.startedAt)) {
    return thread.turn;
  }
  return undefined;
}

function startTurn(thread: Thread, at: string): Thread {
  return {
    ...thread,
    turn: { startedAt: at, lastProgressAt: at, tool: undefined, stumbledAt: undefined },
    restingSince: undefined,
    back: undefined,
    failure: undefined,
    waiting: undefined,
    changes: [],
    report: undefined,
    lastActivityAt: at,
  };
}

function endTurn(thread: Thread, at: string): Thread {
  return { ...thread, turn: undefined, restingSince: at, waiting: undefined, lastActivityAt: at };
}

function completeTurn(
  state: HabitatState,
  id: SessionId,
  message: Message,
  at: string,
): HabitatState {
  const before = state.threads[id];
  const completed = withThread(state, id, at, (thread) => ({
    ...endTurn(thread, at),
    failures: 0,
    back: { at, preview: previewOf(message), changes: thread.changes },
  }));
  if (before?.turn === undefined || hasLandmark(state, "well")) return completed;
  if (!throughTheNight(parseTs(before.turn.startedAt), parseTs(at), state.house.offsetMinutes))
    return completed;
  return remember(completed, "well", before.creature, at, `thread:${id}`);
}

function failTurn(
  state: HabitatState,
  id: SessionId,
  eventId: number,
  message: string,
  at: string,
): HabitatState {
  const known = state.threads[id];
  if (known !== undefined && known.turn === undefined && known.restingSince !== undefined)
    return state;
  return withThread(state, id, at, (thread) => ({
    ...endTurn(thread, at),
    failure: { at, eventId, message: firstLine(message) },
    failures: thread.failures + 1,
  }));
}

function pickUpTool(
  thread: Thread,
  call: EnginePayloads["tool.started"]["call"],
  at: string,
): Thread {
  if (thread.turn === undefined) return thread;
  return {
    ...thread,
    turn: {
      ...thread.turn,
      lastProgressAt: at,
      tool: { callId: call.callId, name: call.name, since: at },
    },
    lastActivityAt: at,
  };
}

function putDownTool(thread: Thread, payload: EnginePayloads["tool.finished"], at: string): Thread {
  if (thread.turn === undefined) return thread;
  const refused = thread.answered[payload.callId] === "denied";
  const stumbled = payload.isError && !refused ? at : thread.turn.stumbledAt;
  const held = thread.turn.tool;
  const tool = held?.callId === payload.callId ? { ...held, until: at } : held;
  return {
    ...thread,
    turn: { ...thread.turn, lastProgressAt: at, tool, stumbledAt: stumbled },
    lastActivityAt: at,
  };
}

function noteReport(
  state: HabitatState,
  id: SessionId,
  notice: ExtensionNotice,
  at: string,
): HabitatState {
  const report = reportLineOf(notice);
  if (report === undefined) return progress(state, id, at);
  return withThread(progress(state, id, at), id, at, (thread) => ({
    ...thread,
    report,
    lastActivityAt: at,
  }));
}

function reportLineOf(notice: ExtensionNotice): string | undefined {
  if (notice.extension !== creatureExtension || !isRecord(notice.detail)) return undefined;
  if (notice.detail.kind === "frame" || !isRecord(notice.detail.origin)) return undefined;
  return notice.detail.origin.kind === "creature" ? oneLine(notice.message) : undefined;
}

function decideForKeeper(
  state: HabitatState,
  id: SessionId,
  notice: ExtensionNotice,
  at: string,
): HabitatState {
  const decided = decidedForKeeperOf(id, notice, at);
  if (decided === undefined) return progress(state, id, at);
  return {
    ...progress(state, id, at),
    porch: { ...state.porch, decided: { ...state.porch.decided, [decided.recordId]: decided } },
  };
}

function decidedForKeeperOf(
  sessionId: SessionId,
  notice: ExtensionNotice,
  at: string,
): DecidedForKeeper | undefined {
  if (!isRecord(notice.detail)) return undefined;
  const { recordId, ruleClass, tool, creature } = notice.detail;
  if (typeof recordId !== "string" || typeof ruleClass !== "string" || typeof tool !== "string") {
    return undefined;
  }
  return {
    recordId,
    sessionId,
    creature: typeof creature === "string" ? creature : undefined,
    ruleClass,
    tool,
    at,
  };
}

function standingOf(standing: readonly DecidedForKeeper[]): Record<string, DecidedForKeeper> {
  return Object.fromEntries(standing.map((decided) => [decided.recordId, decided]));
}

function forgetDecided(state: HabitatState, sessionId: SessionId): HabitatState {
  const kept = Object.entries(state.porch.decided).filter(
    ([, decided]) => decided.sessionId !== sessionId,
  );
  if (kept.length === Object.keys(state.porch.decided).length) return state;
  return { ...state, porch: { ...state.porch, decided: Object.fromEntries(kept) } };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

const creatureExtension = "creature";
const keeperExtension = "keeper";

function ask(thread: Thread, pending: PermissionAsk, at: string): Thread {
  if (thread.answered[pending.callId] !== undefined) return thread;
  return {
    ...thread,
    asks: {
      ...thread.asks,
      [pending.callId]: {
        callId: pending.callId,
        tool: pending.tool,
        subject: toolSubject(pending.arguments),
        askedAt: at,
      },
    },
    lastActivityAt: at,
  };
}

function decide(thread: Thread, decision: PermissionDecision, at: string): Thread {
  const { [decision.callId]: _, ...asks } = thread.asks;
  return {
    ...thread,
    asks,
    answered: { ...thread.answered, [decision.callId]: decision.verdict },
    turn: thread.turn === undefined ? undefined : { ...thread.turn, lastProgressAt: at },
    lastActivityAt: at,
  };
}

function lightLantern(
  state: HabitatState,
  parent: SessionId,
  child: ChildStarted,
  at: string,
): HabitatState {
  if (child.sessionId === undefined) return progress(state, parent, at);
  const id = child.sessionId;
  const withParent = withThread(state, parent, at, (thread) => ({
    ...thread,
    children: thread.children.includes(id) ? thread.children : [...thread.children, id],
    lastActivityAt: at,
  }));
  const parentCreature = withParent.threads[parent]?.creature;
  return withThread(withParent, id, at, (thread) => ({
    ...thread,
    kind: "child",
    parent,
    creature: child.bot ?? thread.creature ?? parentCreature,
    title: child.title,
    turn: { startedAt: at, lastProgressAt: at, tool: undefined, stumbledAt: undefined },
    restingSince: undefined,
  }));
}

function snuffLantern(
  state: HabitatState,
  id: SessionId | undefined,
  outcome: string,
  at: string,
): HabitatState {
  if (id === undefined || state.threads[id] === undefined) return state;
  return withThread(state, id, at, (thread) => ({ ...endTurn(thread, at), outcome }));
}

function noteChanges(thread: Thread, paths: readonly string[]): Thread {
  return {
    ...thread,
    changes: paths,
    back: thread.back === undefined ? undefined : { ...thread.back, changes: paths },
  };
}

function view(state: HabitatState, id: SessionId, at: string): HabitatState {
  const thread = state.threads[id];
  if (thread === undefined) return state;
  const crate = crateOf(thread);
  const viewed = withThread(state, id, at, (current) => ({
    ...current,
    viewedAt: at,
    back: undefined,
    failure: undefined,
  }));
  if (crate === undefined) return viewed;
  return shelve(viewed, thread, crate.changes.length, at);
}

function shelve(state: HabitatState, thread: Thread, changes: number, at: string): HabitatState {
  const shelf = {
    thread: thread.id,
    creature: thread.creature,
    title: thread.title,
    deliveredAt: at,
    changes,
  };
  const shelves = [...state.storehouse.shelves, shelf];
  const kept = shelves.slice(-shelvesPerWing);
  const folded = state.storehouse.folded + (shelves.length - kept.length);
  const delivered = folded + kept.length;
  const wings = Math.max(1, Math.ceil(delivered / shelvesPerWing));
  const grown = wings > state.storehouse.wings;
  const stocked: HabitatState = {
    ...state,
    storehouse: { shelves: kept, folded, wings },
  };
  const noted = happen(
    stocked,
    "delivered",
    `${thread.title || thread.id} delivered to the storehouse`,
    thread.id,
    at,
  );
  const winged = grown
    ? happen(noted, "wing", "the storehouse gained a wing", undefined, at)
    : noted;
  return hasLandmark(winged, "tree")
    ? winged
    : remember(winged, "tree", thread.creature, at, `thread:${thread.id}`);
}

function reconcileAsks(
  state: HabitatState,
  pending: readonly PendingAsk[],
  at: string,
): HabitatState {
  const stillPending = new Set(pending.map((item) => item.callId));
  let current = state;
  for (const thread of Object.values(state.threads)) {
    const kept = Object.fromEntries(
      Object.entries(thread.asks).filter(([callId]) => stillPending.has(callId)),
    );
    if (Object.keys(kept).length !== Object.keys(thread.asks).length) {
      current = withThread(current, thread.id, at, (held) => ({ ...held, asks: kept }));
    }
  }
  for (const item of pending) {
    current = withThread(current, item.sessionId, at, (thread) =>
      thread.asks[item.callId] !== undefined || thread.answered[item.callId] !== undefined
        ? thread
        : {
            ...thread,
            asks: {
              ...thread.asks,
              [item.callId]: {
                callId: item.callId,
                tool: item.tool,
                subject: toolSubject(item.arguments),
                askedAt: item.askedAt,
              },
            },
          },
    );
  }
  return current;
}

function upsertCreature(state: HabitatState, summary: CreatureSummary, at: string): HabitatState {
  const known = state.creatures[summary.slug];
  const creature: Creature = {
    slug: summary.slug,
    name: summary.name,
    skin: summary.skin ?? known?.skin,
    seed: summary.seed ?? known?.seed,
    workshop: {
      raisedAt: known?.workshop.raisedAt ?? at,
      parcel: summary.workshop?.node ?? known?.workshop.parcel,
      substrate: summary.workshop?.substrate ?? known?.workshop.substrate,
      health: known?.workshop.health,
      boardedAt: undefined,
    },
    conversation: summary.conversation ?? known?.conversation,
    chores: known?.chores ?? [],
    paused: summary.paused === undefined ? known?.paused : (summary.paused ?? undefined),
  };
  const placed: HabitatState = {
    ...state,
    creatures: { ...state.creatures, [summary.slug]: creature },
  };
  const seated = (summary.threads ?? []).reduce(
    (current, thread) => adopt(current, thread.id, summary.slug, thread.kind, thread.title, at),
    summary.conversation === undefined
      ? placed
      : adopt(placed, summary.conversation, summary.slug, "conversation", undefined, at),
  );
  if (known !== undefined) return seated;
  const raised = happen(seated, "raised", `${summary.name} raised a workshop`, summary.slug, at);
  return remember(raised, "workshop", summary.slug, at, `creature:${summary.slug}`);
}

function adopt(
  state: HabitatState,
  id: SessionId,
  creature: Slug,
  kind: ThreadKind,
  title: string | undefined,
  at: string,
): HabitatState {
  return withThread(state, id, at, (thread) => ({
    ...thread,
    creature,
    kind,
    title: title ?? thread.title,
  }));
}

function boardUp(state: HabitatState, slug: Slug, at: string): HabitatState {
  const creature = state.creatures[slug];
  if (creature === undefined || creature.workshop.boardedAt !== undefined) return state;
  const boarded = withCreature(state, slug, (held) => ({
    ...held,
    workshop: { ...held.workshop, boardedAt: at },
  }));
  return happen(boarded, "boarded", `${creature.name}'s workshop was boarded up`, slug, at);
}

function fence(state: HabitatState, summary: ParcelSummary, at: string): HabitatState {
  const known = state.parcels[summary.id];
  const parcel = {
    id: summary.id,
    name: summary.name,
    roles: summary.roles,
    online: summary.online,
    path: summary.path ?? undefined,
    fencedAt: known?.fencedAt ?? at,
    seenAt: at,
  };
  const placed: HabitatState = { ...state, parcels: { ...state.parcels, [summary.id]: parcel } };
  const milled =
    summary.servers === undefined ? placed : buildMills(placed, summary.id, summary.servers, at);
  if (known === undefined)
    return happen(milled, "fenced", `${summary.name} joined the stead`, summary.id, at);
  if (known.online && !summary.online)
    return happen(milled, "fogged", `${summary.name} is out of reach`, summary.id, at);
  if (!known.online && summary.online)
    return happen(milled, "cleared", `${summary.name} is back in reach`, summary.id, at);
  return milled;
}

function open(state: HabitatState, grant: GrantSummary, at: string): HabitatState {
  const known = state.gates[grant.id];
  const gate = {
    id: grant.id,
    creature: grant.creature,
    parcel: grant.node,
    caps: grant.caps,
    openedAt: known?.openedAt ?? at,
    expiresAt: grant.expiresAt,
    latchedAt: undefined,
    walks: known?.walks ?? 0,
    lastWalkAt: known?.lastWalkAt,
  };
  const opened: HabitatState = { ...state, gates: { ...state.gates, [grant.id]: gate } };
  return known === undefined || known.latchedAt !== undefined
    ? happen(
        opened,
        "opened",
        `a gate opened for ${grant.creature} onto ${grant.node}`,
        grant.id,
        at,
      )
    : opened;
}

function latch(state: HabitatState, grantId: string, at: string): HabitatState {
  const gate = state.gates[grantId];
  if (gate === undefined || gate.latchedAt !== undefined) return state;
  const latched: HabitatState = {
    ...state,
    gates: { ...state.gates, [grantId]: { ...gate, latchedAt: at } },
  };
  return happen(
    latched,
    "latched",
    `the gate for ${gate.creature} onto ${gate.parcel} was latched`,
    grantId,
    at,
  );
}

function walkThrough(
  state: HabitatState,
  grantId: string,
  creature: Slug,
  eventId: number,
  at: string,
): HabitatState {
  const gate = state.gates[grantId];
  if (gate === undefined) return state;
  const walked: HabitatState = {
    ...state,
    gates: { ...state.gates, [grantId]: { ...gate, walks: gate.walks + 1, lastWalkAt: at } },
  };
  return hasLandmark(walked, "lantern-post")
    ? walked
    : remember(walked, "lantern-post", creature, at, `event:${eventId}`);
}

function buildMills(
  state: HabitatState,
  node: NodeId,
  servers: readonly MillSummary[],
  at: string,
): HabitatState {
  let current = state;
  for (const server of servers) current = buildMill(current, node, server, at);
  return current;
}

function buildMill(
  state: HabitatState,
  node: NodeId,
  server: MillSummary,
  at: string,
): HabitatState {
  const id = `${node}/${server.id}`;
  const known = state.mills[id];
  const mill = {
    id,
    parcel: node,
    name: server.name,
    loaded: server.loaded,
    busy: server.busy === true,
    builtAt: known?.builtAt ?? at,
  };
  const built: HabitatState = { ...state, mills: { ...state.mills, [id]: mill } };
  return known === undefined
    ? happen(built, "built", `a mill was built on ${node}`, id, at)
    : built;
}

function fireChore(
  state: HabitatState,
  creature: Slug,
  routine: { id: string; title: string },
  sessionId: SessionId,
  at: string,
): HabitatState {
  const running = withChore(state, creature, routine, at, (chore) => ({
    ...chore,
    running: sessionId,
  }));
  return adopt(running, sessionId, creature, "routine", routine.title, at);
}

function finishChore(
  state: HabitatState,
  creature: Slug,
  routine: { id: string; title: string },
  sessionId: SessionId,
  eventId: number,
  at: string,
): HabitatState {
  const rested = withChore(state, creature, routine, at, (chore) => ({
    ...chore,
    running: chore.running === sessionId ? undefined : chore.running,
    lastRanAt: at,
  }));
  if (state.keeper.present || hasLandmark(rested, "weathervane")) return rested;
  return remember(rested, "weathervane", creature, at, `event:${eventId}`);
}

function sightSpyglass(
  state: HabitatState,
  event: Extract<RanchEvent, { type: "screen.session" }>,
  at: string,
): HabitatState {
  const { id, node, kind, live } = event.payload;
  if (!live) {
    const { [id]: _, ...rest } = state.spyglasses;
    return { ...state, spyglasses: rest };
  }
  const sighted: HabitatState = {
    ...state,
    spyglasses: {
      ...state.spyglasses,
      [id]: { id, parcel: node, kind, since: state.spyglasses[id]?.since ?? at },
    },
  };
  if (kind !== "control" || hasLandmark(sighted, "chair")) return sighted;
  return remember(sighted, "chair", undefined, at, `event:${event.id}`);
}

function withChore(
  state: HabitatState,
  creature: Slug,
  routine: { id: string; title: string },
  at: string,
  change: (chore: Creature["chores"][number]) => Creature["chores"][number],
): HabitatState {
  const seated =
    state.creatures[creature] === undefined
      ? upsertCreature(state, { slug: creature, name: creature }, at)
      : state;
  return withCreature(seated, creature, (held) => {
    const known = held.chores.find((chore) => chore.id === routine.id) ?? {
      id: routine.id,
      title: routine.title,
      nextAt: undefined,
      lastRanAt: undefined,
      running: undefined,
    };
    const changed = change({ ...known, title: routine.title });
    return {
      ...held,
      chores: [...held.chores.filter((chore) => chore.id !== routine.id), changed].sort(byNextRun),
    };
  });
}

function byNextRun(a: Creature["chores"][number], b: Creature["chores"][number]): number {
  return (
    (a.nextAt === undefined ? Number.POSITIVE_INFINITY : parseTs(a.nextAt)) -
      (b.nextAt === undefined ? Number.POSITIVE_INFINITY : parseTs(b.nextAt)) ||
    a.id.localeCompare(b.id)
  );
}

function setOut(state: HabitatState, setting: Setting, at: string): HabitatState {
  const proposed = withYard(state, (yard) => proposeSetting(yard, setting));
  return setting.creature === null ? touch(proposed, setting.sessionId, at) : proposed;
}

function withYard(state: HabitatState, change: (yard: YardState) => YardState): HabitatState {
  const yard = yardOf(state);
  const changed = change(yard);
  return changed === yard ? state : { ...state, yard: changed };
}

function withCreature(
  state: HabitatState,
  slug: Slug,
  change: (creature: Creature) => Creature,
): HabitatState {
  const creature = state.creatures[slug];
  if (creature === undefined) return state;
  const changed = change(creature);
  return changed === creature
    ? state
    : { ...state, creatures: { ...state.creatures, [slug]: changed } };
}

function withThread(
  state: HabitatState,
  id: SessionId,
  at: string,
  change: (thread: Thread) => Thread,
): HabitatState {
  const thread = state.threads[id] ?? emptyThread(id, at);
  const changed = change(thread);
  return changed === state.threads[id]
    ? state
    : { ...state, threads: { ...state.threads, [id]: changed } };
}

function touch(state: HabitatState, id: SessionId, at: string): HabitatState {
  return withThread(state, id, at, (thread) => thread);
}

function progress(state: HabitatState, id: SessionId, at: string): HabitatState {
  const thread = state.threads[id];
  if (thread?.turn === undefined) return state;
  return withThread(state, id, at, (held) => ({
    ...held,
    turn: held.turn === undefined ? undefined : { ...held.turn, lastProgressAt: at },
    lastActivityAt: at,
  }));
}

function remember(
  state: HabitatState,
  kind: LandmarkKind,
  creature: Slug | undefined,
  at: string,
  evidence: string,
): HabitatState {
  const landmark = { kind, creature, at, evidence };
  const kept: HabitatState = { ...state, landmarks: [...state.landmarks, landmark] };
  return happen(kept, "first", firstWords[kind], creature, at);
}

const firstWords: Readonly<Record<LandmarkKind, string>> = {
  workshop: "the first workshop was raised",
  tree: "the first crate was delivered; a tree was planted",
  "lantern-post": "the first walk through a gate; a lantern post stands by it",
  weathervane: "the first chore ran while the keeper was away; a weathervane turns on the roof",
  chair: "the keeper first took over a workshop's screen; a chair waits by the window",
  well: "the first night worked through; a well was dug",
};

function happen(
  state: HabitatState,
  kind: HappeningKind,
  text: string,
  about: string | undefined,
  at: string,
): HabitatState {
  const happening: Happening = { at, kind, text, about };
  return { ...state, history: [...state.history, happening].slice(-historyLimit) };
}

function previewOf(message: Message): string {
  const text = message.parts.find((part) => part.type === "text");
  return oneLine(text !== undefined && "text" in text ? text.text : "");
}

function oneLine(said: string): string {
  const flat = said.replace(/\s+/g, " ").trim();
  return flat.length > previewLimit ? `${flat.slice(0, previewLimit - 1)}…` : flat;
}

function firstLine(text: string): string {
  return text.split("\n", 1)[0]?.trim() ?? "";
}

export function throughTheNight(
  startedAt: number,
  endedAt: number,
  offsetMinutes: number,
): boolean {
  const localStart = startedAt - offsetMinutes * minute;
  const localEnd = endedAt - offsetMinutes * minute;
  const midnight = Math.floor(localStart / day) * day;
  return [midnight, midnight + day].some(
    (night) => localStart <= night + hour && localEnd >= night + 4 * hour,
  );
}
