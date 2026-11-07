import { z } from "zod";

export const signalingVersion = 1;

const signalId = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const sessionId = signalId;
const grantId = signalId;
const displayId = z.string().min(1).max(64);

export const peerIdentitySchema = z
  .object({
    node: z.object({ stableId: z.string().min(1), name: z.string().min(1) }).strict(),
    user: z
      .object({ id: z.string().min(1), loginName: z.string().min(1), displayName: z.string() })
      .strict()
      .optional(),
    tags: z.array(z.string()).default([]),
  })
  .strict();

export const screenDisplaySchema = z
  .object({
    id: displayId,
    label: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    scaleFactor: z.number().positive(),
    primary: z.boolean(),
  })
  .strict();

export const iceCandidateFields = {
  candidate: z.string().max(1024),
  sdpMid: z.string().max(64).nullable(),
  sdpMLineIndex: z.number().int().min(0).max(255).nullable(),
  usernameFragment: z.string().max(256).nullable(),
};

export interface IceCandidateInit {
  readonly candidate: string;
  readonly sdpMid: string | null;
  readonly sdpMLineIndex: number | null;
  readonly usernameFragment?: string | null | undefined;
}

const deniedReason = z.enum([
  "ignored",
  "timed-out",
  "busy",
  "rate-limited",
  "unverified",
  "needs-permission",
  "unavailable",
  "agent-control",
]);

export const screenScopes = ["view", "control"] as const;

export const controlStates = ["granted", "paused", "resumed", "revoked"] as const;

const controlGrant = z.object({ grantId, expiresAt: z.iso.datetime() }).strict();

export const endReason = z.enum([
  "viewer-left",
  "local-user",
  "kill-switch",
  "expired",
  "idle",
  "max-duration",
  "not-reconfirmed",
  "display-lost",
  "connection-lost",
  "protocol-error",
  "shutdown",
]);

const base = { v: z.literal(signalingVersion), sessionId };

export const signalMessageSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...base,
      kind: z.literal("request"),
      scope: z.enum(screenScopes),
      from: peerIdentitySchema.optional(),
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("granted"),
      grantId,
      token: z.string().min(32),
      expiresAt: z.iso.datetime(),
      displays: z.array(screenDisplaySchema),
      current: displayId,
      control: controlGrant.optional(),
    })
    .strict(),
  z.object({ ...base, kind: z.literal("denied"), reason: deniedReason }).strict(),
  z.object({ ...base, kind: z.literal("offer"), grantId, sdp: z.string().max(65536) }).strict(),
  z.object({ ...base, kind: z.literal("answer"), grantId, sdp: z.string().max(65536) }).strict(),
  z.object({ ...base, kind: z.literal("candidate"), grantId, ...iceCandidateFields }).strict(),
  z.object({ ...base, kind: z.literal("keepalive"), grantId }).strict(),
  z.object({ ...base, kind: z.literal("switch-display"), grantId, displayId }).strict(),
  z
    .object({
      ...base,
      kind: z.literal("displays"),
      grantId,
      displays: z.array(screenDisplaySchema),
      current: displayId,
    })
    .strict(),
  z
    .object({ ...base, kind: z.literal("end"), grantId: grantId.optional(), reason: endReason })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("control"),
      grantId,
      state: z.enum(controlStates),
      control: controlGrant.optional(),
      reason: z.string().max(256).optional(),
    })
    .strict(),
]);

export type PeerIdentity = z.output<typeof peerIdentitySchema>;
export type ScreenDisplay = z.output<typeof screenDisplaySchema>;
export type DeniedReason = z.output<typeof deniedReason>;
export type EndReason = z.output<typeof endReason>;
export type ScreenScope = (typeof screenScopes)[number];
export type ControlState = (typeof controlStates)[number];
export type ControlGrantNotice = z.output<typeof controlGrant>;
export type SignalMessage = z.output<typeof signalMessageSchema>;
export type SignalType = SignalMessage["kind"];
export type SignalOf<Kind extends SignalType> = Extract<SignalMessage, { kind: Kind }>;

export type ParsedSignal = { ok: true; message: SignalMessage } | { ok: false; problem: string };

export function parseSignal(value: unknown): ParsedSignal {
  const parsed = signalMessageSchema.safeParse(value);
  if (parsed.success) return { ok: true, message: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, problem: `${issue?.path.join(".") || "message"}: ${issue?.message}` };
}

export function isHumanPeer(peer: PeerIdentity): boolean {
  return peer.user !== undefined && peer.tags.length === 0;
}

export function describePeer(peer: PeerIdentity): string {
  const who = peer.user === undefined ? "a tagged device" : personOf(peer.user);
  return `${who} on ${peer.node.name}`;
}

function personOf(user: NonNullable<PeerIdentity["user"]>): string {
  return user.displayName === "" || user.displayName === user.loginName
    ? user.loginName
    : `${user.displayName} (${user.loginName})`;
}
