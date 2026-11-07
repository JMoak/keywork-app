import type { EndReason, SignalMessage, SignalType } from "./messages.ts";

export type Role = "viewer" | "sharer";

export type Direction = "in" | "out";

export type Phase =
  | "idle"
  | "asking"
  | "consenting"
  | "awaiting-offer"
  | "answering"
  | "offering"
  | "awaiting-answer"
  | "connecting"
  | "live"
  | "ended";

export interface SignalSession {
  readonly role: Role;
  readonly sessionId: string;
  readonly phase: Phase;
  readonly grantId?: string | undefined;
  readonly endReason?: EndReason | "denied" | undefined;
}

export type Step = { ok: true; session: SignalSession } | { ok: false; problem: string };

export function newSession(role: Role, sessionId: string): SignalSession {
  return { role, sessionId, phase: "idle" };
}

export function step(session: SignalSession, direction: Direction, message: SignalMessage): Step {
  if (session.phase === "ended") return refuse(session, direction, message, "the session ended");
  if (message.sessionId !== session.sessionId) {
    return refuse(session, direction, message, "it belongs to another session");
  }
  if (message.kind === "end") return ended(session, message.reason);
  const rule = transitions[session.role][`${direction} ${message.kind}`];
  if (rule === undefined || !rule.from.includes(session.phase)) {
    return refuse(session, direction, message, `it is out of order in ${session.phase}`);
  }
  const grantProblem = grantMismatch(session, message);
  if (grantProblem !== undefined) return refuse(session, direction, message, grantProblem);
  return { ok: true, session: advance(session, message, rule.to) };
}

export function connected(session: SignalSession): SignalSession {
  return session.phase === "connecting" ? { ...session, phase: "live" } : session;
}

export function ended(session: SignalSession, reason: EndReason | "denied"): Step {
  return { ok: true, session: { ...session, phase: "ended", endReason: reason } };
}

interface Transition {
  readonly from: readonly Phase[];
  readonly to: Phase | "stay";
}

type Key = `${Direction} ${Exclude<SignalType, "end">}`;

const streaming = ["connecting", "live"] as const satisfies readonly Phase[];

const transitions: Record<Role, Partial<Record<Key, Transition>>> = {
  viewer: {
    "out request": { from: ["idle"], to: "asking" },
    "in granted": { from: ["asking"], to: "awaiting-offer" },
    "in denied": { from: ["asking"], to: "ended" },
    "in offer": { from: ["awaiting-offer"], to: "answering" },
    "out answer": { from: ["answering"], to: "connecting" },
    "in candidate": { from: ["answering", ...streaming], to: "stay" },
    "out candidate": { from: streaming, to: "stay" },
    "in displays": { from: streaming, to: "stay" },
    "out keepalive": { from: streaming, to: "stay" },
    "out switch-display": { from: ["live"], to: "stay" },
    "in control": { from: ["awaiting-offer", "answering", ...streaming], to: "stay" },
  },
  sharer: {
    "in request": { from: ["idle"], to: "consenting" },
    "out granted": { from: ["consenting"], to: "offering" },
    "out denied": { from: ["consenting"], to: "ended" },
    "out offer": { from: ["offering"], to: "awaiting-answer" },
    "in answer": { from: ["awaiting-answer"], to: "connecting" },
    "out candidate": { from: ["awaiting-answer", ...streaming], to: "stay" },
    "in candidate": { from: streaming, to: "stay" },
    "in keepalive": { from: streaming, to: "stay" },
    "in switch-display": { from: ["live"], to: "stay" },
    "out displays": { from: streaming, to: "stay" },
    "out control": { from: ["offering", "awaiting-answer", ...streaming], to: "stay" },
  },
};

function advance(
  session: SignalSession,
  message: SignalMessage,
  to: Phase | "stay",
): SignalSession {
  const phase = to === "stay" ? session.phase : to;
  if (message.kind === "granted") return { ...session, phase, grantId: message.grantId };
  if (message.kind === "denied") return { ...session, phase, endReason: "denied" };
  return { ...session, phase };
}

function grantMismatch(session: SignalSession, message: SignalMessage): string | undefined {
  if (!("grantId" in message) || message.kind === "granted") return undefined;
  return message.grantId === session.grantId
    ? undefined
    : "it carries a grant this session never got";
}

function refuse(
  session: SignalSession,
  direction: Direction,
  message: SignalMessage,
  why: string,
): Step {
  const verb = direction === "in" ? "received" : "sent";
  return { ok: false, problem: `${session.role} ${verb} ${message.kind}, but ${why}` };
}
