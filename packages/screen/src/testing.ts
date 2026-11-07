import type { PeerIdentity, SignalMessage } from "./messages.ts";

export const sessionA = "session-aaaa-0001";
export const grantA = "grant-aaaa-0001";
export const tokenA = "token-0123456789abcdef0123456789abcdef";

export const keeper: PeerIdentity = {
  node: { stableId: "nStable1CNTRL", name: "spark-ad4d" },
  user: { id: "u123", loginName: "jordan@example.com", displayName: "Jordan" },
  tags: [],
};

export const taggedHost: PeerIdentity = {
  node: { stableId: "nStable9TAGGED", name: "workshop-1" },
  tags: ["tag:stead-host"],
};

export const tailnetCandidate =
  "candidate:842163049 1 udp 2122260223 100.101.102.103 47123 typ host generation 0";

export const lanCandidate =
  "candidate:842163050 1 udp 2122260223 192.168.1.20 47124 typ host generation 0";

export const display = {
  id: "2528732444",
  label: "Primary",
  width: 2560,
  height: 1440,
  scaleFactor: 1,
  primary: true,
};

type Builders = {
  [Kind in SignalMessage["kind"]]: (
    extra?: Partial<Omit<Extract<SignalMessage, { kind: Kind }>, "kind" | "v">>,
  ) => Extract<SignalMessage, { kind: Kind }>;
};

export const signal: Builders = {
  request: (extra) => ({ v: 1, kind: "request", sessionId: sessionA, scope: "view", ...extra }),
  granted: (extra) => ({
    v: 1,
    kind: "granted",
    sessionId: sessionA,
    grantId: grantA,
    token: tokenA,
    expiresAt: "2026-11-05T10:00:00.000Z",
    displays: [display],
    current: display.id,
    ...extra,
  }),
  denied: (extra) => ({ v: 1, kind: "denied", sessionId: sessionA, reason: "ignored", ...extra }),
  control: (extra) => ({
    v: 1,
    kind: "control",
    sessionId: sessionA,
    grantId: grantA,
    state: "granted",
    ...extra,
  }),
  offer: (extra) => ({
    v: 1,
    kind: "offer",
    sessionId: sessionA,
    grantId: grantA,
    sdp: "v=0",
    ...extra,
  }),
  answer: (extra) => ({
    v: 1,
    kind: "answer",
    sessionId: sessionA,
    grantId: grantA,
    sdp: "v=0",
    ...extra,
  }),
  candidate: (extra) => ({
    v: 1,
    kind: "candidate",
    sessionId: sessionA,
    grantId: grantA,
    candidate: tailnetCandidate,
    sdpMid: "0",
    sdpMLineIndex: 0,
    usernameFragment: null,
    ...extra,
  }),
  keepalive: (extra) => ({
    v: 1,
    kind: "keepalive",
    sessionId: sessionA,
    grantId: grantA,
    ...extra,
  }),
  "switch-display": (extra) => ({
    v: 1,
    kind: "switch-display",
    sessionId: sessionA,
    grantId: grantA,
    displayId: display.id,
    ...extra,
  }),
  displays: (extra) => ({
    v: 1,
    kind: "displays",
    sessionId: sessionA,
    grantId: grantA,
    displays: [display],
    current: display.id,
    ...extra,
  }),
  end: (extra) => ({ v: 1, kind: "end", sessionId: sessionA, reason: "viewer-left", ...extra }),
};

export function manualClock(start = Date.parse("2026-11-05T09:00:00.000Z")) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
