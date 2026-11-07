import { controlGrantTerms, type GrantScope, type GrantTerms } from "./grants.ts";
import { type DeniedReason, describePeer, isHumanPeer, type PeerIdentity } from "./messages.ts";

export const consentTimeoutMs = 30_000;

export type ConsentAnswer = "allow" | "view-only" | "decline" | "timed-out";

export interface ConsentCard {
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly buttons: readonly string[];
  readonly answers?: readonly ConsentAnswer[] | undefined;
  readonly timeoutMs: number;
}

export interface ConsentTimers {
  set(run: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export type AskConsent = (card: ConsentCard, signal: AbortSignal) => Promise<number | undefined>;

export function requestCard(
  peer: PeerIdentity,
  terms: GrantTerms,
  scope: GrantScope = "view",
  control: GrantTerms = controlGrantTerms,
): ConsentCard {
  if (scope === "control") return controlRequestCard(peer, terms, control);
  return {
    title: "Screen sharing request",
    message: `${describePeer(peer)} wants to view this screen`,
    detail: [
      `Verified by your tailnet as ${peer.node.name} (${peer.node.stableId}).`,
      `View only: no control, no clipboard, no files, no audio.`,
      `Sharing ends after ${minutes(terms.maxDurationMs)} minutes and asks again every ${minutes(terms.reconfirmEveryMs)}.`,
      `Ignored automatically in ${seconds(consentTimeoutMs)} seconds.`,
    ].join("\n"),
    buttons: ["View only", "Ignore"],
    timeoutMs: consentTimeoutMs,
  };
}

export function reconfirmCard(peer: PeerIdentity, sharedForMs: number): ConsentCard {
  return {
    title: "Keep sharing your screen?",
    message: `${describePeer(peer)} has been viewing this screen for ${minutes(sharedForMs)} minutes`,
    detail: `Sharing stops in ${seconds(consentTimeoutMs)} seconds unless you keep it going.`,
    buttons: ["Keep sharing", "Stop"],
    timeoutMs: consentTimeoutMs,
  };
}

export function controlReconfirmCard(peer: PeerIdentity, controlledForMs: number): ConsentCard {
  return {
    title: "Keep allowing control?",
    message: `${describePeer(peer)} has controlled this screen for ${minutes(controlledForMs)} minutes`,
    detail: `Sharing stops in ${seconds(consentTimeoutMs)} seconds unless you answer; View only keeps viewing without control.`,
    buttons: ["Keep control", "View only"],
    answers: ["allow", "view-only"],
    timeoutMs: consentTimeoutMs,
  };
}

export async function decideConsent(
  card: ConsentCard,
  ask: AskConsent,
  timers: ConsentTimers,
): Promise<ConsentAnswer> {
  const abort = new AbortController();
  let timedOut = false;
  const timer = timers.set(() => {
    timedOut = true;
    abort.abort();
  }, card.timeoutMs);
  try {
    const button = await Promise.race([ask(card, abort.signal), aborted(abort.signal)]);
    if (timedOut) return "timed-out";
    const answers = card.answers ?? defaultAnswers;
    return button === undefined ? "decline" : (answers[button] ?? "decline");
  } catch {
    return timedOut ? "timed-out" : "decline";
  } finally {
    timers.clear(timer);
  }
}

export function deniedReasonFor(
  answer: Exclude<ConsentAnswer, "allow" | "view-only">,
): DeniedReason {
  return answer === "timed-out" ? "timed-out" : "ignored";
}

export type Admission = "admit" | Extract<DeniedReason, "unverified" | "busy" | "rate-limited">;

export interface AdmissionGate {
  admit(peer: PeerIdentity | undefined): Admission;
  settled(): void;
}

export function admissionGate(
  clock: { now(): number },
  limit: { perPeer: number; windowMs: number } = { perPeer: 3, windowMs: 60_000 },
): AdmissionGate {
  const recent = new Map<string, number[]>();
  let asking = false;
  return {
    admit: (peer) => {
      if (peer === undefined || !isHumanPeer(peer)) return "unverified";
      const now = clock.now();
      const window = (recent.get(peer.node.stableId) ?? []).filter(
        (at) => now - at < limit.windowMs,
      );
      recent.set(peer.node.stableId, [...window, now]);
      if (window.length >= limit.perPeer) return "rate-limited";
      if (asking) return "busy";
      asking = true;
      return "admit";
    },
    settled: () => {
      asking = false;
    },
  };
}

const defaultAnswers: readonly ConsentAnswer[] = ["allow", "decline"];

function controlRequestCard(
  peer: PeerIdentity,
  view: GrantTerms,
  control: GrantTerms,
): ConsentCard {
  return {
    title: "Screen control request",
    message: `${describePeer(peer)} wants to control this screen`,
    detail: [
      `Verified by your tailnet as ${peer.node.name} (${peer.node.stableId}).`,
      `Allow control lets them move the pointer and type here; View only lets them watch.`,
      `Moving your own mouse or pressing a key pauses their control until you resume it.`,
      `Control ends after ${minutes(control.maxDurationMs)} minutes and asks again every ${minutes(control.reconfirmEveryMs)}; viewing ends after ${minutes(view.maxDurationMs)}.`,
      `Ignored automatically in ${seconds(consentTimeoutMs)} seconds.`,
    ].join("\n"),
    buttons: ["Allow control", "View only", "Ignore"],
    answers: ["allow", "view-only", "decline"],
    timeoutMs: consentTimeoutMs,
  };
}

function aborted(signal: AbortSignal): Promise<undefined> {
  return new Promise((resolve) => signal.addEventListener("abort", () => resolve(undefined)));
}

function minutes(ms: number): number {
  return Math.round(ms / 60_000);
}

function seconds(ms: number): number {
  return Math.round(ms / 1000);
}
