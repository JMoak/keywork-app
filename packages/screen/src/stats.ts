import type { PathClass } from "./media.ts";
import type { CandidateType } from "./tailnet.ts";

export interface PeerPathStatus {
  readonly curAddr?: string | undefined;
  readonly relay?: string | undefined;
  readonly peerRelay?: string | undefined;
  readonly self?: boolean | undefined;
}

export function pathClassOf(status: PeerPathStatus | undefined): PathClass {
  if (status === undefined) return "unknown";
  if (status.self === true) return "local";
  if (present(status.curAddr)) return "direct";
  if (present(status.peerRelay)) return "peer-relay";
  if (present(status.relay)) return "derp";
  return "unknown";
}

export interface PairEnds {
  readonly local: { readonly type: string };
  readonly remote: { readonly type: string };
  readonly rttMs?: number | undefined;
}

export function pathOfPair(pair: PairEnds | undefined): PathClass | undefined {
  if (pair === undefined) return undefined;
  const types = [pair.local.type, pair.remote.type];
  if (types.includes("relay")) return "relayed";
  return types.every((type) => directCandidateTypes.has(type)) ? "direct" : undefined;
}

const directCandidateTypes: ReadonlySet<string> = new Set(["host", "srflx", "prflx"]);

export function selectedPathOf(entries: readonly StatsEntry[]): PathClass | undefined {
  const byId = new Map(entries.map((entry) => [String(entry.id), entry]));
  return pathOfPair(selectedPair(entries, byId));
}

export type StatsEntry = Readonly<Record<string, unknown>> & { readonly type: string };

export interface CandidateEnd {
  readonly address: string;
  readonly port: number;
  readonly type: CandidateType | "unknown";
}

export interface StreamStats {
  readonly at: number;
  readonly pair?: { local: CandidateEnd; remote: CandidateEnd; rttMs?: number | undefined };
  readonly frames: number;
  readonly bytes: number;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly codec?: string | undefined;
  readonly qualityLimitation?: string | undefined;
  readonly jitterBufferMs?: number | undefined;
}

export interface StreamRates {
  readonly bitrateKbps: number;
  readonly framesPerSecond: number;
}

export function summarizeStats(
  entries: readonly StatsEntry[],
  direction: "inbound" | "outbound",
  at: number,
): StreamStats {
  const byId = new Map(entries.map((entry) => [String(entry.id), entry]));
  const rtp = entries.find((entry) => entry.type === `${direction}-rtp` && entry.kind === "video");
  const pair = selectedPair(entries, byId);
  const codec = rtp === undefined ? undefined : byId.get(String(rtp.codecId));
  const delay = numberOf(rtp?.jitterBufferDelay);
  const emitted = numberOf(rtp?.jitterBufferEmittedCount);
  return {
    at,
    frames: numberOf(rtp?.[direction === "inbound" ? "framesDecoded" : "framesEncoded"]) ?? 0,
    bytes: numberOf(rtp?.[direction === "inbound" ? "bytesReceived" : "bytesSent"]) ?? 0,
    ...(pair !== undefined && { pair }),
    ...defined("width", numberOf(rtp?.frameWidth)),
    ...defined("height", numberOf(rtp?.frameHeight)),
    ...defined("codec", stringOf(codec?.mimeType)),
    ...defined("qualityLimitation", stringOf(rtp?.qualityLimitationReason)),
    ...defined(
      "jitterBufferMs",
      delay !== undefined && emitted !== undefined && emitted > 0
        ? Math.round((delay / emitted) * 1000)
        : undefined,
    ),
  };
}

export function ratesBetween(earlier: StreamStats | undefined, later: StreamStats): StreamRates {
  if (earlier === undefined || later.at <= earlier.at)
    return { bitrateKbps: 0, framesPerSecond: 0 };
  const seconds = (later.at - earlier.at) / 1000;
  return {
    bitrateKbps: Math.max(0, Math.round(((later.bytes - earlier.bytes) * 8) / 1000 / seconds)),
    framesPerSecond: Math.max(0, Math.round((later.frames - earlier.frames) / seconds)),
  };
}

export function isHostPair(stats: StreamStats): boolean {
  return stats.pair?.local.type === "host" && stats.pair.remote.type === "host";
}

function selectedPair(
  entries: readonly StatsEntry[],
  byId: ReadonlyMap<string, StatsEntry>,
): StreamStats["pair"] {
  const transport = entries.find((entry) => entry.type === "transport");
  const pairId = transport?.selectedCandidatePairId;
  const pair =
    (pairId === undefined ? undefined : byId.get(String(pairId))) ??
    entries.find(
      (entry) =>
        entry.type === "candidate-pair" && entry.state === "succeeded" && entry.nominated === true,
    );
  if (pair === undefined) return undefined;
  const local = candidateEnd(byId.get(String(pair.localCandidateId)));
  const remote = candidateEnd(byId.get(String(pair.remoteCandidateId)));
  if (local === undefined || remote === undefined) return undefined;
  const rtt = numberOf(pair.currentRoundTripTime);
  return {
    local,
    remote,
    ...defined("rttMs", rtt === undefined ? undefined : Math.round(rtt * 1000)),
  };
}

function candidateEnd(entry: StatsEntry | undefined): CandidateEnd | undefined {
  if (entry === undefined) return undefined;
  const type = stringOf(entry.candidateType);
  return {
    address: stringOf(entry.address) ?? stringOf(entry.ip) ?? "",
    port: numberOf(entry.port) ?? 0,
    type:
      type === "host" || type === "srflx" || type === "prflx" || type === "relay"
        ? type
        : "unknown",
  };
}

function defined<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): { [K in Key]?: Value } {
  return (value === undefined ? {} : { [key]: value }) as { [K in Key]?: Value };
}

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function present(value: string | undefined): boolean {
  return value !== undefined && value !== "";
}
