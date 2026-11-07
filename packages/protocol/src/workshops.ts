export type WorkshopSubstrate = "sbx" | "compose" | "host";

export type WorkshopState = "stopped" | "running";

export type WorkshopHealth = "up" | "starting" | "unresponsive" | "down";

export interface WorkshopView {
  readonly id: string;
  readonly creature: string;
  readonly substrate: WorkshopSubstrate;
  readonly state: WorkshopState;
  readonly workdir: string;
  readonly brokers: readonly string[];
  readonly limitations: readonly string[];
  readonly display: boolean;
  readonly createdAt: string;
}

export type WorkshopChangeKind = "created" | "started" | "stopped" | "removed";

export interface WorkshopChange {
  readonly change: WorkshopChangeKind;
  readonly workshop: WorkshopView;
}

export interface WorkshopEgressRule {
  readonly host: string;
  readonly port?: number | undefined;
  readonly methods?: "any" | readonly string[] | undefined;
}

export interface WorkshopSpec {
  readonly creature: string;
  readonly substrate: WorkshopSubstrate;
  readonly template?: string | undefined;
  readonly disks?: { rootGb?: number | undefined; dockerGb?: number | undefined } | undefined;
  readonly cpus?: number | undefined;
  readonly memory?: string | undefined;
  readonly gpu?: boolean | undefined;
  readonly egress?: readonly WorkshopEgressRule[] | undefined;
  readonly brokers?: readonly string[] | undefined;
  readonly setup?: string | undefined;
}

export interface WorkshopHealthReport {
  readonly id: string;
  readonly substrate: WorkshopSubstrate;
  readonly health: WorkshopHealth;
  readonly limitations: readonly string[];
}

export interface WorkshopRemoval {
  readonly id: string;
  readonly keptDisk: boolean;
}

export type WorkshopRefusalKind =
  | "invalid"
  | "forbidden"
  | "missing"
  | "conflict"
  | "deferred"
  | "failed"
  | "unavailable";

export interface WorkshopRefusal {
  readonly refused: WorkshopRefusalKind;
  readonly error: string;
}

export interface WorkshopSubstrateSupport {
  readonly kind: WorkshopSubstrate;
  readonly supported: boolean;
  readonly version: string | null;
  readonly reason: string | null;
  readonly limitations: readonly string[];
}

export interface WorkshopSubstrateReport {
  readonly substrates: readonly WorkshopSubstrateSupport[];
  readonly preferred: WorkshopSubstrate | null;
}

export type WorkshopOperation =
  | "start"
  | "stop"
  | "health"
  | "remove"
  | "display"
  | "tools"
  | "detail"
  | "exec";

export interface WorkshopMeasured {
  readonly disk: { readonly usedBytes: number | null; readonly sizeBytes: number | null };
  readonly memory: { readonly usedBytes: number | null; readonly totalBytes: number | null };
  readonly unmeasured: readonly string[];
}

export interface WorkshopRefusalEntry {
  readonly at: string;
  readonly operation: WorkshopOperation;
  readonly refused: WorkshopRefusalKind;
  readonly error: string;
}

export interface WorkshopTerminalInput {
  readonly command: string;
  readonly cwd?: string | undefined;
  readonly timeoutMs?: number | undefined;
}

export type WorkshopTerminalOutcome =
  | { readonly code: number; readonly timedOut: boolean }
  | { readonly refused: WorkshopRefusalKind; readonly error: string };

export interface WorkshopTerminalEntry {
  readonly at: string;
  readonly tool: "bash";
  readonly origin: "keeper";
  readonly input: WorkshopTerminalInput;
  readonly outcome: WorkshopTerminalOutcome;
}

export interface WorkshopTerminalRun {
  readonly workshop: string;
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface WorkshopReach {
  readonly access: "direct" | "working-copy" | "none";
  readonly path: string | null;
  readonly returns: string;
}

export interface WorkshopDetail extends WorkshopView {
  readonly workspace?: WorkshopReach | undefined;
  readonly egress: {
    readonly policy: "deny-all" | "none";
    readonly enforced: boolean;
    readonly rules: readonly WorkshopEgressRule[];
    readonly brokerHosts: readonly string[];
  };
  readonly resources: {
    readonly cpus: number;
    readonly memory: string;
    readonly disks: { readonly rootGb: number; readonly dockerGb: number } | null;
    readonly measured: WorkshopMeasured;
  };
  readonly refusals: {
    readonly entries: readonly WorkshopRefusalEntry[];
    readonly unreported: string;
  };
  readonly terminal: {
    readonly allowed: boolean;
    readonly reason: string;
    readonly log: readonly WorkshopTerminalEntry[];
  };
}

export const workshopTerminalGrantAction = "workshop.exec";

export const workshopTerminalBody = ["command", "cwd", "timeoutMs"] as const;

export function isWorkshopRefusal(value: unknown): value is WorkshopRefusal {
  return typeof value === "object" && value !== null && "refused" in value;
}

export const workshopRoutes = [
  { method: "GET", path: "/workshops", operationId: "listWorkshops" },
  { method: "GET", path: "/workshops/substrates", operationId: "listWorkshopSubstrates" },
  { method: "POST", path: "/workshops", operationId: "createWorkshop" },
  { method: "GET", path: "/workshops/{id}", operationId: "readWorkshop" },
  { method: "POST", path: "/workshops/{id}/start", operationId: "startWorkshop" },
  { method: "POST", path: "/workshops/{id}/stop", operationId: "stopWorkshop" },
  { method: "GET", path: "/workshops/{id}/health", operationId: "workshopHealth" },
  { method: "POST", path: "/workshops/{id}/exec", operationId: "execInWorkshop" },
  { method: "DELETE", path: "/workshops/{id}", operationId: "removeWorkshop" },
  { method: "GET", path: "/workshops/{id}/display", operationId: "streamWorkshopDisplay" },
] as const;
