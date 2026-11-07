import { clockWord } from "../../chrome/clock-word.ts";
import type {
  Lane,
  ListenerState,
  ParcelPairing,
  ParcelRole,
  ParcelRow,
  ParcelTally,
} from "./parcels.ts";
import type {
  AuditRow,
  AuditVerdict,
  Cap,
  Grant,
  PolicyHealth,
  RevocationUndelivered,
} from "./wire.ts";

export interface ParcelClock {
  now(): number;
  offsetMinutes(): number;
}

export const parcelsName = "parcels";
export const parcelsPaletteHeading = "in parcels";
export const fogMark = "░";
export const auditLinesShown = 3;

export function emptyStateLine(lookAgainChord: string): string {
  return `No other parcels yet · run the node on another tailnet machine, then look again with ${lookAgainChord}`;
}

export function headLine(tally: ParcelTally): string {
  return [
    count(tally.parcels, "parcel", "parcels"),
    tally.paired > 0 ? `${tally.paired} paired` : undefined,
    tally.pairing > 0 ? `${tally.pairing} pairing` : undefined,
    tally.gates > 0 ? count(tally.gates, "gate open", "gates open") : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

export interface HintChords {
  pair: string;
  confirm: string;
  gate: string;
  revoke: string;
  unpair: string;
}

export function hintLine(chords: HintChords): string {
  return [
    `${chords.pair} pair`,
    `${chords.confirm} confirm`,
    `${chords.gate} gate`,
    `${chords.revoke} revoke`,
    `${chords.unpair} unpair`,
  ].join(" · ");
}

export function laneWord(lane: Lane): string {
  switch (lane.kind) {
    case "here":
      return "here";
    case "direct":
      return "direct";
    case "peer-relay":
      return `${fogMark} peer relay`;
    case "derp":
      return `${fogMark} DERP ${lane.region}`;
    case "offline":
      return "offline";
    case "unknown":
      return "lane unknown";
    case "unlisted":
      return "not listed";
  }
}

export function pairingWord(pairing: ParcelPairing): string {
  switch (pairing.kind) {
    case "here":
      return pairing.claim ?? "this machine";
    case "paired":
      return pairing.pair.confirmedBy === "claim-code" ? "claimed host" : "paired";
    case "pairing-out":
    case "pairing-in":
      return "pairing";
    case "unpaired":
      return pairing.claimed ? "claimed elsewhere" : "unpaired";
    case "no-node":
      return "no node";
    case "unlisted":
      return "not paired";
  }
}

export function asideOf(row: ParcelRow): string {
  return `${laneWord(row.lane)} · ${pairingWord(row.pairing)}`;
}

export function identityWord(row: Pick<ParcelRow, "who" | "os">): string {
  return [row.who, row.os].filter((part) => part !== undefined && part !== "").join(" · ");
}

export function rolesLine(roles: readonly ParcelRole[]): string {
  return `roles ${roles.join(" · ")}`;
}

export function sasWord(sas: string): string {
  return /^\d{6}$/.test(sas) ? `${sas.slice(0, 3)} ${sas.slice(3)}` : sas;
}

export function codeLine(row: ParcelRow, confirmChord: string): string | undefined {
  const pairing = row.pairing;
  if (pairing.kind === "pairing-out") {
    const code = `code ${sasWord(pairing.attempt.sas)}`;
    switch (pairing.attempt.confirmation) {
      case "on-device":
        return `${code} · if ${row.machine} shows the same code, ${confirmChord} confirms`;
      case "claim-code":
        return `${code} · ${row.machine} is headless; ${confirmChord} asks for the claim code it printed at install`;
      case "endorsement":
        return `${code} · ${row.machine} is claimed; a console already paired there must endorse it, then ${confirmChord} confirms`;
    }
  }
  if (pairing.kind === "pairing-in") {
    if (pairing.pending.sas === null) {
      return `${row.machine} asks to pair · waiting for its console to send the code`;
    }
    return `code ${sasWord(pairing.pending.sas)} · the console on ${row.machine} asks to pair; if it shows the same code, ${confirmChord} confirms here`;
  }
  return undefined;
}

export function waitingLine(machine: string): string {
  return `waiting for ${machine} to confirm the code there`;
}

export function capWord(cap: Cap): string {
  switch (cap.kind) {
    case "files:read":
    case "files:write":
      return `${cap.kind} ${cap.paths.join(", ")}`;
    case "exec":
      return `exec ${cap.commands.join(", ")}`;
    default:
      return cap.kind;
  }
}

export interface GateContext {
  readonly names: ReadonlyMap<string, string>;
  readonly selfId: string | undefined;
  readonly clock: ParcelClock;
}

export function gateLine(grant: Grant, context: GateContext): string {
  const from =
    grant.subject.node === context.selfId
      ? ""
      : ` from ${context.names.get(grant.subject.node) ?? grant.subject.node}`;
  return [
    `gate ${grant.subject.creature}${from}`,
    ...grant.caps.map(capWord),
    expiryWord(grant.expiresAt, context.clock),
  ].join(" · ");
}

export function gateChoice(grant: Grant): string {
  return `${grant.subject.creature} ${grant.caps.map((cap) => cap.kind).join(" ")}`;
}

export function auditLine(row: AuditRow, context: GateContext, parcel: string): string {
  const actor =
    row.actorStableID === parcel
      ? ""
      : `${context.names.get(row.actorStableID) ?? row.actorStableID} `;
  const reason = row.reason === "" ? "" : ` · ${row.reason}`;
  return `audit ${whenWord(row.ts, context.clock)} ${actor}${row.decision} ${row.capability}${reason}`;
}

export function expiryWord(at: string, clock: ParcelClock): string {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return "expiry unknown";
  return ms > clock.now() ? `until ${whenWord(at, clock)}` : `expired ${whenWord(at, clock)}`;
}

export function whenWord(at: string, clock: ParcelClock): string {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return "an unknown time";
  const offset = clock.offsetMinutes();
  const time = clockWord(ms, offset);
  return dayOf(ms, offset) === dayOf(clock.now(), offset) ? time : `${dayOf(ms, offset)} ${time}`;
}

export function listenerWord(state: ListenerState): string | undefined {
  if (state.unreadable !== undefined) return `tailscale status unreadable: ${state.unreadable}`;
  if (state.idle !== undefined) return `not listening: ${state.idle}`;
  const bound = Object.entries(state.bound);
  if (bound.length === 0) return undefined;
  const ports = new Set(bound.map(([, port]) => port));
  const addresses = bound.map(([address]) => address).join(", ");
  return ports.size === 1
    ? `listening on ${addresses} · port ${[...ports].join("")}`
    : `listening on ${bound.map(([address, port]) => `${address} port ${port}`).join(", ")}`;
}

export function policyWord(policy: PolicyHealth, clock: ParcelClock): string {
  if (policy.findings.length === 0) return `policy verified ${whenWord(policy.checkedAt, clock)}`;
  return `policy: ${count(policy.findings.length, "finding", "findings")} · ${policy.findings.join("; ")}`;
}

export function chainWord(chain: AuditVerdict): string {
  if (chain.intact) return `audit chain intact · ${count(chain.rows, "row", "rows")}`;
  return `audit chain broken at row ${chain.index + 1}: ${chain.reason}`;
}

export function undeliveredLine(missed: RevocationUndelivered, machine: string): string {
  return `the ${missed.revocation.kind} revocation for ${machine} is not delivered yet after ${count(missed.attempts, "attempt", "attempts")}: ${missed.error}`;
}

export const notices = {
  unlisted: "this node does not list tailnet machines yet; rows come from pairs and gates only",
  notPairable: (machine: string) => `${machine} has no node to pair with`,
  alreadyPaired: (machine: string, unpairChord: string) =>
    `${machine} is already paired; ${unpairChord} unpairs it first`,
  thisMachine: "this is the machine you sit at; pair the others from here",
  nothingToConfirm: (machine: string) => `nothing to confirm on ${machine}`,
  noCodeYet: (machine: string) => `${machine} has not sent its code yet`,
  pairingBegun: (machine: string) => `pairing with ${machine} · compare the codes`,
  paired: (machine: string) => `paired with ${machine}`,
  confirmedHere: (machine: string, state: string) =>
    state === "paired"
      ? `paired with ${machine}`
      : `confirmed here · waiting for the console on ${machine}`,
  cancelled: (machine: string) => `pairing with ${machine} cancelled`,
  notPaired: (machine: string) => `${machine} is not paired with this console`,
  unpairAsk: (machine: string) => `unpair ${machine}? its pair key is forgotten here at once`,
  unpaired: (machine: string) => `unpaired ${machine}`,
  noGates: (machine: string) => `no gate is open onto ${machine}`,
  revokeAsk: (creature: string, machine: string) => `revoke ${creature}'s gate onto ${machine}?`,
  revokeWhich: (machine: string) => `revoke which gate onto ${machine}?`,
  revoked: (creature: string, machine: string) => `${creature}'s gate onto ${machine} is latched`,
  gateOpened: (creature: string, machine: string, until: string) =>
    `${creature} may act on ${machine} ${until}`,
  gateHere: "a gate onto this machine is opened from the console that owns it",
  claimCodeLabel: (machine: string) => `claim code printed on ${machine}`,
} as const;

export const gateFormLabels = {
  creature: "creature",
  caps: "caps",
  expiry: "until",
  creaturePlaceholder: "wren, or wren@spark-ad4d",
  capsPlaceholder: "exec bun, git status; files:read ~/src/**",
  expiryInitial: "1h",
  submit: "open the gate",
  title: (machine: string) => `open a gate onto ${machine}`,
} as const;

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function dayOf(ms: number, offsetMinutes: number): string {
  const shifted = new Date(ms + offsetMinutes * 60_000);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${month}-${day}`;
}
