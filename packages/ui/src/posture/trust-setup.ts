import type { KeyworkClient } from "@keywork-app/client";
import {
  type GrantAheadRefusal,
  type GrantOutcome,
  isGrantAheadRefusal,
  type PermissionAsk,
  type PermissionRule,
  type RememberedScope,
} from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal } from "solid-js";
import type { TrustState } from "../shell/trust.ts";
import { type FactsClient, type PostureFacts, readPostureFacts } from "./facts.ts";
import {
  differenceNotice,
  type Fact,
  type Fingerprint,
  factsBeyond,
  fingerprintOf,
  sameFingerprint,
} from "./fingerprint.ts";
import {
  coversServerOf,
  type Offer,
  offerKey,
  offersFrom,
  type Proposal,
  proposalOf,
  sameRule,
} from "./proposal.ts";
import {
  type AcceptedRule,
  type PostureRecord,
  type PostureStorage,
  rememberedPosture,
  rememberPosture,
} from "./record.ts";

export type Decision = "accepted" | "declined";

export type DecisionOutcome =
  | { readonly kind: "granted"; readonly scope: RememberedScope }
  | { readonly kind: "waiting" }
  | { readonly kind: "declined" }
  | { readonly kind: "held" }
  | { readonly kind: "refused"; readonly reason: string };

export type SetupReading =
  | { readonly phase: "reading" }
  | { readonly phase: "failed"; readonly reason: string }
  | { readonly phase: "read"; readonly facts: PostureFacts; readonly proposal: Proposal };

export interface TrustSetup {
  reading(): SetupReading;
  focus(): readonly Fact[];
  shown(): readonly Offer[];
  decisionOf(offer: Offer): Decision | undefined;
  waitsForItsAsk(offer: Offer): boolean;
  refusalOf(offer: Offer): string | undefined;
  decide(offer: Offer, decision: Decision, sessionId?: string): Promise<DecisionOutcome>;
  acceptRest(sessionId?: string): Promise<readonly DecisionOutcome[]>;
  allDecided(): boolean;
  begin(): Promise<void>;
  refresh(): Promise<void>;
  launchNotice(): Promise<string | undefined>;
  acceptedScopeOf(ask: Pick<PermissionAsk, "tool" | "rules">): RememberedScope | undefined;
}

export type SetupClient = FactsClient &
  Pick<KeyworkClient, "grantWorkspaceRule" | "grantSessionRule">;

export interface TrustSetupSeams {
  readonly client: SetupClient;
  readonly storage: PostureStorage | undefined;
  readonly storageKey: string;
}

export type TrustArrival = "granted" | "found";

export function createTrustSetup(seams: TrustSetupSeams): TrustSetup {
  const [reading, setReading] = createSignal<SetupReading>({ phase: "reading" });
  const [record, setRecord] = createSignal(rememberedPosture(seams.storage, seams.storageKey));
  const [focus, setFocus] = createSignal<readonly Fact[]>([]);
  const [reviewed, setReviewed] = createSignal<Fingerprint>();
  const [standings, setStandings] = createSignal<ReadonlyMap<string, Standing>>(new Map());

  const remember = (change: Partial<PostureRecord>): void => {
    const next = { ...record(), ...change };
    setRecord(next);
    rememberPosture(seams.storage, seams.storageKey, next);
  };
  const queue = (offer: Offer): void =>
    remember({ accepted: [...withoutOffer(record().accepted, offer), acceptedOf(offer)] });
  const unqueue = (offer: Offer): void => {
    const kept = withoutOffer(record().accepted, offer);
    if (kept.length !== record().accepted.length) remember({ accepted: kept });
  };

  const standingOf = (offer: Offer): Standing | undefined => standings().get(offerKey(offer));
  const stand = (offer: Offer, standing: Standing | undefined): void => {
    setStandings((current) => withEntry(current, offerKey(offer), standing));
  };
  const recordedHere = (): PermissionRule[] =>
    [...standings().values()].flatMap((standing) =>
      standing.kind === "recorded" ? [standing.rule] : [],
    );

  const read = async (): Promise<PostureFacts | undefined> => {
    try {
      const facts = await readPostureFacts(seams.client);
      setReading({ phase: "read", facts, proposal: proposalOf(facts, recordedHere()) });
      const awaiting = stillAwaitingTheirAsk(record().accepted, facts);
      if (awaiting.length !== record().accepted.length) remember({ accepted: awaiting });
      return facts;
    } catch (error) {
      setReading({
        phase: "failed",
        reason: `could not read the permissions · ${messageOf(error)}`,
      });
      return undefined;
    }
  };

  const offers = (): readonly Offer[] => {
    const current = reading();
    return current.phase === "read" ? current.proposal.offers : [];
  };
  const shown = createMemo(() => (focus().length === 0 ? offers() : offersFrom(offers(), focus())));

  const waitsForItsAsk = (offer: Offer): boolean =>
    record().accepted.some((held) => holds(held, offer));
  const decisionOf = (offer: Offer): Decision | undefined => {
    const standing = standingOf(offer)?.kind;
    if (standing === "recorded" || waitsForItsAsk(offer)) return "accepted";
    return standing === "declined" ? "declined" : undefined;
  };
  const refusalOf = (offer: Offer): string | undefined => {
    const standing = standingOf(offer);
    return standing?.kind === "refused" ? standing.reason : undefined;
  };
  const allDecided = (): boolean => shown().every((offer) => decisionOf(offer) !== undefined);
  const settleWhenDecided = (): void => {
    const fingerprint = reviewed();
    if (fingerprint === undefined || !allDecided()) return;
    if (!sameFingerprint(record().settled, fingerprint)) remember({ settled: fingerprint });
  };

  const decline = (offer: Offer): DecisionOutcome => {
    if (standingOf(offer)?.kind === "recorded") return { kind: "held" };
    unqueue(offer);
    stand(offer, { kind: "declined" });
    return { kind: "declined" };
  };

  const accept = async (offer: Offer, sessionId: string | undefined): Promise<DecisionOutcome> => {
    if (standingOf(offer)?.kind === "recorded") return { kind: "granted", scope: offer.scope };
    const grant = grantOf(seams.client, offer, sessionId);
    if (grant === undefined) {
      queue(offer);
      stand(offer, undefined);
      return { kind: "waiting" };
    }
    const refusal = await refusalOfGrant(grant);
    unqueue(offer);
    if (refusal !== undefined) {
      stand(offer, { kind: "refused", reason: refusal });
      return { kind: "refused", reason: refusal };
    }
    stand(offer, { kind: "recorded", rule: offer.rule });
    return { kind: "granted", scope: offer.scope };
  };

  return {
    reading,
    focus,
    shown,
    decisionOf,
    waitsForItsAsk,
    refusalOf,
    decide: async (offer, decision, sessionId) => {
      const outcome = decision === "declined" ? decline(offer) : await accept(offer, sessionId);
      settleWhenDecided();
      return outcome;
    },
    acceptRest: async (sessionId) => {
      const undecided = shown().filter((offer) => decisionOf(offer) === undefined);
      const outcomes = await Promise.all(undecided.map((offer) => accept(offer, sessionId)));
      settleWhenDecided();
      return outcomes;
    },
    allDecided,
    begin: async () => {
      const facts = await read();
      if (facts === undefined) return;
      const { settled: before } = record();
      const current = fingerprintOf(facts, before);
      const beyond = factsBeyond(before, current);
      const narrowed = before !== undefined && offersFrom(offers(), beyond).length > 0;
      setFocus(narrowed ? beyond : []);
      setReviewed(current);
      remember({ noticed: current });
      settleWhenDecided();
    },
    refresh: async () => {
      await read();
    },
    launchNotice: async () => {
      const facts = await read();
      if (facts === undefined) return undefined;
      const { settled: before, noticed } = record();
      const current = fingerprintOf(facts, before);
      if (sameFingerprint(before, current) || sameFingerprint(noticed, current)) return undefined;
      const beyond = factsBeyond(before, current);
      const undecided = offersFrom(offers(), beyond).filter(
        (offer) => decisionOf(offer) === undefined,
      );
      if (undecided.length === 0) {
        remember({ settled: current });
        return undefined;
      }
      remember({ noticed: current });
      return differenceNotice(beyond, undecided.length, before === undefined);
    },
    acceptedScopeOf: (ask) => acceptedScopeOf(record().accepted, ask),
  };
}

export function followTrustArrival(
  state: () => TrustState,
  arrive: Readonly<Record<TrustArrival, () => void>>,
): void {
  const arrival = trustArrivals();
  createEffect(() => {
    const arrived = arrival(state().kind);
    if (arrived !== undefined) arrive[arrived]();
  });
}

export function trustArrivals(): (kind: TrustState["kind"]) => TrustArrival | undefined {
  let last: TrustState["kind"] = "unknown";
  return (kind) => {
    const previous = last;
    last = kind;
    if (kind !== "trusted" || previous === "trusted") return undefined;
    return previous === "unknown" ? "found" : "granted";
  };
}

function acceptedScopeOf(
  accepted: readonly AcceptedRule[],
  ask: Pick<PermissionAsk, "tool" | "rules">,
): RememberedScope | undefined {
  const rules = ask.rules ?? [];
  if (rules.length === 0) return undefined;
  const workspaceRules = accepted.filter((held) => held.scope === "workspace");
  if (rules.every((rule) => workspaceRules.some((held) => sameRule(held.rule, rule))))
    return "workspace";
  const servers = accepted.filter((held) => held.scope === "session");
  return servers.some((held) => coversServerOf(held.rule, ask.tool)) ? "session" : undefined;
}

function stillAwaitingTheirAsk(
  accepted: readonly AcceptedRule[],
  facts: PostureFacts,
): AcceptedRule[] {
  const granted = facts.permissions.workspace;
  return accepted.filter(
    (held) => held.scope !== "workspace" || !granted.some((rule) => sameRule(rule, held.rule)),
  );
}

function holds(held: AcceptedRule, offer: Offer): boolean {
  return held.scope === offer.scope && sameRule(held.rule, offer.rule);
}

function acceptedOf(offer: Offer): AcceptedRule {
  return { rule: offer.rule, scope: offer.scope };
}

type Standing =
  | { readonly kind: "declined" }
  | { readonly kind: "recorded"; readonly rule: PermissionRule }
  | { readonly kind: "refused"; readonly reason: string };

type Grant = () => Promise<GrantOutcome>;

function grantOf(
  client: SetupClient,
  offer: Offer,
  sessionId: string | undefined,
): Grant | undefined {
  if (offer.scope === "workspace") return () => client.grantWorkspaceRule(offer.rule);
  return sessionId === undefined ? undefined : () => client.grantSessionRule(sessionId, offer.rule);
}

async function refusalOfGrant(grant: Grant): Promise<string | undefined> {
  try {
    const outcome = await grant();
    return isGrantAheadRefusal(outcome) ? refusalWords(outcome) : undefined;
  } catch (error) {
    return `not recorded · ${messageOf(error)}`;
  }
}

function refusalWords(refusal: GrantAheadRefusal): string {
  switch (refusal.refused) {
    case "declined":
      return refusal.detail;
    case "missing":
      return "not recorded · that session is gone";
    case "invalid":
      return "not recorded · keywork could not read the rule";
  }
}

function withoutOffer(accepted: readonly AcceptedRule[], offer: Offer): AcceptedRule[] {
  return accepted.filter((held) => !holds(held, offer));
}

function withEntry<T>(
  map: ReadonlyMap<string, T>,
  key: string,
  value: T | undefined,
): ReadonlyMap<string, T> {
  const next = new Map(map);
  if (value === undefined) next.delete(key);
  else next.set(key, value);
  return next;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
