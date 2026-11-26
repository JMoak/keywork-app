import type { LaneKind } from "./kit.ts";

export interface MachineReading {
  readonly stableId: string;
  readonly machine: string;
  readonly os?: string | undefined;
  readonly online: boolean;
  readonly path: {
    readonly kind: string;
    readonly relay?: string | undefined;
    readonly region?: string | undefined;
  };
  readonly node: { readonly version?: string | undefined } | null;
}

export interface MachineCensus {
  readonly self?: MachineReading | null | undefined;
  readonly peers: readonly MachineReading[];
}

export type LandKind = "home" | "hall" | "bare";

export type Lane =
  | { readonly kind: "here" }
  | { readonly kind: "direct" }
  | { readonly kind: "relayed"; readonly by: "peer-relay" | "derp"; readonly through: string }
  | { readonly kind: "offline" }
  | { readonly kind: "unknown" };

export interface Land {
  readonly id: string;
  readonly name: string | undefined;
  readonly system: string | undefined;
  readonly kind: LandKind;
  readonly online: boolean;
  readonly answers: boolean;
  readonly version: string | undefined;
  readonly lane: Lane;
  readonly place: number | undefined;
}

export interface LandMemory {
  readonly order: readonly string[];
  readonly halls: readonly string[];
}

export const noLands: LandMemory = { order: [], halls: [] };
export const landMemoryLimit = 256;
export const homeId = "here";

export function landsOf(census: MachineCensus | undefined, memory: LandMemory): Land[] {
  const known = landMemoryAfter(memory, census);
  const peers = (census?.peers ?? []).filter((peer) => peer.stableId !== census?.self?.stableId);
  const placed = peers
    .map((peer) => landOf(peer, known))
    .filter((land) => land.place !== undefined)
    .sort((a, b) => (a.place ?? 0) - (b.place ?? 0));
  return [homeOf(census?.self ?? undefined), ...placed];
}

export function landMemoryAfter(memory: LandMemory, census: MachineCensus | undefined): LandMemory {
  if (census === undefined) return memory;
  const self = census.self?.stableId;
  const arriving = [...census.peers]
    .filter((peer) => peer.stableId !== self && !memory.order.includes(peer.stableId))
    .sort((a, b) => a.machine.localeCompare(b.machine) || a.stableId.localeCompare(b.stableId))
    .map((peer) => peer.stableId);
  const answering = census.peers
    .filter((peer) => answersNow(peer) && !memory.halls.includes(peer.stableId))
    .map((peer) => peer.stableId);
  if (arriving.length === 0 && answering.length === 0) return memory;
  return {
    order: [...memory.order, ...arriving].slice(0, landMemoryLimit),
    halls: [...memory.halls, ...answering].slice(-landMemoryLimit),
  };
}

export function sameLandMemory(one: LandMemory, other: LandMemory): boolean {
  return sameList(one.order, other.order) && sameList(one.halls, other.halls);
}

export function laneKindOf(lane: Lane): LaneKind | undefined {
  if (lane.kind === "direct") return "plank";
  return lane.kind === "relayed" ? "stones" : undefined;
}

export function faded(land: Land): boolean {
  return !land.online;
}

function homeOf(self: MachineReading | undefined): Land {
  return {
    id: self?.stableId ?? homeId,
    name: self?.machine,
    system: self?.os,
    kind: "home",
    online: true,
    answers: true,
    version: self?.node?.version,
    lane: { kind: "here" },
    place: undefined,
  };
}

function landOf(peer: MachineReading, memory: LandMemory): Land {
  const answers = answersNow(peer);
  const place = memory.order.indexOf(peer.stableId);
  return {
    id: peer.stableId,
    name: peer.machine,
    system: peer.os === "" ? undefined : peer.os,
    kind: answers || (!peer.online && memory.halls.includes(peer.stableId)) ? "hall" : "bare",
    online: peer.online,
    answers,
    version: answers ? peer.node?.version : undefined,
    lane: laneOf(peer),
    place: place < 0 ? undefined : place,
  };
}

function answersNow(peer: MachineReading): boolean {
  return peer.online && peer.node !== null;
}

function laneOf(peer: MachineReading): Lane {
  if (!peer.online) return { kind: "offline" };
  switch (peer.path.kind) {
    case "direct":
      return { kind: "direct" };
    case "peer-relay":
      return { kind: "relayed", by: "peer-relay", through: peer.path.relay ?? "" };
    case "derp":
      return { kind: "relayed", by: "derp", through: peer.path.region ?? "" };
    case "offline":
      return { kind: "offline" };
    default:
      return { kind: "unknown" };
  }
}

function sameList(one: readonly string[], other: readonly string[]): boolean {
  return one.length === other.length && one.every((id, index) => id === other[index]);
}
