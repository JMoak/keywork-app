import { z } from "zod";
import { pathClasses } from "./media.ts";
import { endReason, type PeerIdentity, peerIdentitySchema, screenScopes } from "./messages.ts";

const at = z.iso.datetime();
const sessionId = z.string().min(1);
const grantId = z.string().min(1);
const pathClass = z.enum(pathClasses);

export const sessionLogRowSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("requested"),
    at,
    sessionId,
    peer: peerIdentitySchema,
    scope: z.enum(screenScopes),
  }),
  z.object({
    kind: z.literal("decided"),
    at,
    sessionId,
    verdict: z.enum(["granted", "denied"]),
    grantId: grantId.optional(),
    reason: z.string().optional(),
    expiresAt: at.optional(),
  }),
  z.object({
    kind: z.literal("started"),
    at,
    sessionId,
    grantId,
    displays: z.array(z.string()),
    path: pathClass,
    preset: z.string(),
  }),
  z.object({ kind: z.literal("path"), at, sessionId, grantId, path: pathClass }),
  z.object({ kind: z.literal("switched"), at, sessionId, grantId, displayId: z.string() }),
  z.object({
    kind: z.literal("reconfirmed"),
    at,
    sessionId,
    grantId,
    answer: z.enum(["allow", "view-only", "decline", "timed-out"]),
  }),
  z.object({
    kind: z.literal("control"),
    at,
    sessionId,
    grantId,
    controlGrantId: grantId.optional(),
    state: z.enum(["granted", "refused", "paused", "resumed", "revoked"]),
    reason: z.string(),
    expiresAt: at.optional(),
  }),
  z.object({
    kind: z.literal("ended"),
    at,
    sessionId,
    grantId: grantId.optional(),
    reason: endReason,
    scopes: z.array(z.enum(screenScopes)).optional(),
    inputs: z.object({ pointer: z.number().int(), keys: z.number().int() }),
    clipboardBytes: z.object({ in: z.number().int(), out: z.number().int() }),
  }),
  z.object({ kind: z.literal("kill-switch"), at, chord: z.string(), registered: z.boolean() }),
]);

export type SessionLogRow = z.output<typeof sessionLogRowSchema>;

export interface SessionSummary {
  readonly sessionId: string;
  readonly peer?: PeerIdentity | undefined;
  readonly requestedAt: string;
  readonly verdict?: "granted" | "denied" | undefined;
  readonly deniedBecause?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly endedAt?: string | undefined;
  readonly endReason?: string | undefined;
  readonly displays: readonly string[];
  readonly path?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly controlled?: boolean | undefined;
}

export function logLine(row: SessionLogRow): string {
  return `${JSON.stringify(sessionLogRowSchema.parse(row))}\n`;
}

export function parseLog(text: string): SessionLogRow[] {
  return text.split("\n").flatMap((line) => {
    if (line.trim() === "") return [];
    try {
      const parsed = sessionLogRowSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
}

export function sessionSummaries(rows: readonly SessionLogRow[]): SessionSummary[] {
  const summaries = new Map<string, SessionSummary>();
  for (const row of rows) {
    if (row.kind === "kill-switch") continue;
    const prior = summaries.get(row.sessionId) ?? {
      sessionId: row.sessionId,
      requestedAt: row.at,
      displays: [],
    };
    summaries.set(row.sessionId, fold(prior, row));
  }
  return [...summaries.values()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

function fold(
  summary: SessionSummary,
  row: Exclude<SessionLogRow, { kind: "kill-switch" }>,
): SessionSummary {
  switch (row.kind) {
    case "requested":
      return { ...summary, peer: row.peer, requestedAt: row.at };
    case "decided":
      return { ...summary, verdict: row.verdict, deniedBecause: row.reason };
    case "started":
      return { ...summary, startedAt: row.at, displays: row.displays, path: row.path };
    case "path":
      return { ...summary, path: row.path };
    case "switched":
      return { ...summary, displays: [...new Set([...summary.displays, row.displayId])] };
    case "reconfirmed":
      return summary;
    case "control":
      return row.state === "granted" ? { ...summary, controlled: true } : summary;
    case "ended":
      return {
        ...summary,
        endedAt: row.at,
        endReason: row.reason,
        durationMs:
          summary.startedAt === undefined
            ? undefined
            : Date.parse(row.at) - Date.parse(summary.startedAt),
      };
  }
}
