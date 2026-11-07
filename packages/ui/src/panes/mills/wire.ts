export type HealthState = "up" | "loading" | "saturated" | "down";

export interface HealthReading {
  readonly state: HealthState;
  readonly resident: boolean | null;
  readonly detail: string;
  readonly checkedAt: string;
}

export type ModelClass = "strong" | "loop" | "decide" | "vision";

export const modelClasses: readonly ModelClass[] = ["strong", "loop", "decide", "vision"];

export type CostSource = "provider" | "price_table" | "local_estimate";

export interface ModelCost {
  readonly source: CostSource;
  readonly usdPerMillionInput: number;
  readonly usdPerMillionOutput: number;
}

export type LicenseAcknowledgement = "required" | "not-required" | "unknown";

export interface Ineligible {
  readonly class: ModelClass;
  readonly missing: readonly string[];
}

export interface ModelRow {
  readonly id: string;
  readonly installed: boolean;
  readonly loaded: boolean;
  readonly contextAllocated: number | null;
  readonly health: HealthReading;
  readonly classes: readonly ModelClass[];
  readonly ineligible: readonly Ineligible[];
  readonly license: string | null;
  readonly licenseAcknowledgement: LicenseAcknowledgement;
  readonly cost?: ModelCost | null | undefined;
  readonly released?: string | null | undefined;
  readonly acknowledgedAt?: string | null | undefined;
}

export interface ServerRow {
  readonly kind: string;
  readonly root: string;
  readonly port: number;
  readonly source: "advertised" | "probed";
  readonly auth: "none" | "key";
  readonly fingerprint: string | null;
  readonly version: string | null;
  readonly health: HealthReading;
  readonly models: readonly ModelRow[];
}

export interface NodeModels {
  readonly node: string;
  readonly servers: readonly ServerRow[];
}

export interface ModelsReport {
  readonly generatedAt: string;
  readonly nodes: readonly NodeModels[];
  readonly market?: readonly ServerRow[] | undefined;
}

export type ProbeStatus = "recognized" | "unrecognized" | "unreachable";

export interface ServerFingerprint {
  readonly id: string;
  readonly kind: string;
  readonly version: string | null;
  readonly build: string | null;
}

export interface ProbeReport {
  readonly root: string;
  readonly status: ProbeStatus;
  readonly fingerprint: ServerFingerprint | null;
  readonly health: HealthReading | null;
  readonly records: readonly unknown[];
  readonly listedOnly: readonly string[];
  readonly detail: string | null;
}

export interface ModelCandidate {
  readonly provider: string;
  readonly model: string;
}

export type PolicySlot = "inherit" | ModelCandidate;

export interface CreaturePolicy {
  readonly slug: string;
  readonly name: string;
  readonly models: Partial<Readonly<Record<ModelClass, PolicySlot>>>;
}

export interface ModelTarget {
  readonly endpoint: string;
  readonly model: string;
}

export interface Acknowledged {
  readonly model: string;
  readonly license: string;
  readonly acknowledgedAt: string;
}

export interface Spread {
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface ChatBenchReport {
  readonly kind: "chat";
  readonly reference: string;
  readonly fingerprint: ServerFingerprint;
  readonly trace: string;
  readonly repeats: number;
  readonly turns: number;
  readonly validAt1: Spread;
  readonly toolCalls: {
    readonly name: Spread;
    readonly schema: Spread;
    readonly arguments: Spread;
    readonly noTool: Spread | null;
    readonly parallel: Spread | null;
  };
  readonly tokensPerTurn: Spread | null;
  readonly secondsPerTurn: Spread;
  readonly decodeTokensPerSecond: Spread | null;
  readonly fallbacks: number;
}

export interface PrecisionThreshold {
  readonly target: number;
  readonly threshold: number;
  readonly precision: number;
  readonly coverage: number;
  readonly n: number;
}

export interface DecideBenchReport {
  readonly kind: "decide";
  readonly reference: string;
  readonly fingerprint: ServerFingerprint;
  readonly rows: number;
  readonly repeats: number;
  readonly validAt1: Spread;
  readonly brier: Spread | null;
  readonly ece: Spread | null;
  readonly auroc: Spread | null;
  readonly thresholdAtPrecision: PrecisionThreshold | null;
  readonly secondsPerQuestion: Spread;
  readonly inputTokensPerQuestion: Spread | null;
  readonly fallbacks: number;
}

export type BenchReport = ChatBenchReport | DecideBenchReport;

export type RefusalKind = "unserved" | "unreachable" | "missing" | "invalid" | "failed";

export interface MillsRefusal {
  readonly refused: RefusalKind;
  readonly detail: string;
}

export type Reading<T> = T | MillsRefusal;

export function isMillsRefusal(value: unknown): value is MillsRefusal {
  return typeof value === "object" && value !== null && "refused" in value && "detail" in value;
}
