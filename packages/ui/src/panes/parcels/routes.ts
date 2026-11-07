import type { Fetch } from "@keywork-app/client";
import type { z } from "zod";
import {
  type AuditPage,
  type AuditRow,
  type AuditVerdict,
  auditPageSchema,
  type BegunPairing,
  begunPairingSchema,
  type Census,
  type ConfirmedHere,
  censusSchema,
  confirmedHereSchema,
  type Grant,
  type GrantDraft,
  type GrantList,
  grantListSchema,
  grantSchema,
  type Paired,
  type PairsReading,
  pairedSchema,
  pairsReadingSchema,
  type Revocation,
  revocationSchema,
} from "./wire.ts";

export interface MeshOperation {
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  readonly operationId: string;
  readonly since: "1.8" | "proposed";
}

export const meshOperations = {
  census: { method: "GET", path: "/mesh/peers", operationId: "listMeshPeers", since: "proposed" },
  pairs: { method: "GET", path: "/mesh/pairs", operationId: "listMeshPairs", since: "1.8" },
  beginPairing: {
    method: "POST",
    path: "/mesh/pairs",
    operationId: "beginMeshPairing",
    since: "1.8",
  },
  completePairing: {
    method: "POST",
    path: "/mesh/pairs/{id}/complete",
    operationId: "completeMeshPairing",
    since: "1.8",
  },
  confirmHere: {
    method: "POST",
    path: "/mesh/pairings/{id}/confirm",
    operationId: "confirmMeshPairingHere",
    since: "1.8",
  },
  unpair: {
    method: "DELETE",
    path: "/mesh/pairs/{id}",
    operationId: "removeMeshPair",
    since: "1.8",
  },
  grants: { method: "GET", path: "/mesh/grants", operationId: "listMeshGrants", since: "1.8" },
  issueGrant: {
    method: "POST",
    path: "/mesh/grants",
    operationId: "issueMeshGrant",
    since: "1.8",
  },
  revokeGrant: {
    method: "DELETE",
    path: "/mesh/grants/{id}",
    operationId: "revokeMeshGrant",
    since: "1.8",
  },
  audit: { method: "GET", path: "/mesh/audit", operationId: "meshAudit", since: "1.8" },
} as const satisfies Readonly<Record<string, MeshOperation>>;

export type MeshReply<T> = { ok: true; value: T } | { ok: false; status: number; detail: string };

export interface PairingTarget {
  endpoint: string;
  stableId: string;
  userId: string | null;
  tags: readonly string[];
}

export interface Completion {
  matches: boolean;
  claimCode?: string | undefined;
}

export interface MeshRoutes {
  census(): Promise<MeshReply<Census>>;
  pairs(): Promise<MeshReply<PairsReading>>;
  grants(): Promise<MeshReply<GrantList>>;
  audit(after?: string): Promise<MeshReply<AuditPage>>;
  beginPairing(target: PairingTarget): Promise<MeshReply<BegunPairing>>;
  completePairing(attemptId: string, completion: Completion): Promise<MeshReply<Paired>>;
  confirmHere(pairingId: string, sas: string): Promise<MeshReply<ConfirmedHere>>;
  unpair(pairId: string): Promise<MeshReply<Revocation>>;
  issueGrant(draft: GrantDraft): Promise<MeshReply<Grant>>;
  revokeGrant(grantId: string): Promise<MeshReply<Revocation>>;
}

export const auditPageLimit = 500;

export function meshRoutesOver(fetch: Fetch): MeshRoutes {
  const call = callerOver(fetch);
  return {
    census: () => call(meshOperations.census, censusSchema),
    pairs: () => call(meshOperations.pairs, pairsReadingSchema),
    grants: () => call(meshOperations.grants, grantListSchema),
    audit: (after) =>
      call(meshOperations.audit, auditPageSchema, {
        query: { ...(after !== undefined && { after }), limit: String(auditPageLimit) },
      }),
    beginPairing: (target) =>
      call(meshOperations.beginPairing, begunPairingSchema, {
        body: { ...target, tags: [...target.tags], role: "console" },
      }),
    completePairing: (attemptId, completion) =>
      call(meshOperations.completePairing, pairedSchema, {
        id: attemptId,
        body: {
          matches: completion.matches,
          ...(completion.claimCode !== undefined && { claimCode: completion.claimCode }),
        },
      }),
    confirmHere: (pairingId, sas) =>
      call(meshOperations.confirmHere, confirmedHereSchema, { id: pairingId, body: { sas } }),
    unpair: (pairId) => call(meshOperations.unpair, revocationSchema, { id: pairId }),
    issueGrant: (draft) => call(meshOperations.issueGrant, grantSchema, { body: draft }),
    revokeGrant: (grantId) => call(meshOperations.revokeGrant, revocationSchema, { id: grantId }),
  };
}

export function isUnserved(reply: MeshReply<unknown>): boolean {
  return !reply.ok && (reply.status === 404 || reply.status === 503);
}

export interface AuditTrail {
  readonly rows: readonly AuditRow[];
  readonly chain: AuditVerdict | undefined;
}

export const emptyTrail: AuditTrail = { rows: [], chain: undefined };
export const keptAuditRows = 1000;
export const maxAuditPages = 20;

export async function followAudit(
  routes: Pick<MeshRoutes, "audit">,
  held: AuditTrail,
): Promise<MeshReply<AuditTrail>> {
  let trail = held;
  for (let page = 0; page < maxAuditPages; page += 1) {
    const reply = await routes.audit(trail.rows.at(-1)?.hash);
    if (!reply.ok) return reply;
    trail = { rows: appended(trail.rows, reply.value.rows), chain: reply.value.chain };
    if (reply.value.rows.length < auditPageLimit) break;
  }
  return { ok: true, value: trail };
}

function appended(held: readonly AuditRow[], page: readonly AuditRow[]): AuditRow[] {
  const seen = new Set(held.map((row) => row.hash));
  return [...held, ...page.filter((row) => !seen.has(row.hash))].slice(-keptAuditRows);
}

interface CallOptions {
  id?: string | undefined;
  query?: Readonly<Record<string, string>> | undefined;
  body?: unknown;
}

function callerOver(fetch: Fetch) {
  return async <Schema extends z.ZodType>(
    operation: MeshOperation,
    schema: Schema,
    options: CallOptions = {},
  ): Promise<MeshReply<z.output<Schema>>> => {
    let response: Response;
    try {
      response = await fetch(urlOf(operation, options), requestOf(operation, options));
    } catch (cause) {
      return {
        ok: false,
        status: 0,
        detail: cause instanceof Error ? cause.message : String(cause),
      };
    }
    const body = await bodyOf(response);
    if (!response.ok)
      return { ok: false, status: response.status, detail: refusalOf(response, body) };
    const parsed = schema.safeParse(body);
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, status: response.status, detail: unreadable(operation) };
  };
}

function urlOf(operation: MeshOperation, options: CallOptions): string {
  const path = operation.path.replace("{id}", encodeURIComponent(options.id ?? ""));
  const query = new URLSearchParams(options.query ?? {}).toString();
  return query === "" ? path : `${path}?${query}`;
}

function requestOf(operation: MeshOperation, options: CallOptions): RequestInit {
  if (options.body === undefined) return { method: operation.method };
  return {
    method: operation.method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(options.body),
  };
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text());
  } catch {
    return undefined;
  }
}

function refusalOf(response: Response, body: unknown): string {
  const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const said = [fields.error, fields.detail, fields.reason, fields.failed].find(
    (value): value is string => typeof value === "string" && value !== "",
  );
  return said ?? `the node answered ${response.status} ${response.statusText}`.trim();
}

function unreadable(operation: MeshOperation): string {
  return `${operation.operationId} answered in a shape this console does not read`;
}
