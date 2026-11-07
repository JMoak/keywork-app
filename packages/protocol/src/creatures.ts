import type { ModelClass } from "./models.ts";
import type { WorkshopSubstrate } from "./workshops.ts";

export type CreatureChange =
  | "created"
  | "updated"
  | "paused"
  | "resumed"
  | "removed"
  | "conversation"
  | "threads";

export interface CreatureChanged {
  slug: string;
  change: CreatureChange;
}

export interface ExternalOrigin {
  kind: "external";
  client: string;
}

export interface CreatureOrigin {
  kind: "creature";
  creature: string;
  thread: string;
}

export type PromptOrigin = ExternalOrigin | CreatureOrigin;

export interface MessageOrigin extends CreatureOrigin {
  node: string;
  machine: string;
}

export type InboundPolicy = "nobody" | "paired" | { named: readonly string[] };

export type CreatureThreadKind = "conversation" | "thread" | "routine" | "child";

export interface ModelCandidate {
  provider: string;
  model: string;
}

export type ModelPolicySlot = "inherit" | ModelCandidate;

export type ModelPolicy = Record<ModelClass, ModelPolicySlot>;

export interface CreatureSummary {
  slug: string;
  name: string;
  sigil: string;
  created: string;
  skin: string;
  seed: number;
  workshop: string;
  models: ModelPolicy;
  conversation: string | null;
  threads: number;
  paused?: string | null | undefined;
  inbound?: InboundPolicy | undefined;
}

export type CreatureThreadState = "working" | "waiting" | "back" | "blocked" | "paused";

export interface CreatureThread {
  id: string;
  kind: Exclude<CreatureThreadKind, "conversation" | "child">;
  title: string;
  state: CreatureThreadState;
  children: number;
  lastActivityAt: string;
}

export interface RoutineRunAhead {
  routineId: string;
  at: string;
}

export interface DayUsage {
  date: string;
  sessions: number;
  costNanos: number | null;
}

export interface CreatureDetail extends Omit<CreatureSummary, "conversation" | "threads"> {
  introduction: string;
  conversation: string;
  threads: readonly CreatureThread[];
  nextRun: RoutineRunAhead | null;
  usage: DayUsage;
  routines: string;
}

export interface CreatureDraft {
  name: string;
  skin?: string | undefined;
  workshop?: string | undefined;
  substrate?: WorkshopSubstrate | undefined;
  models?: Partial<ModelPolicy> | undefined;
}

export interface CreaturePatch {
  name?: string | undefined;
  body?: { skin?: string | undefined; seed?: number | undefined } | undefined;
  models?: Partial<ModelPolicy> | undefined;
  cloudFallback?: boolean | undefined;
  inbound?: InboundPolicy | undefined;
}

export interface CreaturePause {
  slug: string;
  paused: boolean;
  since: string | null;
  chores: readonly string[];
}

export interface CreatureReportClass {
  ruleClass: string;
  model?: string | undefined;
  rows: number;
  labelled: number;
  answered: number;
  agreement?: number | undefined;
  brier?: number | undefined;
  wouldAct: number;
  wrongActs: number;
  oneWayDoor: boolean;
  grade: { readonly kind: string; readonly [detail: string]: unknown };
  gradeWord: string;
  gradeText: string;
}

export type CalibrationState =
  | "fitting"
  | "no-bar"
  | "collecting"
  | "awaiting-labels"
  | "accepted"
  | "rejected";

export interface BlindReview {
  drawn: number;
  answered: number;
  agreedWithGate: number;
  agreedWithMoment: number;
  deniedAtBar: number;
}

export interface ModelCalibration {
  model: string;
  ruleClass: string;
  state: CalibrationState;
  labelled: number;
  fitRows: number;
  heldOutRows: number;
  bar?: number | undefined;
  fitActs?: number | undefined;
  acts: number;
  sampleSize: number;
  agreement?: number | undefined;
  interval?: { readonly lower: number; readonly upper: number } | undefined;
  errors?: number | undefined;
  lowerBound?: number | undefined;
  review: BlindReview;
}

export interface Promotion {
  ruleClass: string;
  model: string;
  evidenceVersion: string;
  bar: number;
  creature?: string | undefined;
  sampleSize: number;
  errors: number;
  lowerBound: number;
  by: "keeper";
  at: string;
}

export interface Demotion {
  ruleClass: string;
  creature?: string | undefined;
  by: "keeper" | "overturn" | "audits";
  reason: string;
  at: string;
}

export type PromotionRefusal =
  | "one-way-door"
  | "every-class"
  | "promoted"
  | "unanswered"
  | "uncalibrated"
  | "blind-review";

export type PromoteOutcome =
  | { promoted: true; promotion: Promotion; sentence: string }
  | {
      promoted: false;
      refusal: PromotionRefusal;
      sentence: string;
      calibration?: ModelCalibration | undefined;
    };

export type DemoteOutcome =
  | { demoted: true; demotion: Demotion; promotions: readonly Promotion[]; sentence: string }
  | { demoted: false; sentence: string };

export type OverturnOutcome =
  | { overturned: true; recordId: string; ruleClass: string; demoted: readonly Promotion[] }
  | { overturned: false; reason: "not-decided-for-you" | "already-overturned" };

export interface CreatureReport {
  creature: string;
  gateId: string;
  mode: "shadow" | "enforce";
  enforced: boolean;
  ledgerPath: string;
  evidenceVersion?: string | undefined;
  rows: number;
  earlierRows: number;
  classes: readonly CreatureReportClass[];
  gate?: CreatureReportClass | undefined;
  auditRate?: number | undefined;
  calibration?: readonly ModelCalibration[] | undefined;
  promotions?: readonly Promotion[] | undefined;
  pendingReviews?: number | undefined;
}

export interface CreatureRemoval {
  slug: string;
  goes: {
    definition: string;
    conversation: string | null;
    threads: readonly string[];
    notes: number;
    routines: number;
    workshop: string | null;
  };
  stays: {
    workspace: string;
    workshop: string | null;
  };
}

export interface CreatureRemovalChoice {
  confirmed?: boolean | undefined;
  keepWorkshop?: boolean | undefined;
}

export type CreatureRemovalOutcome =
  | { removed: true; removal: CreatureRemoval }
  | { removed: false; removal: CreatureRemoval };

export const creatureDraftBody = ["name", "skin", "workshop", "substrate", "models"] as const;

export const creaturePatchBody = [
  "name",
  "body",
  "body.skin",
  "body.seed",
  "models",
  "cloudFallback",
  "inbound",
] as const;

export const ruleClassBody = ["ruleClass"] as const;
export const recordIdBody = ["recordId"] as const;

export const creatureRoutes = [
  { method: "GET", path: "/creatures", operationId: "listCreatures" },
  { method: "POST", path: "/creatures", operationId: "createCreature" },
  { method: "GET", path: "/creatures/{slug}", operationId: "readCreature" },
  { method: "PATCH", path: "/creatures/{slug}", operationId: "updateCreature" },
  { method: "GET", path: "/creatures/{slug}/report", operationId: "readCreatureReport" },
  { method: "POST", path: "/creatures/{slug}/promote", operationId: "promoteCreatureClass" },
  { method: "POST", path: "/creatures/{slug}/demote", operationId: "demoteCreatureClass" },
  { method: "POST", path: "/creatures/{slug}/overturn", operationId: "overturnCreatureDecision" },
  { method: "POST", path: "/creatures/{slug}/pause", operationId: "pauseCreature" },
  { method: "POST", path: "/creatures/{slug}/resume", operationId: "resumeCreature" },
  { method: "DELETE", path: "/creatures/{slug}", operationId: "removeCreature" },
  { method: "POST", path: "/creatures/{slug}/mcp", operationId: "serveCreatureMcp" },
  {
    method: "POST",
    path: "/creatures/{slug}/mcp/arrivals",
    operationId: "takeCreatureMcpArrival",
  },
] as const;
