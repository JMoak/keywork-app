export type RunTrigger = "cron" | "interval" | "manual" | "at" | OccurrenceRunTrigger;

export type RunStatus = "running" | "parked" | "ended" | "skipped" | "dropped";

export type RunProcess = "completed" | "failed" | "cancelled" | "timed-out" | "blocked";

export type RunDelivery = "delivered" | "unknown" | "failed" | "none";

export type NotificationTier = "interrupt" | "digest" | "log";

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface RunNotice {
  tier: NotificationTier;
  at: string | null;
}

export interface RunRow {
  runId: string;
  creature: string;
  routineId: string;
  attempt: number;
  trigger: RunTrigger;
  catchUp: boolean;
  firedAt: string;
  scheduledFor: string;
  status: RunStatus;
  sessionId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  process: RunProcess | null;
  delivery: RunDelivery | null;
  verified: boolean | null;
  reason: string | null;
  usage: RunUsage | null;
  cost: { usd: number } | null;
  output: string | null;
  notify: RunNotice | null;
}

export interface RoutineFired {
  runId: string;
  creature: string;
  routineId: string;
  attempt: number;
  trigger: RunTrigger;
  catchUp: boolean;
  firedAt: string;
  scheduledFor: string;
  startedAt: string;
  sessionId: string;
}

export interface RoutineFinished {
  run: RunRow;
  disabled: string | null;
}

export type RoutineTrigger =
  | { kind: "cron"; expr: string; tz: string; until?: string | undefined }
  | { kind: "interval"; minutes: number; until?: string | undefined }
  | { kind: "manual" }
  | OccurrenceTrigger;

export type RoutineDestination =
  | { kind: "conversation" }
  | { kind: "thread"; name: string }
  | { kind: "file"; path: string };

export type NotifyChoice = "always" | "only-when-needs-me" | "never";

export type ToolPosture = "read-only" | "write" | "act";

export interface GrantRule {
  action: string;
  resource: string;
}

export interface RoutineBudget {
  usd: number;
  minutes: number;
}

export interface RoutineFile {
  id?: string | undefined;
  title: string;
  instructions: string;
  trigger: RoutineTrigger;
  destination?: RoutineDestination | undefined;
  notify?: NotifyChoice | undefined;
  tools?: ToolPosture | undefined;
  grants?: readonly GrantRule[] | undefined;
  budget?: RoutineBudget | undefined;
  enabled?: boolean | undefined;
  wake?: RoutineWake | undefined;
}

export interface RoutineGrantsView {
  posture: ToolPosture;
  digest: string;
  needsAcceptance: boolean;
  accepted: boolean;
  acceptedAt: string | null;
}

export interface RoutineScheduleView {
  enabled: boolean;
  disabled: { reason: string; at: string } | null;
  nextRunAt: string | null;
  consecutiveErrors: number;
  retryAt: string | null;
}

export interface RoutineView {
  creature: string;
  id: string;
  file: string;
  routine:
    | (Required<Omit<RoutineFile, "id" | "wake">> & { id: string; wake?: RoutineWake | undefined })
    | null;
  problem: string | null;
  grants: RoutineGrantsView | null;
  schedule: RoutineScheduleView;
  activeRunId: string | null;
  lastRun: RunRow | null;
}

export type RoutineNeedKind = "invalid" | "disabled" | "grants" | "run";

export interface RoutineNeed {
  creature: string;
  routineId: string;
  kind: RoutineNeedKind;
  reason: string;
  runId: string | null;
  since: string | null;
  action: { verb: "accept"; digest: string } | null;
}

export interface RoutineNeeds {
  creature: string;
  routineId: string;
  items: readonly RoutineNeed[];
}

export type OccurrenceTrigger =
  | { kind: "at"; at: string }
  | { kind: "file-watch"; paths: readonly string[]; debounceMs: number }
  | { kind: "webhook"; maxBytes: number }
  | {
      kind: "event";
      name: string;
      where: Readonly<Record<string, string | number | boolean | null>>;
      debounceMs: number;
    };

export type OccurrenceRunTrigger = Exclude<OccurrenceTrigger["kind"], "at">;

export interface RoutineWake {
  requestedAt: string;
}

export interface RoutineHookMint {
  token: string;
  path: string;
}

export interface RoutineHookFired {
  runId: string;
  status: RunStatus;
}

export interface RoutinePut {
  routine: RoutineView;
  created: boolean;
}

export const routineFileBody = [
  "id",
  "title",
  "instructions",
  "trigger",
  "trigger.kind",
  "trigger.expr",
  "trigger.tz",
  "trigger.until",
  "trigger.minutes",
  "destination",
  "destination.kind",
  "destination.name",
  "destination.path",
  "notify",
  "tools",
  "grants",
  "grants.action",
  "grants.resource",
  "budget",
  "budget.usd",
  "budget.minutes",
  "enabled",
] as const;

export const routineRoutes = [
  { method: "GET", path: "/creatures/{slug}/routines", operationId: "listRoutines" },
  { method: "GET", path: "/creatures/{slug}/routines/{id}", operationId: "readRoutine" },
  { method: "PUT", path: "/creatures/{slug}/routines/{id}", operationId: "putRoutine" },
  { method: "DELETE", path: "/creatures/{slug}/routines/{id}", operationId: "deleteRoutine" },
  { method: "POST", path: "/creatures/{slug}/routines/{id}/run", operationId: "runRoutine" },
  { method: "POST", path: "/creatures/{slug}/routines/{id}/cancel", operationId: "cancelRoutine" },
  {
    method: "POST",
    path: "/creatures/{slug}/routines/{id}/accept",
    operationId: "acceptRoutineGrants",
  },
  { method: "GET", path: "/creatures/{slug}/routines/{id}/runs", operationId: "listRoutineRuns" },
  { method: "GET", path: "/routines/needs-you", operationId: "listNeedsYou" },
  { method: "POST", path: "/creatures/{slug}/routines/{id}/hook", operationId: "mintRoutineHook" },
  { method: "POST", path: "/hooks/{slug}/{id}", operationId: "fireRoutineHook" },
] as const;
