import type { PairingTarget } from "./routes.ts";
import {
  type AuditRow,
  type BegunPairing,
  type Census,
  type CensusPeer,
  type Grant,
  type GrantList,
  type ListenerChange,
  listenerChangeSchema,
  type MeshEventType,
  type MeshPath,
  type manifestRoles,
  meshEventTypes,
  type PairRecord,
  type PairsReading,
  type PeerLane,
  type PendingPairing,
  peersChangeSchema,
  type RevocationUndelivered,
  revocationUndeliveredSchema,
} from "./wire.ts";

export type ParcelRole = "house" | "host" | "pasture";

export const parcelRoles: readonly ParcelRole[] = ["house", "host", "pasture"];

export type Lane = MeshPath | { kind: "here" } | { kind: "unlisted" };

export interface OutboundAttempt extends BegunPairing {
  readonly peer: string;
}

export type ParcelPairing =
  | { kind: "here"; claim: PairsReading["claim"] | undefined }
  | { kind: "paired"; pair: PairRecord }
  | { kind: "pairing-out"; attempt: OutboundAttempt }
  | { kind: "pairing-in"; pending: PendingPairing }
  | { kind: "unpaired"; claimed: boolean }
  | { kind: "no-node" }
  | { kind: "unlisted" };

export interface ParcelRow {
  readonly id: string;
  readonly here: boolean;
  readonly machine: string;
  readonly who: string | undefined;
  readonly os: string | undefined;
  readonly online: boolean;
  readonly lane: Lane;
  readonly pairing: ParcelPairing;
  readonly roles: readonly ParcelRole[];
  readonly gates: readonly Grant[];
  readonly audit: readonly AuditRow[];
  readonly target: PairingTarget | undefined;
}

export interface ParcelSources {
  readonly census: Census | undefined;
  readonly pairs: PairsReading | undefined;
  readonly grants: GrantList | undefined;
  readonly audit: readonly AuditRow[];
  readonly attempts: readonly OutboundAttempt[];
  readonly now: number;
}

export interface ParcelTally {
  readonly parcels: number;
  readonly paired: number;
  readonly pairing: number;
  readonly gates: number;
}

export const defaultMeshPort = 47800;

export function parcelRows(sources: ParcelSources): ParcelRow[] {
  const self = sources.census?.self ?? undefined;
  const peers = [...(sources.census?.peers ?? [])].sort((a, b) =>
    a.machine.localeCompare(b.machine),
  );
  const listed = [...(self === undefined ? [] : [self]), ...peers];
  const known = new Set(listed.map((peer) => peer.stableId));
  const unlisted = [...new Set(mentionedIds(sources))].filter((id) => !known.has(id)).sort();
  return [
    ...listed.map((peer) => listedRow(peer, peer === self, sources)),
    ...unlisted.map((id) => unlistedRow(id, sources)),
  ];
}

export function tallyOf(rows: readonly ParcelRow[], now: number): ParcelTally {
  return {
    parcels: rows.length,
    paired: rows.filter((row) => row.pairing.kind === "paired").length,
    pairing: rows.filter((row) => isPairing(row.pairing)).length,
    gates: rows.reduce(
      (open, row) => open + row.gates.filter((gate) => isOpen(gate, now)).length,
      0,
    ),
  };
}

export function isPairing(
  pairing: ParcelPairing,
): pairing is Extract<ParcelPairing, { kind: "pairing-out" | "pairing-in" }> {
  return pairing.kind === "pairing-out" || pairing.kind === "pairing-in";
}

export function isOpen(gate: Pick<Grant, "expiresAt">, now: number): boolean {
  return Date.parse(gate.expiresAt) > now;
}

export function isRelayed(lane: Lane): boolean {
  return lane.kind === "derp" || lane.kind === "peer-relay";
}

export function machineNames(rows: readonly ParcelRow[]): ReadonlyMap<string, string> {
  return new Map(rows.map((row) => [row.id, row.machine]));
}

export function selfIdOf(rows: readonly ParcelRow[]): string | undefined {
  return rows.find((row) => row.here)?.id;
}

export function endpointOf(peer: Pick<CensusPeer, "addresses" | "endpoint">): string | undefined {
  if (peer.endpoint !== undefined && peer.endpoint !== null) return peer.endpoint;
  const address = peer.addresses.find(isIpv4) ?? peer.addresses[0];
  if (address === undefined) return undefined;
  const host = isIpv4(address) ? address : `[${address}]`;
  return `http://${host}:${defaultMeshPort}`;
}

export interface ListenerState {
  readonly bound: Readonly<Record<string, number>>;
  readonly idle: string | undefined;
  readonly unreadable: string | undefined;
  readonly warning: string | undefined;
}

export const quietListener: ListenerState = {
  bound: {},
  idle: undefined,
  unreadable: undefined,
  warning: undefined,
};

export function listenerAfter(state: ListenerState, change: ListenerChange): ListenerState {
  switch (change.change) {
    case "bound":
      return {
        ...state,
        bound: { ...state.bound, [change.address]: change.port },
        idle: undefined,
        unreadable: undefined,
      };
    case "unbound":
      return { ...state, bound: withoutKey(state.bound, change.address) };
    case "bind-failed":
      return { ...state, bound: withoutKey(state.bound, change.address) };
    case "idle":
      return { ...state, bound: {}, idle: change.reason };
    case "status-failed":
      return { ...state, unreadable: change.error };
    case "serve-warning":
      return { ...state, warning: change.message };
  }
}

export type Reading = "census" | "pairs" | "grants" | "audit";

export interface MeshNews {
  readonly stale: ReadonlySet<Reading>;
  readonly listener: readonly ListenerChange[];
  readonly undelivered: readonly RevocationUndelivered[];
  readonly lanes: readonly PeerLane[];
}

export interface MeshEnvelope {
  readonly type: string;
  readonly payload: unknown;
}

export function meshNewsOf(envelopes: readonly MeshEnvelope[]): MeshNews {
  const stale = new Set<Reading>();
  const listener: ListenerChange[] = [];
  const undelivered: RevocationUndelivered[] = [];
  const lanes: PeerLane[] = [];
  for (const envelope of envelopes) {
    if (!isMeshEvent(envelope.type)) continue;
    for (const reading of readingsStaledBy[envelope.type]) stale.add(reading);
    if (envelope.type === "mesh.listener") {
      const change = listenerChangeSchema.safeParse(envelope.payload);
      if (change.success) listener.push(change.data);
    }
    if (envelope.type === "mesh.revocation") {
      const missed = revocationUndeliveredSchema.safeParse(envelope.payload);
      if (missed.success) undelivered.push(missed.data);
    }
    if (envelope.type === "mesh.peers") {
      const moved = peersChangeSchema.safeParse(envelope.payload);
      if (moved.success) lanes.push(...moved.data.peers);
    }
  }
  return { stale, listener, undelivered, lanes };
}

export function censusWithLanes(
  census: Census | undefined,
  lanes: readonly PeerLane[],
): Census | undefined {
  if (census === undefined) return undefined;
  const moved = new Map(lanes.map((lane) => [lane.stableId, lane.path]));
  return {
    ...census,
    peers: census.peers.map((peer) => {
      const path = moved.get(peer.stableId);
      return path === undefined ? peer : { ...peer, path, online: path.kind !== "offline" };
    }),
  };
}

export interface LaneTap {
  close(): readonly PeerLane[];
}

export interface LanesHeard {
  open(): LaneTap;
  hear(lanes: readonly PeerLane[]): void;
}

export function lanesHeardWhileReading(): LanesHeard {
  const taps = new Set<PeerLane[]>();
  return {
    open: () => {
      const heard: PeerLane[] = [];
      taps.add(heard);
      return {
        close: () => {
          taps.delete(heard);
          return heard;
        },
      };
    },
    hear: (lanes) => {
      for (const heard of taps) heard.push(...lanes);
    },
  };
}

const readingsStaledBy: Readonly<Record<MeshEventType, readonly Reading[]>> = {
  "mesh.listener": [],
  "mesh.peers": [],
  "mesh.pairing": ["pairs", "audit"],
  "mesh.pair": ["census", "pairs", "audit"],
  "mesh.grant": ["grants", "audit"],
  "mesh.revocation": [],
  "mesh.walked": ["audit"],
};

function isMeshEvent(type: string): type is MeshEventType {
  return (meshEventTypes as readonly string[]).includes(type);
}

function listedRow(peer: CensusPeer, here: boolean, sources: ParcelSources): ParcelRow {
  const pairing = here
    ? ({ kind: "here", claim: sources.pairs?.claim } as const)
    : pairingOf(peer.stableId, sources, peerPairing(peer));
  return {
    id: peer.stableId,
    here,
    machine: peer.machine,
    who: peer.user?.displayName ?? tagsWho(peer.tags),
    os: peer.os,
    online: here || peer.online,
    lane: here ? { kind: "here" } : peer.path,
    pairing,
    roles: rolesOf(peer, here, pairing),
    gates: gatesOn(peer.stableId, sources),
    audit: auditOf(peer.stableId, sources),
    target: here || peer.node === null ? undefined : targetOf(peer),
  };
}

function unlistedRow(id: string, sources: ParcelSources): ParcelRow {
  const pairing = pairingOf(id, sources, { kind: "unlisted" });
  const tags = pairing.kind === "paired" ? pairing.pair.peerTags : [];
  return {
    id,
    here: false,
    machine: id,
    who: tagsWho(tags),
    os: undefined,
    online: false,
    lane: { kind: "unlisted" },
    pairing,
    roles: pairing.kind === "paired" && pairing.pair.role === "console" ? ["house"] : [],
    gates: gatesOn(id, sources),
    audit: auditOf(id, sources),
    target: undefined,
  };
}

function pairingOf(id: string, sources: ParcelSources, otherwise: ParcelPairing): ParcelPairing {
  const attempt = sources.attempts.find(
    (candidate) => candidate.peer === id && Date.parse(candidate.expiresAt) > sources.now,
  );
  if (attempt !== undefined) return { kind: "pairing-out", attempt };
  const pending = sources.pairs?.pending.find(
    (candidate) =>
      candidate.peerStableId === id &&
      (candidate.phase === "identified" || candidate.phase === "confirming") &&
      Date.parse(candidate.expiresAt) > sources.now,
  );
  if (pending !== undefined) return { kind: "pairing-in", pending };
  const pair = sources.pairs?.pairs.find((candidate) => candidate.peerStableId === id);
  if (pair !== undefined) return { kind: "paired", pair };
  return otherwise;
}

function peerPairing(peer: CensusPeer): ParcelPairing {
  if (peer.node === null) return { kind: "no-node" };
  return { kind: "unpaired", claimed: peer.node.pairing === "claimed" };
}

const roleOfManifest: Readonly<Record<(typeof manifestRoles)[number], ParcelRole>> = {
  console: "house",
  host: "host",
  reachable: "pasture",
};

function rolesOf(peer: CensusPeer, here: boolean, pairing: ParcelPairing): ParcelRole[] {
  const declared = (peer.manifest?.roles ?? []).map((role) => roleOfManifest[role]);
  const console = here || (pairing.kind === "paired" && pairing.pair.role === "console");
  const held = new Set<ParcelRole>([...declared, ...(console ? (["house"] as const) : [])]);
  return parcelRoles.filter((role) => held.has(role));
}

function gatesOn(id: string, sources: ParcelSources): Grant[] {
  const grants = [...(sources.grants?.issued ?? []), ...(sources.grants?.installed ?? [])];
  return grants
    .filter((grant) => grant.target === id)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.id.localeCompare(b.id));
}

function auditOf(id: string, sources: ParcelSources): AuditRow[] {
  return sources.audit
    .filter((row) => row.actorStableID === id || row.targetStableID === id)
    .reverse();
}

function targetOf(peer: CensusPeer): PairingTarget | undefined {
  const endpoint = endpointOf(peer);
  if (endpoint === undefined) return undefined;
  return { endpoint, stableId: peer.stableId, userId: peer.user?.id ?? null, tags: peer.tags };
}

function mentionedIds(sources: ParcelSources): string[] {
  return [
    ...(sources.pairs?.pairs.map((pair) => pair.peerStableId) ?? []),
    ...(sources.pairs?.pending.map((pending) => pending.peerStableId) ?? []),
    ...sources.attempts.map((attempt) => attempt.peer),
    ...(sources.grants?.issued.map((grant) => grant.target) ?? []),
    ...(sources.grants?.installed.map((grant) => grant.target) ?? []),
  ];
}

function tagsWho(tags: readonly string[]): string | undefined {
  return tags.length === 0 ? undefined : tags.join(" ");
}

function isIpv4(address: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(address);
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const { [key]: _dropped, ...rest } = record;
  return rest;
}
