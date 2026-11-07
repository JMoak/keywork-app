import type { EndReason, PeerIdentity } from "./messages.ts";

export interface Clock {
  now(): number;
}

export type GrantScope = "view" | "control";

export const grantScopes = ["view", "control"] as const satisfies readonly GrantScope[];

export interface GrantTerms {
  readonly scope: GrantScope;
  readonly lifetimeMs: number;
  readonly idleTimeoutMs: number;
  readonly maxDurationMs: number;
  readonly reconfirmEveryMs: number;
}

export const minute = 60_000;

export const viewGrantTerms: GrantTerms = {
  scope: "view",
  lifetimeMs: 60 * minute,
  idleTimeoutMs: 5 * minute,
  maxDurationMs: 60 * minute,
  reconfirmEveryMs: 30 * minute,
};

export const controlGrantTerms: GrantTerms = {
  scope: "control",
  lifetimeMs: 60 * minute,
  idleTimeoutMs: 5 * minute,
  maxDurationMs: 60 * minute,
  reconfirmEveryMs: 30 * minute,
};

export interface ScreenGrant {
  readonly id: string;
  readonly sessionId: string;
  readonly token: string;
  readonly scope: GrantScope;
  readonly over?: string | undefined;
  readonly grantee: PeerIdentity;
  readonly displays: readonly string[];
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly idleTimeoutMs: number;
  readonly maxDurationMs: number;
  readonly reconfirmEveryMs: number;
}

export interface GrantRequest {
  readonly id: string;
  readonly sessionId: string;
  readonly token: string;
  readonly grantee: PeerIdentity;
  readonly displays: readonly string[];
}

export type GrantLapse = Extract<EndReason, "expired" | "idle" | "max-duration">;

export type GrantDue = { grant: ScreenGrant; due: GrantLapse | "reconfirm" };

export type GrantStanding =
  | { live: true; grant: ScreenGrant }
  | { live: false; reason: GrantLapse | "revoked" | "unknown" };

export interface GrantBook {
  issue(request: GrantRequest): ScreenGrant;
  allowControl(viewGrantId: string, id: string): ScreenGrant | undefined;
  controlOver(viewGrantId: string): ScreenGrant | undefined;
  started(grantId: string): void;
  touched(grantId: string): void;
  reconfirmed(grantId: string): void;
  standing(grantId: string): GrantStanding;
  allows(grantId: string, displayId: string): boolean;
  byToken(token: string): ScreenGrant | undefined;
  bySession(sessionId: string): ScreenGrant | undefined;
  due(): GrantDue[];
  revoke(grantId: string): ScreenGrant | undefined;
  live(): ScreenGrant[];
}

export function grantBook(
  clock: Clock,
  terms: GrantTerms = viewGrantTerms,
  controlTerms: GrantTerms = controlGrantTerms,
): GrantBook {
  const entries = new Map<string, GrantEntry>();

  const record = (grant: ScreenGrant, startedAt: number | undefined): ScreenGrant => {
    entries.set(grant.id, {
      grant,
      startedAt,
      lastActivityAt: grant.issuedAt,
      confirmedAt: grant.issuedAt,
      reconfirming: false,
    });
    return grant;
  };

  const controlEntryOver = (viewGrantId: string): GrantEntry | undefined =>
    [...entries.values()].find((entry) => entry.grant.over === viewGrantId);

  const lapseOf = (entry: GrantEntry, now: number): GrantLapse | undefined => {
    if (now >= entry.grant.expiresAt) return "expired";
    if (entry.startedAt !== undefined && now >= entry.startedAt + entry.grant.maxDurationMs) {
      return "max-duration";
    }
    if (now >= entry.lastActivityAt + entry.grant.idleTimeoutMs) return "idle";
    return undefined;
  };

  const liveEntry = (grantId: string): GrantEntry | undefined => {
    const entry = entries.get(grantId);
    return entry === undefined || lapseOf(entry, clock.now()) !== undefined ? undefined : entry;
  };

  return {
    issue: (request) => {
      const issuedAt = clock.now();
      return record(
        {
          ...request,
          displays: [...request.displays],
          scope: terms.scope,
          issuedAt,
          expiresAt: issuedAt + terms.lifetimeMs,
          idleTimeoutMs: terms.idleTimeoutMs,
          maxDurationMs: terms.maxDurationMs,
          reconfirmEveryMs: terms.reconfirmEveryMs,
        },
        undefined,
      );
    },
    allowControl: (viewGrantId, id) => {
      const view = liveEntry(viewGrantId)?.grant;
      if (view === undefined || view.scope !== "view") return undefined;
      const prior = controlEntryOver(viewGrantId);
      if (prior !== undefined) entries.delete(prior.grant.id);
      const issuedAt = clock.now();
      return record(
        {
          id,
          sessionId: view.sessionId,
          token: view.token,
          scope: controlTerms.scope,
          over: view.id,
          grantee: view.grantee,
          displays: view.displays,
          issuedAt,
          expiresAt: Math.min(view.expiresAt, issuedAt + controlTerms.lifetimeMs),
          idleTimeoutMs: controlTerms.idleTimeoutMs,
          maxDurationMs: controlTerms.maxDurationMs,
          reconfirmEveryMs: controlTerms.reconfirmEveryMs,
        },
        issuedAt,
      );
    },
    controlOver: (viewGrantId) => {
      const entry = controlEntryOver(viewGrantId);
      return entry === undefined ? undefined : liveEntry(entry.grant.id)?.grant;
    },
    started: (grantId) => {
      const entry = liveEntry(grantId);
      if (entry === undefined || entry.startedAt !== undefined) return;
      entry.startedAt = clock.now();
      entry.lastActivityAt = entry.startedAt;
    },
    touched: (grantId) => {
      const entry = liveEntry(grantId);
      if (entry !== undefined) entry.lastActivityAt = clock.now();
    },
    reconfirmed: (grantId) => {
      const entry = liveEntry(grantId);
      if (entry === undefined) return;
      entry.confirmedAt = clock.now();
      entry.reconfirming = false;
    },
    standing: (grantId) => {
      const entry = entries.get(grantId);
      if (entry === undefined) return { live: false, reason: "unknown" };
      const lapse = lapseOf(entry, clock.now());
      return lapse === undefined
        ? { live: true, grant: entry.grant }
        : { live: false, reason: lapse };
    },
    allows: (grantId, displayId) => liveEntry(grantId)?.grant.displays.includes(displayId) ?? false,
    byToken: (token) =>
      [...entries.values()].find(
        (entry) =>
          entry.grant.scope === "view" && entry.grant.token === token && liveEntry(entry.grant.id),
      )?.grant,
    bySession: (sessionId) =>
      [...entries.values()].find(
        (entry) => entry.grant.scope === "view" && entry.grant.sessionId === sessionId,
      )?.grant,
    due: () => {
      const now = clock.now();
      return [...entries.values()].flatMap((entry): GrantDue[] => {
        const lapse = lapseOf(entry, now);
        if (lapse !== undefined) return [{ grant: entry.grant, due: lapse }];
        if (entry.reconfirming || now < entry.confirmedAt + entry.grant.reconfirmEveryMs) return [];
        entry.reconfirming = true;
        return [{ grant: entry.grant, due: "reconfirm" }];
      });
    },
    revoke: (grantId) => {
      const entry = entries.get(grantId);
      entries.delete(grantId);
      const control = controlEntryOver(grantId);
      if (control !== undefined) entries.delete(control.grant.id);
      return entry?.grant;
    },
    live: () =>
      [...entries.values()]
        .filter((entry) => lapseOf(entry, clock.now()) === undefined)
        .map((entry) => entry.grant),
  };
}

interface GrantEntry {
  readonly grant: ScreenGrant;
  startedAt: number | undefined;
  lastActivityAt: number;
  confirmedAt: number;
  reconfirming: boolean;
}
