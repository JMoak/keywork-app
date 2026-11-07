import type { Answer, ChoresPort, MintedHook, PutChore } from "./port.ts";
import {
  type ChoreFile,
  type ChoreNeed,
  type ChoreRow,
  type CreatureRow,
  type NotificationSettings,
  type RunRow,
  runsKey,
} from "./wire.ts";

export const testZone = "America/Chicago";
export const thursdayMorning = Date.parse("2026-11-05T15:00:00Z");

export const wren: CreatureRow = { slug: "wren", name: "Wren" };
export const tam: CreatureRow = { slug: "tam", name: "Tam" };

export function choreFile(
  overrides: Partial<ChoreFile> & Pick<ChoreFile, "id" | "title">,
): ChoreFile {
  return {
    instructions: "Read the inbox and the calendar. Tell me only what needs me today.",
    trigger: { kind: "cron", expr: "0 9 * * 1-5", tz: testZone },
    destination: { kind: "conversation" },
    notify: "only-when-needs-me",
    tools: "read-only",
    grants: [],
    budget: { usd: 0.5, minutes: 10 },
    enabled: true,
    ...overrides,
  };
}

export function choreRow(
  routine: ChoreFile,
  overrides: Partial<Omit<ChoreRow, "routine">> = {},
): ChoreRow {
  return {
    creature: "wren",
    id: routine.id,
    file: `routines/${routine.id}.json`,
    routine,
    problem: null,
    grants: {
      posture: routine.tools,
      digest: `digest-of-${routine.id}`,
      needsAcceptance: routine.tools !== "read-only",
      accepted: false,
      acceptedAt: null,
    },
    schedule: {
      enabled: routine.enabled,
      disabled: null,
      nextRunAt: null,
      consecutiveErrors: 0,
      retryAt: null,
    },
    activeRunId: null,
    lastRun: null,
    ...overrides,
  };
}

export function runRow(overrides: Partial<RunRow> & Pick<RunRow, "runId" | "firedAt">): RunRow {
  return {
    creature: "wren",
    routineId: "morning-triage",
    attempt: 1,
    trigger: "cron",
    catchUp: false,
    scheduledFor: overrides.firedAt,
    status: "ended",
    sessionId: `session-${overrides.runId}`,
    startedAt: overrides.firedAt,
    endedAt: null,
    process: "completed",
    delivery: "delivered",
    verified: null,
    reason: null,
    usage: { inputTokens: 1200, outputTokens: 300 },
    cost: { usd: 0.04 },
    output: null,
    notify: { tier: "log", at: null },
    ...overrides,
  };
}

export const morningTriage = choreRow(
  choreFile({
    id: "morning-triage",
    title: "Morning triage",
    trigger: { kind: "cron", expr: "0 9 * * 1-5", tz: testZone, until: "2026-12-31" },
  }),
  {
    schedule: {
      enabled: true,
      disabled: null,
      nextRunAt: "2026-11-06T15:00:00.000Z",
      consecutiveErrors: 0,
      retryAt: null,
    },
  },
);

export const docsIndex = choreRow(
  choreFile({
    id: "docs-index",
    title: "Docs index",
    instructions: "Keep docs/INDEX.md current when files under docs/ change.",
    trigger: { kind: "interval", minutes: 120 },
    destination: { kind: "file", path: "docs/INDEX.md" },
    notify: "always",
    tools: "write",
    grants: [
      { action: "write", resource: "docs/INDEX.md" },
      { action: "bash", resource: "bun run org kb index" },
    ],
  }),
  {
    grants: {
      posture: "write",
      digest: "3f2a9c0b1d4e5f60",
      needsAcceptance: true,
      accepted: true,
      acceptedAt: "2026-11-04T16:02:00.000Z",
    },
    activeRunId: "r-41",
  },
);

export const nightlyTests = choreRow(
  choreFile({
    id: "nightly-tests",
    title: "Nightly tests",
    instructions: "Run bun run verify and tell me only when it fails.",
    trigger: { kind: "cron", expr: "0 2 * * *", tz: testZone },
    destination: { kind: "thread", name: "nightly" },
    notify: "never",
    tools: "act",
    grants: [{ action: "bash", resource: "bun run verify" }],
  }),
  {
    grants: {
      posture: "act",
      digest: "a1b2c3d4e5f60718",
      needsAcceptance: true,
      accepted: false,
      acceptedAt: null,
    },
    schedule: {
      enabled: true,
      disabled: null,
      nextRunAt: "2026-11-06T08:00:00.000Z",
      consecutiveErrors: 0,
      retryAt: null,
    },
  },
);

export const storehouseTidy = choreRow(
  choreFile({
    id: "storehouse-tidy",
    title: "Storehouse tidy",
    trigger: { kind: "cron", expr: "30 23 * * 0", tz: testZone },
  }),
  {
    schedule: {
      enabled: true,
      disabled: {
        reason: "disabled after 5 failed runs in a row; the last: the runner failed: exit 1",
        at: "2026-11-02T05:30:00.000Z",
      },
      nextRunAt: null,
      consecutiveErrors: 5,
      retryAt: null,
    },
  },
);

export const brokenChore: ChoreRow = {
  ...choreRow(choreFile({ id: "broken", title: "broken" })),
  routine: null,
  grants: null,
  problem: "trigger.expr: not a five-field cron expression (minute hour day month weekday)",
  schedule: {
    enabled: false,
    disabled: null,
    nextRunAt: null,
    consecutiveErrors: 0,
    retryAt: null,
  },
};

export const wrenChores: readonly ChoreRow[] = [
  morningTriage,
  docsIndex,
  nightlyTests,
  storehouseTidy,
  brokenChore,
];

export const morningRuns: readonly RunRow[] = [
  runRow({
    runId: "r-50",
    trigger: "manual",
    firedAt: "2026-11-05T14:40:00.000Z",
    startedAt: "2026-11-05T14:40:02.000Z",
    endedAt: "2026-11-05T14:43:14.000Z",
    verified: true,
  }),
  runRow({
    runId: "r-49",
    firedAt: "2026-11-04T15:00:00.000Z",
    endedAt: "2026-11-04T15:02:40.000Z",
    delivery: "unknown",
    cost: { usd: 0.03 },
  }),
  runRow({
    runId: "r-48",
    catchUp: true,
    firedAt: "2026-11-03T15:00:00.000Z",
    startedAt: "2026-11-03T17:42:30.000Z",
    endedAt: "2026-11-03T17:46:30.000Z",
    verified: false,
    cost: { usd: 0.05 },
  }),
  runRow({
    runId: "r-47",
    status: "skipped",
    firedAt: "2026-11-02T15:00:00.000Z",
    sessionId: null,
    startedAt: null,
    process: null,
    delivery: null,
    reason: "missed; only the most recent slot is caught up",
    usage: null,
    cost: null,
    notify: null,
  }),
  runRow({
    runId: "r-46",
    attempt: 2,
    firedAt: "2026-10-30T14:00:00.000Z",
    endedAt: "2026-10-30T14:10:00.000Z",
    process: "blocked",
    delivery: "none",
    reason: "ran past its 10-minute budget",
    cost: { usd: 0.12 },
    notify: { tier: "interrupt", at: "2026-10-30T14:10:00.000Z" },
  }),
  runRow({
    runId: "r-45",
    trigger: "manual",
    firedAt: "2026-10-29T19:00:00.000Z",
    endedAt: "2026-10-29T19:00:30.000Z",
    process: "cancelled",
    delivery: "none",
    reason: "stopped by the keeper; stopping does not undo what already ran",
    cost: null,
  }),
  runRow({
    runId: "r-44",
    status: "dropped",
    firedAt: "2026-10-29T14:00:00.000Z",
    sessionId: null,
    startedAt: null,
    process: null,
    delivery: null,
    reason: "dropped: this chore already ran 6 times in the last hour (cap 6)",
    usage: null,
    cost: null,
    notify: null,
  }),
];

export const nodeSettings: NotificationSettings = {
  tz: testZone,
  digest: ["08:30", "12:30", "17:30"],
  quietHours: { start: "22:00", end: "07:00" },
};

export interface ChoresReading {
  creatures: readonly CreatureRow[] | string;
  chores: Record<string, readonly ChoreRow[] | string>;
  runs: Record<string, readonly RunRow[]>;
  needs?: readonly ChoreNeed[] | undefined;
  settings?: NotificationSettings | undefined;
}

export function reading(overrides: Partial<ChoresReading> = {}): ChoresReading {
  return {
    creatures: [wren, tam],
    chores: { wren: [...wrenChores], tam: [] },
    runs: { [runsKey("wren", "morning-triage")]: morningRuns },
    ...overrides,
  };
}

export function heldChoreNeed(overrides: Partial<ChoreNeed> = {}): ChoreNeed {
  return {
    creature: "wren",
    routineId: "stamp-note",
    kind: "grants",
    reason: "accept the write grant set c972c8df8a92d543",
    runId: "r-70",
    since: "2026-11-06T06:35:25.000Z",
    action: { verb: "accept", digest: "c972c8df8a92d543" },
    ...overrides,
  };
}

export interface ScriptedAnswers {
  run(creature: string, id: string): Answer<RunRow>;
  cancel(creature: string, id: string): Answer<RunRow>;
  put(creature: string, file: ChoreFile): Answer<PutChore>;
  accept(creature: string, id: string, digest: string): Answer<ChoreRow>;
  remove(creature: string, id: string): Answer<ChoreRow>;
  mintHook(creature: string, id: string): Answer<MintedHook>;
}

export interface RecordingPort {
  readonly port: ChoresPort;
  readonly reads: string[];
  readonly writes: string[];
  readonly puts: ChoreFile[];
}

export function recordingPort(
  served: ChoresReading,
  answering: Partial<ScriptedAnswers> = {},
): RecordingPort {
  const reads: string[] = [];
  const writes: string[] = [];
  const puts: ChoreFile[] = [];
  const answers = { ...defaultAnswers(served), ...answering };
  const listed = <Value>(value: Value | string): Answer<Value> =>
    typeof value === "string" ? refused(404, value) : { ok: true, value };
  const read = <Value>(call: string, value: Value): Value => {
    reads.push(call);
    return value;
  };
  const write = <Value>(call: string, answer: () => Value): Value => {
    writes.push(call);
    return answer();
  };
  const port: ChoresPort = {
    creatures: async () => read("creatures", listed(served.creatures)),
    needsYou: async () => read("needs-you", { ok: true, value: served.needs ?? [] }),
    chores: async (creature) => read(`chores ${creature}`, listed(served.chores[creature] ?? [])),
    runs: async (creature, id) =>
      read(`runs ${creature}/${id}`, {
        ok: true,
        value: served.runs[runsKey(creature, id)] ?? [],
      }),
    notificationSettings: async () => read("settings", served.settings),
    put: async (creature, file) =>
      write(`put ${creature}/${file.id}`, () => {
        puts.push(file);
        return answers.put(creature, file);
      }),
    run: async (creature, id) => write(`run ${creature}/${id}`, () => answers.run(creature, id)),
    cancel: async (creature, id) =>
      write(`cancel ${creature}/${id}`, () => answers.cancel(creature, id)),
    accept: async (creature, id, digest) =>
      write(`accept ${creature}/${id} ${digest}`, () => answers.accept(creature, id, digest)),
    remove: async (creature, id) =>
      write(`remove ${creature}/${id}`, () => answers.remove(creature, id)),
    mintHook: async (creature, id) =>
      write(`hook ${creature}/${id}`, () => answers.mintHook(creature, id)),
  };
  return { port, reads, writes, puts };
}

export function refused<Value>(status: number, error: string): Answer<Value> {
  return { ok: false, status, error };
}

function defaultAnswers(node: ChoresReading): ScriptedAnswers {
  const rowOf = (creature: string, id: string): ChoreRow | undefined => {
    const rows = node.chores[creature];
    return typeof rows === "string" ? undefined : rows?.find((row) => row.id === id);
  };
  const found = (creature: string, id: string): Answer<ChoreRow> => {
    const row = rowOf(creature, id);
    return row === undefined
      ? refused(404, "that creature has no chore with that id")
      : { ok: true, value: row };
  };
  return {
    run: (creature, id) => ({
      ok: true,
      value: runRow({
        runId: "r-60",
        creature,
        routineId: id,
        trigger: "manual",
        firedAt: "2026-11-05T15:00:00.000Z",
        status: "running",
        process: null,
        delivery: null,
        cost: null,
      }),
    }),
    cancel: (creature, id) => ({
      ok: true,
      value: runRow({
        runId: "r-41",
        creature,
        routineId: id,
        firedAt: "2026-11-05T14:00:00.000Z",
        status: "running",
        process: null,
        delivery: null,
      }),
    }),
    put: (creature, file) => {
      const known = rowOf(creature, file.id);
      return {
        ok: true,
        value: {
          row: { ...(known ?? choreRow(file)), creature, routine: file },
          created: known === undefined,
        },
      };
    },
    accept: found,
    remove: found,
    mintHook: (creature, id) => ({
      ok: true,
      value: { token: "minted-token", path: `/hooks/${creature}/${id}` },
    }),
  };
}
