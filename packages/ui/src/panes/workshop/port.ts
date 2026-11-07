import { type Fetch, sseFrames } from "@keywork-app/client";
import type { WorkshopDetail, WorkshopTerminalRun } from "@keywork-app/protocol";
import { z } from "zod";
import type { HostPort } from "../../host/port.ts";
import { hostFetch } from "../../host/transport.ts";

export const substrateKinds = ["sbx", "compose", "host"] as const;
export type SubstrateKind = (typeof substrateKinds)[number];

export const workshopStates = ["stopped", "running"] as const;
export type WorkshopState = (typeof workshopStates)[number];

export const workshopHealths = ["up", "starting", "unresponsive", "down"] as const;
export type WorkshopHealth = (typeof workshopHealths)[number];

export const workshopRecordSchema = z.object({
  id: z.string().min(1),
  creature: z.string().min(1),
  substrate: z.enum(substrateKinds),
  state: z.enum(workshopStates),
  workdir: z.string(),
  brokers: z.array(z.string()),
  limitations: z.array(z.string()),
  display: z.boolean(),
  createdAt: z.string(),
});

export type WorkshopRecord = z.output<typeof workshopRecordSchema>;

export const workshopChangeSchema = z.object({
  change: z.enum(["created", "started", "stopped", "removed"]),
  workshop: workshopRecordSchema,
});

export type WorkshopChange = z.output<typeof workshopChangeSchema>;

export const healthReportSchema = z.object({
  id: z.string(),
  substrate: z.enum(substrateKinds),
  health: z.enum(workshopHealths),
  limitations: z.array(z.string()),
});

export type WorkshopHealthReport = z.output<typeof healthReportSchema>;

const removalSchema = z.object({ id: z.string(), keptDisk: z.boolean() });

export type WorkshopRemoval = z.output<typeof removalSchema>;

export const wireRefusalKinds = [
  "invalid",
  "forbidden",
  "missing",
  "conflict",
  "deferred",
  "failed",
  "unavailable",
] as const;

export const workshopOperations = [
  "start",
  "stop",
  "health",
  "remove",
  "display",
  "tools",
  "detail",
  "exec",
] as const;

const egressRuleSchema = z.object({
  host: z.string(),
  port: z.number().optional(),
  methods: z.union([z.literal("any"), z.array(z.string())]).optional(),
});

const measuredSchema = z.object({
  disk: z.object({ usedBytes: z.number().nullable(), sizeBytes: z.number().nullable() }),
  memory: z.object({ usedBytes: z.number().nullable(), totalBytes: z.number().nullable() }),
  unmeasured: z.array(z.string()),
});

const terminalEntrySchema = z.object({
  at: z.string(),
  tool: z.literal("bash"),
  origin: z.literal("keeper"),
  input: z.object({
    command: z.string(),
    cwd: z.string().optional(),
    timeoutMs: z.number().optional(),
  }),
  outcome: z.union([
    z.object({ code: z.number(), timedOut: z.boolean() }),
    z.object({ refused: z.enum(wireRefusalKinds), error: z.string() }),
  ]),
});

export const workshopDetailSchema = workshopRecordSchema.extend({
  egress: z.object({
    policy: z.enum(["deny-all", "none"]),
    enforced: z.boolean(),
    rules: z.array(egressRuleSchema),
    brokerHosts: z.array(z.string()),
  }),
  resources: z.object({
    cpus: z.number(),
    memory: z.string(),
    disks: z.object({ rootGb: z.number(), dockerGb: z.number() }).nullable(),
    measured: measuredSchema,
  }),
  refusals: z.object({
    entries: z.array(
      z.object({
        at: z.string(),
        operation: z.enum(workshopOperations),
        refused: z.enum(wireRefusalKinds),
        error: z.string(),
      }),
    ),
    unreported: z.string(),
  }),
  terminal: z.object({
    allowed: z.boolean(),
    reason: z.string(),
    log: z.array(terminalEntrySchema),
  }),
});

export type WorkshopDetailRecord = z.output<typeof workshopDetailSchema>;
export type WorkshopTerminalEntry = WorkshopDetailRecord["terminal"]["log"][number];

const terminalRunSchema = z.object({
  workshop: z.string(),
  code: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  timedOut: z.boolean(),
});

export type TerminalRun = z.output<typeof terminalRunSchema>;

export const detailMatchesTheProtocol = (detail: WorkshopDetailRecord): WorkshopDetail => detail;
export const runMatchesTheProtocol = (run: TerminalRun): WorkshopTerminalRun => run;

export const refusalKinds = [
  "invalid",
  "forbidden",
  "missing",
  "conflict",
  "deferred",
  "unavailable",
  "failed",
  "unreachable",
  "malformed",
] as const;

export type RefusalKind = (typeof refusalKinds)[number];

export interface WorkshopRefusal {
  readonly refused: RefusalKind;
  readonly error: string;
}

export interface DisplayFrame {
  readonly png: string;
  readonly at: string;
}

export type DisplayEnd =
  | { readonly kind: "ended"; readonly detail: string | undefined }
  | { readonly kind: "refused"; readonly refusal: WorkshopRefusal };

export interface DisplayWatcher {
  onFrame(frame: DisplayFrame): void;
  onEnd(end: DisplayEnd): void;
}

export interface CreatureHome {
  readonly slug: string;
  readonly workshop: string;
}

export interface WorkshopPort {
  list(): Promise<readonly WorkshopRecord[] | WorkshopRefusal>;
  homes(): Promise<readonly CreatureHome[] | WorkshopRefusal>;
  raise(creature: string): Promise<WorkshopRecord | WorkshopRefusal>;
  start(id: string): Promise<WorkshopRecord | WorkshopRefusal>;
  stop(id: string): Promise<WorkshopRecord | WorkshopRefusal>;
  health(id: string): Promise<WorkshopHealthReport | WorkshopRefusal>;
  detail(id: string): Promise<WorkshopDetailRecord | WorkshopRefusal>;
  exec(id: string, command: string): Promise<TerminalRun | WorkshopRefusal>;
  remove(id: string, keepDisk: boolean): Promise<WorkshopRemoval | WorkshopRefusal>;
  watch(id: string, watcher: DisplayWatcher, signal: AbortSignal): void;
  served(): Promise<ReadonlySet<string>>;
}

export const displayFramesPerSecond = 1;

export const snapshotOperationPattern = /snapshot/i;

export function workshopPortOf(host: HostPort, workspace: string): WorkshopPort {
  return workshopPort(hostFetch(host, workspace));
}

export function workshopPort(fetch: Fetch): WorkshopPort {
  return {
    list: async () => {
      const listed = await request(fetch, "GET", "/workshops", listSchema);
      return isWorkshopRefusal(listed) ? listed : listed.workshops;
    },
    homes: async () => {
      const read = await request(fetch, "GET", "/creatures", creatureHomesSchema);
      return isWorkshopRefusal(read) ? read : read.creatures;
    },
    raise: (creature) => raiseSealedElseBare(fetch, creature),
    start: (id) => request(fetch, "POST", `${workshopPath(id)}/start`, workshopRecordSchema),
    stop: (id) => request(fetch, "POST", `${workshopPath(id)}/stop`, workshopRecordSchema),
    health: (id) => request(fetch, "GET", `${workshopPath(id)}/health`, healthReportSchema),
    detail: (id) => request(fetch, "GET", workshopPath(id), workshopDetailSchema),
    exec: (id, command) =>
      request(fetch, "POST", `${workshopPath(id)}/exec`, terminalRunSchema, { command }),
    remove: (id, keepDisk) =>
      request(fetch, "DELETE", `${workshopPath(id)}?keepDisk=${keepDisk}`, removalSchema),
    watch: (id, watcher, signal) => {
      void watchDisplay(fetch, id, watcher, signal);
    },
    served: () => servedOperations(fetch),
  };
}

export function isWorkshopRefusal(value: unknown): value is WorkshopRefusal {
  return (
    typeof value === "object" &&
    value !== null &&
    "refused" in value &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

export function workshopChangeOf(envelope: {
  readonly type: string;
  readonly payload: unknown;
}): WorkshopChange | undefined {
  if (envelope.type !== "workshop.changed") return undefined;
  const parsed = workshopChangeSchema.safeParse(envelope.payload);
  return parsed.success ? parsed.data : undefined;
}

export function servesSnapshots(operations: ReadonlySet<string>): boolean {
  return [...operations].some(
    (operation) => snapshotOperationPattern.test(operation) && /workshop/i.test(operation),
  );
}

const listSchema = z.object({ workshops: z.array(workshopRecordSchema) });

const creatureHomesSchema = z.object({
  creatures: z.array(z.object({ slug: z.string(), workshop: z.string() })),
});

const frameSchema = z.object({ png: z.string(), at: z.string() });

const endingSchema = z.object({ error: z.string().optional() });

const refusalBodySchema = z.object({
  refused: z.enum(refusalKinds).optional(),
  error: z.string(),
});

const refusalOfStatus: Readonly<Record<number, RefusalKind>> = {
  400: "invalid",
  403: "forbidden",
  404: "missing",
  409: "conflict",
  501: "deferred",
  502: "failed",
  503: "unavailable",
};

function workshopPath(id: string): string {
  return `/workshops/${encodeURIComponent(id)}`;
}

async function raiseSealedElseBare(
  fetch: Fetch,
  creature: string,
): Promise<WorkshopRecord | WorkshopRefusal> {
  const sealed = await raise(fetch, creature, "sbx");
  if (!isWorkshopRefusal(sealed) || sealed.refused !== "unavailable") return sealed;
  return raise(fetch, creature, "host");
}

function raise(
  fetch: Fetch,
  creature: string,
  substrate: SubstrateKind,
): Promise<WorkshopRecord | WorkshopRefusal> {
  return request(fetch, "POST", "/workshops", workshopRecordSchema, { creature, substrate });
}

async function request<Value>(
  fetch: Fetch,
  method: string,
  path: string,
  schema: z.ZodType<Value>,
  body?: unknown,
): Promise<Value | WorkshopRefusal> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      ...(body !== undefined && {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
  } catch (cause) {
    return unreachable(cause);
  }
  const answer = await jsonOf(response);
  if (!response.ok) return refusalOf(response.status, response.statusText, answer);
  const parsed = schema.safeParse(answer);
  return parsed.success
    ? parsed.data
    : {
        refused: "malformed",
        error: `the answer to ${method} ${path} is not in the shape expected`,
      };
}

async function watchDisplay(
  fetch: Fetch,
  id: string,
  watcher: DisplayWatcher,
  signal: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${workshopPath(id)}/display`, { method: "GET", signal });
  } catch (cause) {
    if (!signal.aborted) watcher.onEnd({ kind: "refused", refusal: unreachable(cause) });
    return;
  }
  if (!response.ok) {
    const refusal = refusalOf(response.status, response.statusText, await jsonOf(response));
    watcher.onEnd({ kind: "refused", refusal });
    return;
  }
  if (response.body === null) {
    watcher.onEnd({ kind: "ended", detail: "the node sent no stream" });
    return;
  }
  try {
    for await (const frame of sseFrames(response.body)) {
      if (signal.aborted) return;
      if (frame.event === "frame") {
        const parsed = frameSchema.safeParse(parseJson(frame.data));
        if (parsed.success) watcher.onFrame(parsed.data);
      } else if (frame.event === "ended") {
        watcher.onEnd({ kind: "ended", detail: endingDetail(frame.data) });
        return;
      }
    }
  } catch (cause) {
    if (!signal.aborted) watcher.onEnd({ kind: "ended", detail: messageOf(cause) });
    return;
  }
  if (!signal.aborted) watcher.onEnd({ kind: "ended", detail: undefined });
}

async function servedOperations(fetch: Fetch): Promise<ReadonlySet<string>> {
  const operations = new Set<string>();
  try {
    const response = await fetch("/doc", { method: "GET" });
    if (response.ok) collectOperationIds(await jsonOf(response), operations);
  } catch {}
  return operations;
}

function collectOperationIds(value: unknown, into: Set<string>): void {
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "operationId" && typeof child === "string") into.add(child);
    else collectOperationIds(child, into);
  }
}

function refusalOf(status: number, statusText: string, answer: unknown): WorkshopRefusal {
  const kind = refusalOfStatus[status] ?? "failed";
  const parsed = refusalBodySchema.safeParse(answer);
  if (parsed.success) return { refused: parsed.data.refused ?? kind, error: parsed.data.error };
  return { refused: kind, error: `${status} ${statusText}`.trim() };
}

function unreachable(cause: unknown): WorkshopRefusal {
  return { refused: "unreachable", error: messageOf(cause) };
}

function endingDetail(data: string): string | undefined {
  const parsed = endingSchema.safeParse(parseJson(data));
  return parsed.success ? parsed.data.error : undefined;
}

async function jsonOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
