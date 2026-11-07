import { z } from "zod";

export const capKinds = [
  "files:read",
  "files:write",
  "exec",
  "screen:view",
  "screen:control",
  "clipboard",
] as const;

export type CapKind = (typeof capKinds)[number];

export const capSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("files:read"), paths: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("files:write"), paths: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("exec"), commands: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal("screen:view") }),
  z.object({ kind: z.literal("screen:control") }),
  z.object({ kind: z.literal("clipboard") }),
]);

export type Cap = z.output<typeof capSchema>;

export const grantSchema = z.object({
  id: z.string(),
  issuer: z.string(),
  subject: z.object({ creature: z.string(), node: z.string() }),
  target: z.string(),
  caps: z.array(capSchema),
  issuedAt: z.string(),
  expiresAt: z.string(),
});

export type Grant = z.output<typeof grantSchema>;

export const grantListSchema = z.object({
  issued: z.array(grantSchema),
  installed: z.array(grantSchema),
});

export type GrantList = z.output<typeof grantListSchema>;

export interface GrantDraft {
  subject: { creature: string; node: string };
  target: string;
  caps: Cap[];
  expiresAt: string;
}

export const confirmations = ["on-device", "claim-code", "endorsement"] as const;

export type Confirmation = (typeof confirmations)[number];

export const pairRecordSchema = z.object({
  id: z.string(),
  peerStableId: z.string(),
  peerUserId: z.string().nullable(),
  peerTags: z.array(z.string()),
  role: z.enum(["console", "node", "target"]),
  caps: z.array(z.string()),
  endpoint: z.string().nullable(),
  createdAt: z.string(),
  confirmedBy: z.enum(confirmations),
});

export type PairRecord = z.output<typeof pairRecordSchema>;

export const pendingPairingSchema = z.object({
  pairingId: z.string(),
  peerStableId: z.string(),
  peerUserId: z.string().nullable(),
  role: z.enum(["console", "node"]),
  caps: z.array(z.string()),
  confirmation: z.enum(confirmations),
  phase: z.enum(["identified", "confirming", "stored", "aborted"]),
  sas: z.string().nullable(),
  expiresAt: z.string(),
});

export type PendingPairing = z.output<typeof pendingPairingSchema>;

export const pairsReadingSchema = z.object({
  claim: z.enum(["unclaimed", "claimed"]),
  owner: z.object({ tailnetId: z.string(), userId: z.string(), claimedAt: z.string() }).nullable(),
  pairs: z.array(pairRecordSchema),
  pending: z.array(pendingPairingSchema),
});

export type PairsReading = z.output<typeof pairsReadingSchema>;

export const begunPairingSchema = z.object({
  attemptId: z.string(),
  sas: z.string(),
  confirmation: z.enum(confirmations),
  expiresAt: z.string(),
});

export type BegunPairing = z.output<typeof begunPairingSchema>;

export const pairedSchema = z.object({ paired: pairRecordSchema });

export type Paired = z.output<typeof pairedSchema>;

export const confirmedHereSchema = z.object({
  state: z.enum(["confirming", "awaiting-target", "paired", "aborted"]),
});

export type ConfirmedHere = z.output<typeof confirmedHereSchema>;

export const revocationSchema = z.object({
  kind: z.enum(["grant", "pair"]),
  id: z.string(),
  target: z.string(),
  revokedAt: z.string(),
});

export type Revocation = z.output<typeof revocationSchema>;

export const auditRowSchema = z.object({
  ts: z.string(),
  actorStableID: z.string(),
  actorUserID: z.string().nullable(),
  actorTags: z.array(z.string()),
  targetStableID: z.string(),
  capability: z.string(),
  requestDigest: z.string(),
  decision: z.enum(["allow", "deny"]),
  reason: z.string(),
  prevHash: z.string(),
  hash: z.string(),
});

export type AuditRow = z.output<typeof auditRowSchema>;

export const auditVerdictSchema = z.union([
  z.object({ intact: z.literal(true), head: z.string(), rows: z.number() }),
  z.object({
    intact: z.literal(false),
    index: z.number(),
    reason: z.enum(["prev-hash", "hash", "unreadable"]),
  }),
]);

export type AuditVerdict = z.output<typeof auditVerdictSchema>;

export const auditPageSchema = z.object({
  rows: z.array(auditRowSchema),
  chain: auditVerdictSchema,
});

export type AuditPage = z.output<typeof auditPageSchema>;

export const meshPathSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("direct"), endpoint: z.string() }),
  z.object({ kind: z.literal("peer-relay"), relay: z.string() }),
  z.object({ kind: z.literal("derp"), region: z.string() }),
  z.object({ kind: z.literal("offline") }),
  z.object({ kind: z.literal("unknown") }),
]);

export type MeshPath = z.output<typeof meshPathSchema>;

export const peerLaneSchema = z.object({ stableId: z.string(), path: meshPathSchema });

export type PeerLane = z.output<typeof peerLaneSchema>;

export const peersChangeSchema = z.object({
  change: z.literal("lanes"),
  peers: z.array(peerLaneSchema),
});

export const manifestRoles = ["console", "host", "reachable"] as const;

export const censusPeerSchema = z.object({
  stableId: z.string(),
  machine: z.string(),
  os: z.string(),
  addresses: z.array(z.string()),
  tags: z.array(z.string()),
  user: z.object({ id: z.string(), loginName: z.string(), displayName: z.string() }).nullable(),
  online: z.boolean(),
  path: meshPathSchema,
  node: z
    .object({ product: z.string(), version: z.string(), pairing: z.enum(["unclaimed", "claimed"]) })
    .nullable(),
  manifest: z.object({ roles: z.array(z.enum(manifestRoles)) }).nullish(),
  endpoint: z.string().nullish(),
});

export type CensusPeer = z.output<typeof censusPeerSchema>;

export const policyHealthSchema = z.object({
  checkedAt: z.string(),
  findings: z.array(z.string()),
});

export type PolicyHealth = z.output<typeof policyHealthSchema>;

export const censusSchema = z.object({
  self: censusPeerSchema.nullish(),
  peers: z.array(censusPeerSchema),
  policy: policyHealthSchema.nullish(),
});

export type Census = z.output<typeof censusSchema>;

export const meshEventTypes = [
  "mesh.listener",
  "mesh.peers",
  "mesh.pairing",
  "mesh.pair",
  "mesh.grant",
  "mesh.revocation",
  "mesh.walked",
] as const;

export type MeshEventType = (typeof meshEventTypes)[number];

export const listenerChangeSchema = z.discriminatedUnion("change", [
  z.object({ change: z.literal("bound"), address: z.string(), port: z.number() }),
  z.object({ change: z.literal("unbound"), address: z.string(), reason: z.string() }),
  z.object({ change: z.literal("bind-failed"), address: z.string(), error: z.string() }),
  z.object({ change: z.literal("idle"), reason: z.string() }),
  z.object({ change: z.literal("status-failed"), error: z.string() }),
  z.object({ change: z.literal("serve-warning"), message: z.string() }),
]);

export type ListenerChange = z.output<typeof listenerChangeSchema>;

export const revocationUndeliveredSchema = z.object({
  change: z.literal("undelivered"),
  revocation: z.object({ kind: z.enum(["grant", "pair"]), id: z.string(), target: z.string() }),
  attempts: z.number(),
  error: z.string(),
});

export type RevocationUndelivered = z.output<typeof revocationUndeliveredSchema>;
