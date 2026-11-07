import type { ChildLineage } from "@keywork-app/client";
import type {
  BotSummary,
  BusEnvelope,
  CreatureDetail,
  CreatureRemoval,
  CreatureSummary,
  MemoryNotes,
  RoutineFile,
  RoutineView,
  ServedRefusal,
  SessionRow,
} from "@keywork-app/protocol";
import { createRoot, createSignal } from "solid-js";
import type { HostPort, ServerRequestInit, ServerResponseHead } from "../../host/port.ts";
import { overviewShell } from "../overview/testing.tsx";
import type { ShellSeams } from "../registry.ts";
import { createCreatureNames } from "./names.ts";
import type { KeeperReport, RanchRoutes } from "./wire.ts";

export const noon = Date.UTC(2026, 10, 5, 12, 0, 0);
export const raisedAt = "2026-11-01T09:00:00.000Z";

export const minutesAgo = (minutes: number, from = Date.now()): string =>
  new Date(from - minutes * 60_000).toISOString();

export const hoursAhead = (hours: number, from = Date.now()): string =>
  minutesAgo(-hours * 60, from);

export const wrenDetail = (now = Date.now()): CreatureDetail => ({
  slug: "wren",
  name: "Wren",
  sigil: "◆",
  created: "2026-11-01T09:00:00.000Z",
  skin: "kid",
  seed: 7,
  workshop: "ws-wren",
  models: {
    strong: { provider: "anthropic", model: "claude-sonnet-4-5" },
    loop: "inherit",
    decide: { provider: "ollama", model: "qwen3:8b" },
    vision: "inherit",
  },
  introduction: "I am Wren, Jordan's creature.",
  conversation: "t0",
  threads: [
    {
      id: "t1",
      kind: "thread",
      title: "docs index",
      state: "working",
      children: 1,
      lastActivityAt: minutesAgo(1, now),
    },
    {
      id: "t2",
      kind: "routine",
      title: "nightly tests",
      state: "blocked",
      children: 0,
      lastActivityAt: minutesAgo(120, now),
    },
  ],
  nextRun: { routineId: "nightly", at: hoursAhead(14, now) },
  usage: { date: "2026-11-05", sessions: 3, costNanos: 460_000_000 },
  routines: "routines",
});

export const wrenSummary = (now = Date.now()): CreatureSummary => {
  const detail = wrenDetail(now);
  return {
    slug: detail.slug,
    name: detail.name,
    sigil: detail.sigil,
    created: detail.created,
    skin: detail.skin,
    seed: detail.seed,
    workshop: detail.workshop,
    models: detail.models,
    conversation: detail.conversation,
    threads: detail.threads.length,
  };
};

export const wrenRoutines = (now = Date.now()): RoutineView[] => [
  routineView(
    "nightly",
    {
      title: "nightly tests",
      instructions: "run bun run verify and report only failures",
      trigger: { kind: "cron", expr: "0 2 * * *", tz: "UTC" },
      enabled: true,
    },
    hoursAhead(14, now),
  ),
  routineView(
    "tidy",
    {
      title: "storehouse tidy",
      instructions: "fold old shelves",
      trigger: { kind: "manual" },
      enabled: false,
    },
    null,
  ),
];

export function routineView(id: string, file: RoutineFile, nextRunAt: string | null): RoutineView {
  const enabled = file.enabled !== false;
  return {
    creature: "wren",
    id,
    file: `routines/${id}.json`,
    routine: {
      id,
      title: file.title,
      instructions: file.instructions,
      trigger: file.trigger,
      destination: file.destination ?? { kind: "conversation" },
      notify: file.notify ?? "only-when-needs-me",
      tools: file.tools ?? "read-only",
      grants: file.grants ?? [],
      budget: file.budget ?? { usd: 0.5, minutes: 10 },
      enabled,
    },
    problem: null,
    grants: {
      posture: "read-only",
      digest: "d1",
      needsAcceptance: false,
      accepted: false,
      acceptedAt: null,
    },
    schedule: {
      enabled,
      disabled: null,
      nextRunAt: enabled ? nextRunAt : null,
      consecutiveErrors: 0,
      retryAt: null,
    },
    activeRunId: null,
    lastRun: null,
  };
}

export const wrenRemoval = (keepWorkshop: boolean): CreatureRemoval => ({
  slug: "wren",
  goes: {
    definition: "C:/work/.keywork/bots/wren",
    conversation: "t0",
    threads: ["t1", "t2"],
    notes: 12,
    routines: 2,
    workshop: keepWorkshop ? null : "ws-wren",
  },
  stays: { workspace: "C:/work", workshop: keepWorkshop ? "ws-wren" : null },
});

export const wrenReport = (): KeeperReport => ({
  mode: "shadow",
  enforced: false,
  ledgerPath: "C:/Users/jordan/.keywork/node/decisions/keeper-would-approve.jsonl",
  rows: 50,
  earlierRows: 0,
  classes: [
    {
      ruleClass: "bash",
      rows: 38,
      labelled: 38,
      answered: 36,
      agreement: 0.92,
      brier: 0.08,
      wouldAct: 20,
      wrongActs: 1,
      oneWayDoor: false,
      gradeWord: "estimated",
      gradeText: "estimated: 36 answered rows",
    },
    {
      ruleClass: "rm",
      rows: 12,
      labelled: 12,
      answered: 12,
      agreement: 1,
      wouldAct: 0,
      wrongActs: 0,
      oneWayDoor: true,
      gradeWord: "anecdotal",
      gradeText: "anecdotal",
    },
  ],
});

export const wrenRows = (now = Date.now()): SessionRow[] => [
  row("t0", "", "wren", minutesAgo(3, now), { costNanos: 120_000_000 }),
  row("t1", "docs index", "wren", minutesAgo(1, now), {
    costNanos: 300_000_000,
    working: true,
    live: true,
  }),
  row("t2", "nightly tests", "wren", minutesAgo(120, now), { costNanos: 40_000_000 }),
  row("t3", "old survey", "wren", minutesAgo(60 * 24 * 10, now), { costNanos: 5_000_000_000 }),
  row("t4", "unpriced sweep", "wren", minutesAgo(30, now)),
  row("s1", "someone else", "scribe", minutesAgo(5, now), { costNanos: 1 }),
];

export const wrenChild: ChildLineage = {
  sessionId: "c1",
  parentId: "t1",
  callId: "k1",
  title: "lint sweep",
  bot: "wren",
  state: "completed",
  costNanos: 10_000_000,
};

export const wrenBot = (): BotSummary => ({
  name: "wren",
  sigil: "◆",
  source: "project",
  sessions: 4,
  lastUsed: raisedAt,
});

export interface Served {
  readonly status: number;
  readonly body?: unknown;
}

export type Route = (body: unknown) => Served;

export interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

export interface FakeHost {
  readonly host: HostPort;
  readonly calls: Call[];
  serve(key: string, route: Route): void;
}

export function fakeHost(routes: Record<string, Route | Served>): FakeHost {
  const table = new Map<string, Route>(
    Object.entries(routes).map(([key, route]) => [key, asRoute(route)]),
  );
  const calls: Call[] = [];
  const serverFetch = async (
    _workspace: string,
    path: string,
    init: ServerRequestInit,
  ): Promise<ServerResponseHead> => {
    const method = init.method ?? "GET";
    const body = init.body === undefined ? undefined : (JSON.parse(init.body) as unknown);
    calls.push({ method, path, body });
    const route = table.get(`${method} ${path}`) ?? table.get(`${method} ${path.split("?")[0]}`);
    const served =
      route === undefined ? { status: 404, body: { error: "no such route" } } : route(body);
    return head(served);
  };
  const host = { serverFetch } as unknown as HostPort;
  return { host, calls, serve: (key, route) => void table.set(key, route) };
}

export type RanchCall = readonly [method: keyof RanchRoutes, ...args: unknown[]];

export interface FakeRanch {
  readonly routes: RanchRoutes;
  readonly calls: RanchCall[];
}

export interface RanchStaging {
  detail?: CreatureDetail | ServedRefusal | undefined;
  routines?: RoutineView[] | undefined;
}

export function fakeRanch(staging: RanchStaging = {}): FakeRanch {
  const calls: RanchCall[] = [];
  const now = Date.now();
  const detail = staging.detail ?? wrenDetail(now);
  const routines = staging.routines ?? wrenRoutines(now);
  const routes: RanchRoutes = {
    creature: async (slug) => {
      calls.push(["creature", slug]);
      return detail;
    },
    removeCreature: async (slug, choice = {}) => {
      calls.push(["removeCreature", slug, choice]);
      return {
        removed: choice.confirmed === true,
        removal: wrenRemoval(choice.keepWorkshop === true),
      };
    },
    routines: async (slug) => {
      calls.push(["routines", slug]);
      return routines;
    },
    putRoutine: async (slug, id, file) => {
      calls.push(["putRoutine", slug, id, file]);
      const held = routines.find((view) => view.id === id);
      return {
        routine: routineView(id, file, held?.schedule.nextRunAt ?? null),
        created: held === undefined,
      };
    },
    workshopHealth: async (id) => {
      calls.push(["workshopHealth", id]);
      return { id, substrate: "sbx", health: "up", limitations: [] };
    },
  };
  return { routes, calls };
}

export interface CreatureStaging extends RanchStaging {
  report?: KeeperReport | undefined;
  rows?: SessionRow[] | undefined;
  bots?: BotSummary[] | undefined;
  notes?: number | undefined;
  inbox?: number | undefined;
  currentSession?: string | undefined;
}

export interface CreatureHarness {
  readonly shell: ShellSeams;
  readonly served: FakeHost;
  readonly ranch: FakeRanch;
  readonly opened: string[];
  readonly panes: unknown[];
  readonly edited: string[];
  readonly layers: string[];
  readonly refetched: string[];
  refreshes(): number;
  emit(batch: readonly BusEnvelope[]): void;
  setCurrentSession(id: string | undefined): void;
  dispose(): void;
}

export const shortChords: Readonly<Record<string, string>> = {
  "creature.down": "j",
  "creature.up": "k",
  "creature.open": "enter",
  "creature.conversation": "c",
  "creature.rename": "r",
  "creature.skin": "b",
  "creature.policy": "m",
  "creature.pause": "p",
  "creature.workshop": "w",
  "creature.chores": "t",
  "creature.memory": "n",
  "creature.file": "e",
  "creature.delete": "d",
  "onboarding.start": "ctrl+k 1",
};

export function creatureHarness(staging: CreatureStaging = {}): CreatureHarness {
  return createRoot((dispose) => {
    const now = Date.now();
    const rows = staging.rows ?? wrenRows(now);
    const bots = staging.bots ?? [wrenBot()];
    const creatures = bots.some((bot) => bot.name === "wren") ? [wrenSummary(now)] : [];
    const ranch = fakeRanch(staging);
    const routines = staging.routines ?? wrenRoutines();
    const choresWhere = (enabled: boolean): string[] =>
      routines.filter((row) => row.schedule.enabled === enabled).map((row) => row.id);
    const served = fakeHost({
      "GET /creatures/wren/report":
        staging.report === undefined
          ? { status: 404, body: { error: "no such route" } }
          : { status: 200, body: staging.report },
      "POST /creatures/wren/pause": {
        status: 200,
        body: {
          slug: "wren",
          paused: true,
          since: new Date(now).toISOString(),
          chores: choresWhere(true),
        },
      },
      "POST /creatures/wren/resume": {
        status: 200,
        body: { slug: "wren", paused: false, since: null, chores: choresWhere(false) },
      },
    });
    const listeners = new Set<(batch: readonly BusEnvelope[]) => void>();
    const opened: string[] = [];
    const panes: unknown[] = [];
    const edited: string[] = [];
    const layers: string[] = [];
    const refetched: string[] = [];
    let refreshes = 0;
    const [currentSession, setCurrentSession] = createSignal(staging.currentSession);
    const base = overviewShell({ summaries: rows }).shell;
    const notes = Array.from({ length: staging.notes ?? 12 }, (_, index) => ({
      name: `note-${index}`,
      layer: "bot:wren",
    })) as unknown as MemoryNotes["notes"];
    const store = {
      ...base.store,
      state: { ...base.store.state, summaries: rows },
      summary: (id: string | undefined) => rows.find((held) => held.id === id),
      children: (parent: string) => (parent === "t1" ? [wrenChild] : []),
      memory: { state: { inbox: { count: staging.inbox ?? 1 } } },
      surfaces: {
        state: { bots, ordinals: {} },
        bot: (name: string | undefined) => bots.find((bot) => bot.name === name),
        refetch: async (kind: string) => void refetched.push(kind),
      },
      refresh: async () => {
        refreshes += 1;
      },
    };
    const shell: ShellSeams = {
      creatureNames: createCreatureNames(),
      ...base,
      store: store as unknown as ShellSeams["store"],
      host: served.host,
      keys: { chord: (action) => shortChords[action] ?? action, leader: () => "ctrl+k" },
      sessions: { ...base.sessions, openSession: (id) => void opened.push(id) },
      openPane: (spec) => void panes.push(spec),
      openInEditor: async (path) => void edited.push(path),
      currentSession,
      client: {
        ...base.client,
        ...ranch.routes,
        creatures: async () => creatures,
        memoryNotes: async (layer?: string) => {
          layers.push(layer ?? "");
          return { trusted: true, notes };
        },
      } as ShellSeams["client"],
      feed: {
        ...base.feed,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    };
    return {
      shell,
      served,
      ranch,
      opened,
      panes,
      edited,
      layers,
      refetched,
      refreshes: () => refreshes,
      emit: (batch) => {
        for (const listener of listeners) listener(batch);
      },
      setCurrentSession,
      dispose,
    };
  });
}

export function envelope(
  id: number,
  sessionId: string,
  type: string,
  payload: unknown,
): BusEnvelope {
  return { id, ts: new Date().toISOString(), sessionId, type, payload } as BusEnvelope;
}

export function flat(element: Element): string {
  const ownText = [...element.childNodes].some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
  );
  if (element.children.length > 0 && !ownText) {
    return [...element.children]
      .map(flat)
      .filter((text) => text !== "")
      .join(" ");
  }
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function lastCall(host: FakeHost, method: string): Call | undefined {
  return host.calls.filter((call) => call.method === method).at(-1);
}

export function ranchCalls(ranch: FakeRanch, method: keyof RanchRoutes): RanchCall[] {
  return ranch.calls.filter((call) => call[0] === method);
}

function row(
  id: string,
  title: string,
  bot: string,
  lastActivityAt: string,
  extra: Partial<SessionRow> = {},
): SessionRow {
  return {
    id,
    title,
    createdAt: lastActivityAt,
    lastActivityAt,
    messageCount: 4,
    bot,
    ...extra,
  };
}

function asRoute(route: Route | Served): Route {
  return typeof route === "function" ? route : () => route;
}

function head(served: Served): ServerResponseHead {
  const text = served.body === undefined ? "" : JSON.stringify(served.body);
  let spent = false;
  return {
    status: served.status,
    statusText: String(served.status),
    headers: [["content-type", "application/json"]],
    read: async () => {
      if (spent || text === "") return undefined;
      spent = true;
      return new TextEncoder().encode(text);
    },
    cancel: () => undefined,
  };
}
