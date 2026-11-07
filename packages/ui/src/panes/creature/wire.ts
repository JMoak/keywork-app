import type { Fetch, RanchClient } from "@keywork-app/client";
import {
  type CreatureDetail,
  type CreaturePause,
  type CreatureRemoval,
  type CreatureSummary,
  type CreatureThreadState,
  isServedRefusal,
  type ModelClass,
  type ModelPolicy,
  type ModelPolicySlot,
  modelClasses,
  type RoutineFile,
  type RoutineView,
  type ServedRefusal,
  type ServedRefusalKind,
  type WorkshopHealth,
  type WorkshopHealthReport,
} from "@keywork-app/protocol";
import { z } from "zod";

export type {
  CreatureDetail,
  CreatureRemoval,
  CreatureSummary,
  CreatureThread,
  ModelClass,
  ModelPolicy,
  WorkshopHealthReport,
} from "@keywork-app/protocol";
export { modelClasses };

export type ModelChoice = ModelPolicySlot;
export type ThreadState = CreatureThreadState;
export type WorkshopHealthWord = WorkshopHealth;
export type RoutineFileView = NonNullable<RoutineView["routine"]>;

export const threadStates = ["working", "waiting", "back", "blocked", "paused"] as const;
export const workshopHealths = ["up", "starting", "unresponsive", "down"] as const;

export const modelChoiceSchema = z.union([
  z.literal("inherit"),
  z.object({ provider: z.string().min(1), model: z.string().min(1) }),
]) satisfies z.ZodType<ModelPolicySlot>;

const slot = modelChoiceSchema.default("inherit");

export const modelPolicySchema = z.object({
  strong: slot,
  loop: slot,
  decide: slot,
  vision: slot,
}) satisfies z.ZodType<ModelPolicy>;

export const creatureSummarySchema = z.object({
  slug: z.string(),
  name: z.string(),
  sigil: z.string(),
  created: z.string(),
  skin: z.string(),
  seed: z.number(),
  workshop: z.string(),
  models: modelPolicySchema,
  conversation: z.string().nullable(),
  threads: z.number(),
  paused: z.string().nullable().optional(),
}) satisfies z.ZodType<CreatureSummary>;

export const creatureThreadSchema = z.object({
  id: z.string(),
  kind: z.enum(["thread", "routine"]),
  title: z.string(),
  state: z.enum(threadStates),
  children: z.number(),
  lastActivityAt: z.string(),
});

export const creatureDetailSchema = creatureSummarySchema
  .omit({ conversation: true, threads: true })
  .extend({
    introduction: z.string(),
    conversation: z.string(),
    threads: z.array(creatureThreadSchema),
    nextRun: z.object({ routineId: z.string(), at: z.string() }).nullable(),
    usage: z.object({
      date: z.string(),
      sessions: z.number(),
      costNanos: z.number().nullable(),
    }),
    routines: z.string(),
  }) satisfies z.ZodType<CreatureDetail>;

export const creatureRemovalSchema = z.object({
  slug: z.string(),
  goes: z.object({
    definition: z.string(),
    conversation: z.string().nullable(),
    threads: z.array(z.string()),
    notes: z.number(),
    routines: z.number(),
    workshop: z.string().nullable(),
  }),
  stays: z.object({
    workspace: z.string(),
    workshop: z.string().nullable(),
  }),
}) satisfies z.ZodType<CreatureRemoval>;

export const creaturePauseSchema = z.object({
  slug: z.string(),
  paused: z.boolean(),
  since: z.string().nullable(),
  chores: z.array(z.string()),
}) satisfies z.ZodType<CreaturePause>;

export const workshopHealthSchema = z.object({
  id: z.string(),
  substrate: z.enum(["sbx", "host"]),
  health: z.enum(workshopHealths),
  limitations: z.array(z.string()),
}) satisfies z.ZodType<WorkshopHealthReport>;

export const routineFileSchema = z.custom<RoutineFileView>(looksLikeRoutineFile);

export const routineRowSchema = z.object({
  creature: z.string(),
  id: z.string(),
  routine: routineFileSchema.nullable(),
  problem: z.string().nullable().optional(),
  schedule: z.object({
    enabled: z.boolean(),
    nextRunAt: z.string().nullable().optional(),
  }),
  activeRunId: z.string().nullable().optional(),
});
export type RoutineRow = z.output<typeof routineRowSchema>;

export const classReportSchema = z.object({
  ruleClass: z.string(),
  model: z.string().optional(),
  rows: z.number(),
  labelled: z.number(),
  answered: z.number(),
  agreement: z.number().optional(),
  brier: z.number().optional(),
  wouldAct: z.number(),
  wrongActs: z.number(),
  oneWayDoor: z.boolean(),
  gradeWord: z.string(),
  gradeText: z.string(),
});
export type ClassReport = z.output<typeof classReportSchema>;

export const calibrationSchema = z.object({
  model: z.string(),
  ruleClass: z.string(),
  state: z.enum(["fitting", "no-bar", "collecting", "awaiting-labels", "accepted", "rejected"]),
  labelled: z.number(),
  sampleSize: z.number(),
  acts: z.number().optional(),
  agreement: z.number().optional(),
  lowerBound: z.number().optional(),
  errors: z.number().optional(),
  bar: z.number().optional(),
});
export type CalibrationEntry = z.output<typeof calibrationSchema>;

export const promotionSchema = z.object({
  ruleClass: z.string(),
  model: z.string(),
  at: z.string(),
  creature: z.string().optional(),
});

export const keeperReportSchema = z.object({
  mode: z.enum(["shadow", "enforce"]),
  enforced: z.boolean(),
  ledgerPath: z.string(),
  rows: z.number(),
  earlierRows: z.number(),
  classes: z.array(classReportSchema),
  gate: classReportSchema.optional(),
  auditRate: z.number().optional(),
  calibration: z.array(calibrationSchema).optional(),
  promotions: z.array(promotionSchema).optional(),
  pendingReviews: z.number().optional(),
});
export type KeeperReport = z.output<typeof keeperReportSchema>;

export interface CreatureChange {
  readonly name?: string;
  readonly body?: { readonly skin: string };
  readonly models?: Partial<ModelPolicy>;
}

export type Reading<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly detail: string };

export type RanchRoutes = Pick<
  RanchClient,
  "creature" | "removeCreature" | "routines" | "putRoutine" | "workshopHealth"
>;

export interface CreatureClientSeams {
  readonly fetch: Fetch;
  readonly ranch?: RanchRoutes | undefined;
}

export interface CreatureClient {
  read(slug: string): Promise<Reading<CreatureDetail>>;
  change(slug: string, change: CreatureChange): Promise<Reading<CreatureSummary>>;
  removal(slug: string, keepWorkshop: boolean): Promise<Reading<CreatureRemoval>>;
  remove(slug: string, keepWorkshop: boolean): Promise<Reading<CreatureRemoval>>;
  routines(slug: string): Promise<Reading<readonly RoutineRow[]>>;
  putRoutine(slug: string, id: string, file: RoutineFile): Promise<Reading<RoutineRow>>;
  workshopHealth(id: string): Promise<Reading<WorkshopHealthReport>>;
  report(slug: string): Promise<Reading<KeeperReport>>;
  pause(slug: string, paused: boolean): Promise<Reading<CreaturePause>>;
}

export const creaturesPath = "/creatures";

export function creatureClient(seams: CreatureClientSeams): CreatureClient {
  const { fetch, ranch } = seams;
  const call = <T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    accepted: readonly number[] = [],
  ): Promise<Reading<T>> => request(fetch, method, path, schema, body, accepted);
  const creature = (slug: string): string => `${creaturesPath}/${encodeURIComponent(slug)}`;
  const removalQuery = (confirmed: boolean, keepWorkshop: boolean): string =>
    `?confirmed=${confirmed}&keepWorkshop=${keepWorkshop}`;
  const removalSchema = z.object({ removal: creatureRemovalSchema });
  return {
    read: (slug) =>
      ranch === undefined
        ? call("GET", creature(slug), creatureDetailSchema)
        : served(ranch.creature(slug), creatureDetailSchema, `GET ${creature(slug)}`),
    change: (slug, change) => call("PATCH", creature(slug), creatureSummarySchema, change),
    pause: (slug, paused) =>
      call("POST", `${creature(slug)}/${paused ? "pause" : "resume"}`, creaturePauseSchema),
    removal: (slug, keepWorkshop) =>
      ranch === undefined
        ? call(
            "DELETE",
            `${creature(slug)}${removalQuery(false, keepWorkshop)}`,
            removalSchema,
            undefined,
            [409],
          ).then(unwrap((answer) => answer.removal))
        : served(
            ranch.removeCreature(slug, { confirmed: false, keepWorkshop }),
            removalSchema,
            `DELETE ${creature(slug)}`,
          ).then(unwrap((answer) => answer.removal)),
    remove: (slug, keepWorkshop) =>
      ranch === undefined
        ? call(
            "DELETE",
            `${creature(slug)}${removalQuery(true, keepWorkshop)}`,
            z.object({ removed: z.literal(true), removal: creatureRemovalSchema }),
          ).then(unwrap((answer) => answer.removal))
        : served(
            ranch.removeCreature(slug, { confirmed: true, keepWorkshop }),
            z.object({ removed: z.literal(true), removal: creatureRemovalSchema }),
            `DELETE ${creature(slug)}`,
          ).then(unwrap((answer) => answer.removal)),
    routines: (slug) =>
      ranch === undefined
        ? call(
            "GET",
            `${creature(slug)}/routines`,
            z.object({ routines: z.array(routineRowSchema) }),
          ).then(unwrap((listed) => listed.routines))
        : served(ranch.routines(slug), z.array(routineRowSchema), `GET ${creature(slug)}/routines`),
    putRoutine: (slug, id, file) =>
      ranch === undefined
        ? call(
            "PUT",
            `${creature(slug)}/routines/${encodeURIComponent(id)}`,
            z.object({ routine: routineRowSchema }),
            file,
          ).then(unwrap((answer) => answer.routine))
        : served(
            ranch.putRoutine(slug, id, file),
            z.object({ routine: routineRowSchema }),
            `PUT ${creature(slug)}/routines/${id}`,
          ).then(unwrap((answer) => answer.routine)),
    workshopHealth: (id) =>
      ranch === undefined
        ? call("GET", `/workshops/${encodeURIComponent(id)}/health`, workshopHealthSchema)
        : served(ranch.workshopHealth(id), workshopHealthSchema, `GET /workshops/${id}/health`),
    report: (slug) => call("GET", `${creature(slug)}/report`, keeperReportSchema),
  };
}

export function refusal(status: number, detail: string): Reading<never> {
  return { ok: false, status, detail };
}

export function statusOfRefusal(kind: ServedRefusalKind): number {
  return refusalStatuses[kind];
}

const refusalStatuses: Readonly<Record<ServedRefusalKind, number>> = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  missing: 404,
  conflict: 409,
  deferred: 501,
  failed: 502,
  unserved: 503,
};

async function served<T>(
  answer: Promise<unknown | ServedRefusal>,
  schema: z.ZodType<T>,
  label: string,
): Promise<Reading<T>> {
  let value: unknown;
  try {
    value = await answer;
  } catch (cause) {
    return refusal(0, cause instanceof Error ? cause.message : String(cause));
  }
  if (isServedRefusal(value)) return refusal(statusOfRefusal(value.refused), value.detail);
  return readShape(schema, value, 200, label);
}

async function request<T>(
  fetch: Fetch,
  method: string,
  path: string,
  schema: z.ZodType<T>,
  body: unknown,
  accepted: readonly number[],
): Promise<Reading<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    return refusal(0, cause instanceof Error ? cause.message : String(cause));
  }
  const payload = parseJson(await response.text());
  if (!response.ok && !accepted.includes(response.status)) {
    return refusal(response.status, errorLineOf(payload) ?? response.statusText);
  }
  return readShape(schema, payload, response.status, `${method} ${path}`);
}

function readShape<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  status: number,
  label: string,
): Reading<T> {
  const parsed = schema.safeParse(payload);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : refusal(status, `${label} answered a shape this pane cannot read`);
}

function unwrap<Outer, Inner>(
  pick: (outer: Outer) => Inner,
): (reading: Reading<Outer>) => Reading<Inner> {
  return (reading) => (reading.ok ? { ok: true, value: pick(reading.value) } : reading);
}

function looksLikeRoutineFile(candidate: unknown): candidate is RoutineFileView {
  if (typeof candidate !== "object" || candidate === null) return false;
  const file = candidate as { title?: unknown; enabled?: unknown };
  return (
    typeof file.title === "string" &&
    (file.enabled === undefined || typeof file.enabled === "boolean")
  );
}

function parseJson(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorLineOf(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) return undefined;
  const error = (payload as { error: unknown }).error;
  return typeof error === "string" ? error : undefined;
}

export function isModelClass(candidate: string): candidate is ModelClass {
  return (modelClasses as readonly string[]).includes(candidate);
}
