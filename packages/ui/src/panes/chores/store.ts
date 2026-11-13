import type { ServerFeed } from "@keywork-app/client";
import { createStore, reconcile, type Store } from "solid-js/store";
import { onReconnected } from "../../shell/surfaces-store.ts";
import type { ChoresPort } from "./port.ts";
import {
  type ChoreEvent,
  type ChoreNeed,
  type ChoreRow,
  type CreatureRow,
  choreEventOf,
  type NotificationSettings,
  type RunRow,
  runsKey,
} from "./wire.ts";

export function withRun(row: ChoreRow, run: RunRow): ChoreRow {
  const live = run.status === "running" || run.status === "parked";
  return {
    ...row,
    activeRunId: live ? run.runId : row.activeRunId === run.runId ? null : row.activeRunId,
    lastRun: live ? row.lastRun : run,
  };
}

export type ChoresFeed = Pick<ServerFeed, "subscribe" | "onNotice">;

export interface ChoresState {
  loaded: boolean;
  refusal: string | undefined;
  creatures: readonly CreatureRow[];
  chores: Record<string, readonly ChoreRow[]>;
  choreRefusals: Record<string, string | undefined>;
  runs: Record<string, readonly RunRow[]>;
  runRefusals: Record<string, string | undefined>;
  needs: Record<string, readonly ChoreNeed[]>;
  settings: NotificationSettings | undefined;
}

export interface ChoresStore {
  readonly state: Store<ChoresState>;
  load(): Promise<void>;
  reloadChores(creature: string): Promise<void>;
  loadRuns(creature: string, id: string): Promise<void>;
  chore(creature: string, id: string): ChoreRow | undefined;
  needs(creature: string, id: string): readonly ChoreNeed[];
  dispose(): void;
}

export function needsByChore(needs: readonly ChoreNeed[]): Record<string, readonly ChoreNeed[]> {
  const grouped: Record<string, readonly ChoreNeed[]> = {};
  for (const need of needs) {
    const key = runsKey(need.creature, need.routineId);
    grouped[key] = [...(grouped[key] ?? []), need];
  }
  return grouped;
}

export function createChoresStore(port: ChoresPort, feed: ChoresFeed): ChoresStore {
  const [state, setState] = createStore<ChoresState>({
    loaded: false,
    refusal: undefined,
    creatures: [],
    chores: {},
    choreRefusals: {},
    runs: {},
    runRefusals: {},
    needs: {},
    settings: undefined,
  });

  const reloadChores = async (creature: string): Promise<void> => {
    const answer = await port.chores(creature);
    if (answer.ok) setState("chores", creature, answer.value);
    setState("choreRefusals", creature, answer.ok ? undefined : answer.error);
  };

  const runsRead = new Map<string, { creature: string; id: string }>();
  const loadRuns = async (creature: string, id: string): Promise<void> => {
    const key = runsKey(creature, id);
    runsRead.set(key, { creature, id });
    const answer = await port.runs(creature, id);
    if (answer.ok) setState("runs", key, answer.value);
    setState("runRefusals", key, answer.ok ? undefined : answer.error);
  };

  const reloadNeeds = async (): Promise<void> => {
    const answer = await port.needsYou();
    if (answer.ok) setState("needs", reconcile(needsByChore(answer.value)));
  };

  const load = async (): Promise<void> => {
    const [creatures, settings] = await Promise.all([
      port.creatures(),
      port.notificationSettings(),
      reloadNeeds(),
    ]);
    setState("settings", settings);
    if (!creatures.ok) {
      setState({ loaded: true, refusal: creatures.error, creatures: [] });
      return;
    }
    setState({ refusal: undefined, creatures: creatures.value });
    await Promise.all([
      ...creatures.value.map((creature) => reloadChores(creature.slug)),
      ...[...runsRead.values()].map((chore) => loadRuns(chore.creature, chore.id)),
    ]);
    setState("loaded", true);
  };

  const applyRun = (creature: string, id: string, run: RunRow): void => {
    const key = runsKey(creature, id);
    const listed = state.runs[key];
    if (listed !== undefined) {
      setState("runs", key, [run, ...listed.filter((held) => held.runId !== run.runId)]);
    }
    setState("chores", creature, (rows) =>
      (rows ?? []).map((row) => (row.id === id ? withRun(row, run) : row)),
    );
  };

  const follow = (events: readonly ChoreEvent[]): void => {
    const stale = new Map<string, { creature: string; id: string }>();
    for (const event of events) {
      if (event.kind === "creatures") continue;
      if (event.kind === "needs") {
        setState("needs", runsKey(event.creature, event.id), event.needs);
        stale.set(runsKey(event.creature, event.id), event);
        continue;
      }
      if (event.run !== undefined) applyRun(event.creature, event.id, event.run);
      else stale.set(runsKey(event.creature, event.id), event);
      if (event.kind === "finished") stale.set(runsKey(event.creature, event.id), event);
    }
    if (events.some((event) => event.kind === "creatures")) {
      void load();
      return;
    }
    for (const creature of new Set([...stale.values()].map((event) => event.creature))) {
      void reloadChores(creature);
    }
    for (const [key, event] of stale) {
      if (state.runs[key] !== undefined && !carriedRun(events, key)) {
        void loadRuns(event.creature, event.id);
      }
    }
  };

  const stopFollowing = feed.subscribe((envelopes) => {
    const events = envelopes.flatMap((envelope) => choreEventOf(envelope) ?? []);
    if (events.length > 0) follow(events);
  });
  const stopReloading = onReconnected(feed, () => void load());

  function carriedRun(events: readonly ChoreEvent[], key: string): boolean {
    return events.some(
      (event) =>
        "run" in event && event.run !== undefined && runsKey(event.creature, event.id) === key,
    );
  }

  return {
    state,
    load,
    reloadChores,
    loadRuns,
    chore: (creature, id) => state.chores[creature]?.find((row) => row.id === id),
    needs: (creature, id) => state.needs[runsKey(creature, id)] ?? [],
    dispose: () => {
      stopFollowing();
      stopReloading();
    },
  };
}
