import type { ToolCallPart } from "./events.ts";
import type { PermissionRule } from "./permissions.ts";

export type ListenerIdleReason =
  | "not-running"
  | "userspace-networking"
  | "no-local-tailnet-address"
  | "funnel-enabled";

export type UnbindReason = ListenerIdleReason | "address-gone" | "closed";

export type MeshListenerChange =
  | { change: "bound"; address: string; port: number }
  | { change: "unbound"; address: string; reason: UnbindReason }
  | { change: "bind-failed"; address: string; error: string }
  | { change: "idle"; reason: ListenerIdleReason }
  | { change: "status-failed"; error: string }
  | { change: "serve-warning"; message: string };

export type PairRole = "console" | "node";

export type PeerRole = PairRole | "target";

export type PairingConfirmation = "on-device" | "claim-code" | "endorsement";

export type PairingPhase = "identified" | "confirming" | "stored" | "aborted";

export type HelloRefusal =
  | "not-the-owner"
  | "other-tailnet"
  | "needs-a-human"
  | "unclaimed-needs-a-console";

export type PairingAbortReason =
  | "out-of-order"
  | "caller-changed"
  | "commitment-mismatch"
  | "sas-mismatch"
  | "bad-proof"
  | "bad-claim-code"
  | "wrong-confirmation"
  | "expired"
  | "cancelled";

export interface PendingPairing {
  pairingId: string;
  peerStableId: string;
  peerUserId: string | null;
  role: PairRole;
  caps: readonly string[];
  confirmation: PairingConfirmation;
  phase: PairingPhase;
  sas: string | null;
  expiresAt: string;
}

export type MeshPairingChange =
  | { change: "started"; pairing: PendingPairing }
  | { change: "confirming"; pairing: PendingPairing }
  | { change: "refused"; peerStableId: string; reason: HelloRefusal }
  | { change: "aborted"; pairingId: string; reason: PairingAbortReason };

export interface PairRecord {
  id: string;
  peerStableId: string;
  peerUserId: string | null;
  peerTags: readonly string[];
  peerDeviceKey: string;
  role: PeerRole;
  caps: readonly string[];
  endpoint: string | null;
  createdAt: string;
  confirmedBy: PairingConfirmation;
}

export type PairRemoval = "keeper" | "revocation";

export type MeshPairChange =
  | { change: "added"; pair: PairRecord }
  | { change: "removed"; pairId: string; peerStableId: string; by: PairRemoval };

export type MeshCap =
  | { kind: "files:read"; paths: readonly string[] }
  | { kind: "files:write"; paths: readonly string[] }
  | { kind: "exec"; commands: readonly string[] }
  | { kind: "screen:view" }
  | { kind: "screen:control" }
  | { kind: "clipboard" };

export type MeshCapKind = MeshCap["kind"];

export interface GrantSubject {
  creature: string;
  node: string;
}

export interface MeshGrant {
  id: string;
  issuer: string;
  subject: GrantSubject;
  target: string;
  caps: readonly MeshCap[];
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  signature: string;
}

export type GrantChainFailure =
  | "malformed"
  | "wrong-target"
  | "unknown-issuer"
  | "issuer-not-owner-console"
  | "bad-signature"
  | "not-yet-valid"
  | "expired"
  | "revoked"
  | "screen-control-too-long";

export type GrantRevoker = "keeper" | "revocation";

export type MeshGrantChange =
  | { change: "issued"; grant: MeshGrant }
  | { change: "installed"; grant: MeshGrant }
  | { change: "refused"; issuer: string; reason: GrantChainFailure }
  | { change: "revoked"; grantId: string; by: GrantRevoker };

export type RevocationKind = "grant" | "pair";

export interface MeshRevocation {
  kind: RevocationKind;
  id: string;
  issuer: string;
  target: string;
  revokedAt: string;
  nonce: string;
  signature: string;
}

export interface MeshRevocationChange {
  change: "undelivered";
  revocation: MeshRevocation;
  attempts: number;
  error: string;
}

export interface MeshOrigin {
  kind: "mesh";
  creature: string;
  node: string;
}

export interface MeshWalk {
  origin: MeshOrigin;
  grantId: string;
  call: ToolCallPart;
  rules: readonly PermissionRule[];
}

export interface MeshOwner {
  tailnetId: string;
  userId: string;
  claimedAt: string;
}

export type MeshClaimState = "unclaimed" | "claimed";

export interface MeshPairs {
  claim: MeshClaimState;
  owner: MeshOwner | null;
  pairs: readonly PairRecord[];
  pending: readonly PendingPairing[];
}

export interface PairingTarget {
  endpoint: string;
  stableId: string;
  role: PairRole;
  userId?: string | null | undefined;
  tags?: readonly string[] | undefined;
  caps?: readonly string[] | undefined;
}

export interface BegunPairing {
  attemptId: string;
  sas: string;
  confirmation: PairingConfirmation;
  expiresAt: string;
}

export interface PairingFailure {
  failed: string;
  detail: string;
}

export interface PairingCompletion {
  matches: boolean;
  claimCode?: string | undefined;
}

export type PairingResult = { paired: PairRecord } | PairingFailure;

export function isPairingFailure(value: unknown): value is PairingFailure {
  return typeof value === "object" && value !== null && "failed" in value;
}

export interface PairingConfirmedHere {
  state: string;
}

export interface MeshGrantDraft {
  subject: GrantSubject;
  target: string;
  caps: readonly MeshCap[];
  expiresAt: string;
}

export interface MeshGrantList {
  installed: readonly MeshGrant[];
  issued: readonly MeshGrant[];
}

export type AuditDecision = "allow" | "deny";

export interface MeshAuditRow {
  ts: string;
  actorStableID: string;
  actorUserID: string | null;
  actorTags: readonly string[];
  targetStableID: string;
  capability: string;
  requestDigest: string;
  decision: AuditDecision;
  reason: string;
  prevHash: string;
  hash: string;
}

export type MeshAuditVerdict =
  | { intact: true; head: string; rows: number }
  | { intact: false; index: number; reason: "prev-hash" | "hash" | "unreadable" };

export interface MeshAuditPage {
  rows: readonly MeshAuditRow[];
  chain: MeshAuditVerdict;
}

export type ScreenAuditScope = "view" | "control";

export interface ScreenAuditPeer {
  stableId: string;
  name: string;
  userId: string | null;
  loginName?: string | undefined;
  tags: readonly string[];
}

interface ScreenAuditGrant {
  sessionId: string;
  grantId: string;
  controlGrantId?: string | undefined;
  peer: ScreenAuditPeer;
  controller: "human" | "agent";
}

export type ScreenAuditRecord =
  | (ScreenAuditGrant & {
      kind: "control";
      decision: AuditDecision;
      reason: string;
      expiresAt?: string | undefined;
    })
  | (ScreenAuditGrant & {
      kind: "session";
      scopes: readonly ScreenAuditScope[];
      displays: readonly string[];
      path: string;
      startedAt?: string | undefined;
      endedAt: string;
      reason: string;
      inputs: { pointer: number; keys: number };
    });

export interface MeshAuditQuery {
  after?: string | undefined;
  limit?: number | undefined;
}

export interface MeshPeerUser {
  id: string;
  loginName: string;
  displayName: string;
}

export type MeshPathClass = "direct" | "peer-relay" | "derp" | "unknown";

export interface MeshPeer {
  stableId: string;
  machine: string;
  dnsName: string;
  os: string;
  addresses: readonly string[];
  tags: readonly string[];
  user: MeshPeerUser | null;
  online: boolean;
  active: boolean;
  candidate: boolean;
  path:
    | { kind: MeshPathClass; relay?: string | null | undefined }
    | Readonly<Record<string, unknown>>;
}

export interface MeshPeerLane {
  stableId: string;
  path: MeshPeer["path"];
}

export interface MeshPeersChange {
  change: "lanes";
  peers: readonly MeshPeerLane[];
}

export interface MeshDiscoveredPeer extends MeshPeer {
  node: Readonly<Record<string, unknown>> | null;
}

export interface MeshCensus {
  self: MeshPeer | null;
  peers: readonly MeshDiscoveredPeer[];
  policy?: Readonly<Record<string, unknown>> | undefined;
}

export type MeshOutboundPairing = Readonly<Record<string, unknown>>;

export interface MeshPairingsList {
  pairings: readonly MeshOutboundPairing[];
}

export const meshRoutes = [
  { method: "GET", path: "/mesh/peers", operationId: "listMeshPeers" },
  { method: "GET", path: "/mesh/pairings", operationId: "listMeshPairings" },
  { method: "GET", path: "/mesh/pairs", operationId: "listMeshPairs" },
  { method: "POST", path: "/mesh/pairs", operationId: "beginMeshPairing" },
  { method: "POST", path: "/mesh/pairs/{id}/complete", operationId: "completeMeshPairing" },
  { method: "POST", path: "/mesh/pairings/{id}/confirm", operationId: "confirmMeshPairingHere" },
  { method: "DELETE", path: "/mesh/pairs/{id}", operationId: "removeMeshPair" },
  { method: "GET", path: "/mesh/grants", operationId: "listMeshGrants" },
  { method: "POST", path: "/mesh/grants", operationId: "issueMeshGrant" },
  { method: "DELETE", path: "/mesh/grants/{id}", operationId: "revokeMeshGrant" },
  { method: "GET", path: "/mesh/audit", operationId: "meshAudit" },
  { method: "POST", path: "/mesh/screen/audit", operationId: "recordScreenAudit" },
  { method: "POST", path: "/mesh/messages", operationId: "sendCreatureMessage" },
  { method: "POST", path: "/mesh/messages/arrivals", operationId: "takeCreatureMessage" },
] as const;

export interface CreatureMessageDraft {
  from: string;
  to: string;
  node?: string | undefined;
  text: string;
  hop?: number | undefined;
}

export interface DeliveredCreatureMessage {
  id: string;
  from: string;
  to: string;
  node: string;
  machine: string;
  hop: number;
}

export interface CreatureMessageSent {
  delivered: DeliveredCreatureMessage;
}

export const creatureMessageBody = ["from", "to", "node", "text", "hop"] as const;
