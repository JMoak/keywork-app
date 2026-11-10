export type ModelClass = "strong" | "loop" | "decide" | "vision";

export const modelClasses: readonly ModelClass[] = ["strong", "loop", "decide", "vision"];

export type FallbackTrigger =
  | "context-length"
  | "rate-limited"
  | "saturated"
  | "down"
  | "moderation";

export interface ModelFallback {
  class: ModelClass;
  from: string;
  to: string;
  trigger: FallbackTrigger;
  cloud: boolean;
}

export type ModelsChangedReason = "probe" | "manifest" | "health";

export interface ModelsChanged {
  node: string;
  reason: ModelsChangedReason;
}

export type ModelHealthState = "up" | "loading" | "saturated" | "down";

export interface ModelHealthReading {
  state: ModelHealthState;
  resident: boolean | null;
  detail: string;
  checkedAt: string;
}

export type LicenseAcknowledgement = "required" | "not-required" | "unknown";

export type ModelCostSource = "provider" | "price_table" | "local_estimate";

export interface ModelRow {
  id: string;
  installed: boolean;
  loaded: boolean;
  contextAllocated: number | null;
  health: ModelHealthReading;
  classes: readonly ModelClass[];
  ineligible: readonly { class: ModelClass; missing: readonly string[] }[];
  license: string | null;
  licenseAcknowledgement: LicenseAcknowledgement;
  cost: { source: ModelCostSource; usdPerMillionInput: number; usdPerMillionOutput: number };
}

export interface ModelServerRow {
  kind: string;
  root: string;
  port: number;
  source: "advertised" | "probed";
  auth: "none" | "key";
  fingerprint: string | null;
  version: string | null;
  health: ModelHealthReading;
  models: readonly ModelRow[];
}

export interface NodeModels {
  node: string;
  servers: readonly ModelServerRow[];
}

export type MarketHealthState = ModelHealthState | "unverified";

export interface MarketHealthReading extends Omit<ModelHealthReading, "state"> {
  state: MarketHealthState;
}

export interface MarketModelRow extends Omit<ModelRow, "health" | "cost"> {
  health: MarketHealthReading;
  cost: ModelRow["cost"] | null;
  released?: string | null;
  acknowledgedAt?: string | null;
}

export interface MarketServerRow extends Omit<ModelServerRow, "source" | "health" | "models"> {
  protocol: string;
  source: "registry";
  health: MarketHealthReading;
  models: readonly MarketModelRow[];
}

export interface InheritRefusal {
  refused: string;
  detail: string;
}

export interface InheritedDecider {
  provider: string;
  model: string;
  decider: "builtin";
  detail: string;
}

export type InheritedModel =
  | { provider: string; model: string }
  | InheritedDecider
  | InheritRefusal;

export type InheritedClasses = Readonly<Record<ModelClass, InheritedModel>>;

export type ConversationModel =
  | { provider: string; model: string; mode: "chat" | "tools"; projectCheck?: ModelTarget }
  | InheritRefusal;

export interface ModelsReport {
  generatedAt: string;
  nodes: readonly NodeModels[];
  market?: readonly MarketServerRow[];
  inherits?: InheritedClasses;
  conversation?: ConversationModel;
}

export interface ModelProbeRequest {
  endpoint: string;
  model?: string | undefined;
  behaviour?: boolean | undefined;
  refresh?: boolean | undefined;
}

export type ModelProbeStatus = "recognized" | "unrecognized" | "unreachable";

export interface ModelProbeReport {
  root: string;
  status: ModelProbeStatus;
  fingerprint: { kind: string; version: string | null } | null;
  health: ModelHealthReading | null;
  records: readonly unknown[];
  listedOnly: readonly string[];
  detail: string | null;
}

export interface ModelTarget {
  endpoint: string;
  model: string;
}

export interface ModelLicenseRequest extends ModelTarget {
  license: string;
}

export type ModelAcknowledgement = Readonly<Record<string, unknown>>;

export type ModelBenchReport = Readonly<Record<string, unknown>>;

export const modelRoutes = [
  { method: "GET", path: "/models", operationId: "listModels" },
  { method: "POST", path: "/models/probe", operationId: "probeModels" },
  { method: "POST", path: "/models/refresh", operationId: "refreshModels" },
  { method: "POST", path: "/models/acknowledgements", operationId: "acknowledgeModelLicense" },
  { method: "POST", path: "/models/bench", operationId: "benchModel" },
  { method: "GET", path: "/models/bench", operationId: "readModelBench" },
] as const;
