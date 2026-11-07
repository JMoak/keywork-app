import type { RoutineNeed } from "@keywork-app/protocol";
import { z } from "zod";

export const toolPostures = ["read-only", "write", "act"] as const;
export const notifyChoices = ["always", "only-when-needs-me", "never"] as const;
export const triggerKinds = [
  "cron",
  "interval",
  "manual",
  "at",
  "file-watch",
  "webhook",
  "event",
] as const;
export const destinationKinds = ["conversation", "thread", "file"] as const;

const cronTrigger = z.object({
  kind: z.literal("cron"),
  expr: z.string(),
  tz: z.string(),
  until: z.string().optional(),
});

const intervalTrigger = z.object({
  kind: z.literal("interval"),
  minutes: z.number(),
  until: z.string().optional(),
});

const manualTrigger = z.object({ kind: z.literal("manual") });

const atTrigger = z.object({ kind: z.literal("at"), at: z.string() });

const fileWatchTrigger = z.object({
  kind: z.literal("file-watch"),
  paths: z.array(z.string()),
  debounceMs: z.number(),
});

const webhookTrigger = z.object({ kind: z.literal("webhook"), maxBytes: z.number() });

const eventTrigger = z.object({
  kind: z.literal("event"),
  name: z.string(),
  where: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  debounceMs: z.number(),
});

const wake = z.object({ requestedAt: z.string() });

const destination = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("conversation") }),
  z.object({ kind: z.literal("thread"), name: z.string() }),
  z.object({ kind: z.literal("file"), path: z.string() }),
]);

const grant = z.object({ action: z.string(), resource: z.string() });

export const choreFileSchema = z.object({
  id: z.string(),
  title: z.string(),
  instructions: z.string(),
  trigger: z.discriminatedUnion("kind", [
    cronTrigger,
    intervalTrigger,
    manualTrigger,
    atTrigger,
    fileWatchTrigger,
    webhookTrigger,
    eventTrigger,
  ]),
  destination,
  notify: z.enum(notifyChoices),
  tools: z.enum(toolPostures),
  grants: z.array(grant),
  budget: z.object({ usd: z.number(), minutes: z.number() }),
  enabled: z.boolean(),
  wake: wake.optional(),
});

export const runRowSchema = z.object({
  runId: z.string(),
  creature: z.string(),
  routineId: z.string(),
  attempt: z.number(),
  trigger: z.enum(triggerKinds),
  catchUp: z.boolean(),
  firedAt: z.string(),
  scheduledFor: z.string(),
  status: z.enum(["running", "parked", "ended", "skipped", "dropped"]),
  sessionId: z.string().nullable(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  process: z.enum(["completed", "failed", "cancelled", "timed-out", "blocked"]).nullable(),
  delivery: z.enum(["delivered", "unknown", "failed", "none"]).nullable(),
  verified: z.boolean().nullable(),
  reason: z.string().nullable(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).nullable(),
  cost: z.object({ usd: z.number() }).nullable(),
  output: z.string().nullable(),
  notify: z
    .object({ tier: z.enum(["interrupt", "digest", "log"]), at: z.string().nullable() })
    .nullable(),
});

export const choreRowSchema = z.object({
  creature: z.string(),
  id: z.string(),
  file: z.string(),
  routine: choreFileSchema.nullable(),
  problem: z.string().nullable(),
  grants: z
    .object({
      posture: z.enum(toolPostures),
      digest: z.string(),
      needsAcceptance: z.boolean(),
      accepted: z.boolean(),
      acceptedAt: z.string().nullable(),
    })
    .nullable(),
  schedule: z.object({
    enabled: z.boolean(),
    disabled: z.object({ reason: z.string(), at: z.string() }).nullable(),
    nextRunAt: z.string().nullable(),
    consecutiveErrors: z.number(),
    retryAt: z.string().nullable(),
  }),
  activeRunId: z.string().nullable(),
  lastRun: runRowSchema.nullable(),
});

export const creatureRowSchema = z.object({ slug: z.string(), name: z.string() });

export const choreNeedSchema = z.object({
  creature: z.string(),
  routineId: z.string(),
  kind: z.enum(["invalid", "disabled", "grants", "run"]),
  reason: z.string(),
  runId: z.string().nullable(),
  since: z.string().nullable(),
  action: z.object({ verb: z.literal("accept"), digest: z.string() }).nullable(),
}) satisfies z.ZodType<RoutineNeed>;

export type ChoreNeed = RoutineNeed;

export type ChoreFile = z.output<typeof choreFileSchema>;
export type ChoreTrigger = ChoreFile["trigger"];
export type CronTrigger = Extract<ChoreTrigger, { kind: "cron" }>;
export type ChoreDestination = ChoreFile["destination"];
export type ChoreGrant = ChoreFile["grants"][number];
export type ToolPosture = (typeof toolPostures)[number];
export type NotifyChoice = (typeof notifyChoices)[number];
export type TriggerKind = (typeof triggerKinds)[number];
export type DestinationKind = (typeof destinationKinds)[number];
export type RunRow = z.output<typeof runRowSchema>;
export type ChoreRow = z.output<typeof choreRowSchema>;
export type GrantsView = NonNullable<ChoreRow["grants"]>;
export type CreatureRow = z.output<typeof creatureRowSchema>;

export interface NotificationSettings {
  readonly tz?: string | undefined;
  readonly digest: readonly string[];
  readonly quietHours: { readonly start: string; readonly end: string } | null;
}

export type ChoreEvent =
  | {
      readonly kind: "fired";
      readonly creature: string;
      readonly id: string;
      readonly run: RunRow | undefined;
    }
  | {
      readonly kind: "finished";
      readonly creature: string;
      readonly id: string;
      readonly run: RunRow | undefined;
    }
  | {
      readonly kind: "needs";
      readonly creature: string;
      readonly id: string;
      readonly needs: readonly ChoreNeed[];
    }
  | { readonly kind: "creatures" };

export function choreEventOf(envelope: {
  readonly type: string;
  readonly payload: unknown;
}): ChoreEvent | undefined {
  switch (envelope.type) {
    case "routine.fired": {
      const fired = routineFired.safeParse(envelope.payload).data;
      return fired === undefined
        ? undefined
        : { kind: "fired", creature: fired.creature, id: fired.routineId, run: runOfFired(fired) };
    }
    case "routine.finished": {
      const finished = routineFinished.safeParse(envelope.payload).data;
      if (finished === undefined) return undefined;
      const run = runRowSchema.safeParse(finished.run).data;
      return { kind: "finished", creature: finished.run.creature, id: finished.run.routineId, run };
    }
    case "routine.needs": {
      const needs = routineNeeds.safeParse(envelope.payload).data;
      return needs === undefined
        ? undefined
        : { kind: "needs", creature: needs.creature, id: needs.routineId, needs: needs.items };
    }
    case "creature.changed":
      return { kind: "creatures" };
    default:
      return undefined;
  }
}

export function heldOnGrants(needs: readonly ChoreNeed[]): ChoreNeed | undefined {
  return needs.find((need) => need.kind === "grants" && need.runId !== null);
}

export function runsKey(creature: string, id: string): string {
  return `${creature}/${id}`;
}

export function isRunning(row: ChoreRow): boolean {
  return row.activeRunId !== null;
}

export function isOn(row: ChoreRow): boolean {
  return row.schedule.enabled && row.schedule.disabled === null;
}

export function waitingWakeup(row: ChoreRow): ChoreFile | undefined {
  const routine = row.routine;
  if (routine?.wake === undefined || isRunning(row) || !isOn(row)) return undefined;
  return row.schedule.nextRunAt === null ? undefined : routine;
}

export function wakesOnce(routine: ChoreFile): boolean {
  return routine.trigger.kind === "at";
}

export function awaitsAcceptance(row: ChoreRow): boolean {
  return row.grants?.needsAcceptance === true && !row.grants.accepted;
}

const routineFired = z.object({
  creature: z.string(),
  routineId: z.string(),
  runId: z.string().optional(),
  attempt: z.number().optional(),
  trigger: z.enum(triggerKinds).optional(),
  catchUp: z.boolean().optional(),
  firedAt: z.string().optional(),
  scheduledFor: z.string().optional(),
  startedAt: z.string().optional(),
  sessionId: z.string().optional(),
});

const routineFinished = z.object({
  run: z.object({ creature: z.string(), routineId: z.string() }).passthrough(),
});

const routineNeeds = z.object({
  creature: z.string(),
  routineId: z.string(),
  items: z.array(choreNeedSchema),
});

function runOfFired(fired: z.output<typeof routineFired>): RunRow | undefined {
  if (
    fired.runId === undefined ||
    fired.attempt === undefined ||
    fired.trigger === undefined ||
    fired.firedAt === undefined
  ) {
    return undefined;
  }
  return {
    runId: fired.runId,
    creature: fired.creature,
    routineId: fired.routineId,
    attempt: fired.attempt,
    trigger: fired.trigger,
    catchUp: fired.catchUp ?? false,
    firedAt: fired.firedAt,
    scheduledFor: fired.scheduledFor ?? fired.firedAt,
    status: "running",
    sessionId: fired.sessionId ?? null,
    startedAt: fired.startedAt ?? fired.firedAt,
    endedAt: null,
    process: null,
    delivery: null,
    verified: null,
    reason: null,
    usage: null,
    cost: null,
    output: null,
    notify: null,
  };
}
