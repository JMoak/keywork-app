import type { BusEnvelope, PermissionRule } from "@keywork-app/protocol";
import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { z } from "zod";
import { ruleText } from "../../page/ask-card.tsx";
import { factPhrases } from "../../posture/fingerprint.ts";
import type { Offer, Proposal } from "../../posture/proposal.ts";
import type {
  Decision,
  DecisionOutcome,
  SetupReading,
  TrustSetup,
} from "../../posture/trust-setup.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { createCursor, NoticeLine, OverviewRow, SubLine } from "../overview/rows.tsx";
import { summonedFrom, workingSession } from "../overview/working-session.ts";
import { changesPermissions } from "../permissions/store.ts";
import { definePane, type KeyHints, type PaneProps } from "../registry.ts";
import "../overview/overview.css";
import "./posture.css";

const postureSpec = z.object({ kind: z.literal("posture"), sessionId: z.string().optional() });

export type PostureSpec = z.output<typeof postureSpec>;

export const posturePane = definePane<PostureSpec>({
  kind: "posture",
  spec: postureSpec,
  home: "right",
  attire: "house",
  title: () => "trust setup",
  emptyState: (keys) =>
    `no posture until the workspace is trusted · ${keys.chord("trust.workspace")} trusts it`,
  component: TrustSetupPane,
  summon: {
    action: "posture.summon",
    chords: "leader shift+u",
    help: "trust setup: rules proposed from what keywork knows",
    command: {
      name: "trust-setup",
      description: "propose permission rules from this workspace's manifests and mcp servers",
    },
    spec: (shell) => ({ kind: "posture", ...summonedFrom(shell) }),
  },
  localActions: {
    "posture.down": {
      chords: ["j", "down"],
      help: "next proposed rule",
      command: { name: "setup-next", description: "move to the next proposed rule" },
    },
    "posture.up": {
      chords: ["k", "up"],
      help: "previous proposed rule",
      command: { name: "setup-previous", description: "move to the previous proposed rule" },
    },
    "posture.accept": {
      chords: "y",
      help: "accept the proposed rule",
      command: { name: "setup-accept", description: "accept the proposed rule under the cursor" },
    },
    "posture.decline": {
      chords: "n",
      help: "decline the proposed rule",
      command: { name: "setup-decline", description: "decline the proposed rule under the cursor" },
    },
    "posture.accept-rest": {
      chords: "a",
      help: "accept every rule not yet declined",
      command: {
        name: "setup-accept-rest",
        description: "accept every proposed rule that is not declined",
      },
    },
  },
});

export const setupKeys = "y accepts · n declines · a accepts the rest";

export const nothingToDecide = "nothing is proposed here";

export function scopeWord(offer: Offer): string {
  return offer.scope === "workspace" ? "every session" : "per session";
}

export function decisionNotice(offer: Offer, outcome: DecisionOutcome, keys: KeyHints): string {
  const rule = ruleText(offer.rule);
  switch (outcome.kind) {
    case "granted":
      return `accepted ${rule} · keywork holds it for ${outcome.scope === "workspace" ? "every session" : "this session"}`;
    case "waiting":
      return `accepted ${rule} · no session is focused, so each session records it when its first ask is answered with ${keys.chord("ask.session")}`;
    case "refused":
      return `not recorded · ${rule} stays undecided`;
    case "held":
      return `keywork already holds ${rule} · ${keys.chord("permissions.summon")} revokes it`;
    case "declined":
      return `declined ${rule} · it asks as before`;
  }
}

export function settledNotice(setup: TrustSetup): string {
  const offers = setup.shown();
  const accepted = offers.filter((offer) => setup.decisionOf(offer) === "accepted");
  const tally = `settled · ${accepted.length} accepted · ${offers.length - accepted.length} declined`;
  if (accepted.length === 0) return `${tally} · the posture stays as it was`;
  const waiting = accepted.filter((offer) => setup.waitsForItsAsk(offer)).length;
  if (waiting === 0) return `${tally} · keywork holds every accepted rule`;
  return waiting === 1
    ? `${tally} · 1 waits for its first ask`
    : `${tally} · ${waiting} wait for their first ask`;
}

export function restNotice(setup: TrustSetup, outcomes: readonly DecisionOutcome[]): string {
  if (setup.allDecided()) return settledNotice(setup);
  const refused = outcomes.filter((outcome) => outcome.kind === "refused").length;
  return refused === 1
    ? "1 rule not recorded · its row says why"
    : `${refused} rules not recorded · their rows say why`;
}

export function reviewLead(setup: TrustSetup, version: string | undefined): string {
  const focus = setup.focus();
  if (focus.length > 0) return `new since the last setup · ${factPhrases(focus).join(" · ")}`;
  return version === undefined ? "the whole posture" : `the whole posture · keywork ${version}`;
}

function TrustSetupPane(props: PaneProps<PostureSpec>) {
  const setup = (): TrustSetup | undefined =>
    props.shell.trust.untrusted() ? undefined : props.shell.trustSetup;
  return (
    <Show when={setup()} fallback={<EmptyState line={posturePane.emptyState(props.shell.keys)} />}>
      {(trustSetup) => <Review {...props} setup={trustSetup()} />}
    </Show>
  );
}

function Review(props: PaneProps<PostureSpec> & { setup: TrustSetup }) {
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused,
  );
  const cursor = createCursor(() => props.setup.shown().length);
  const [notice, setNotice] = createSignal<string>();
  const session = workingSession(props.shell, props.spec.sessionId);
  const atCursor = (): Offer | undefined => props.setup.shown()[cursor.index()];

  onMount(() => void props.setup.begin());
  onCleanup(
    props.shell.feed.subscribe((envelopes) => {
      if (envelopes.some(changesThePosture)) void props.setup.refresh();
    }),
  );

  const said = (offer: Offer, outcome: DecisionOutcome): string =>
    props.setup.allDecided()
      ? settledNotice(props.setup)
      : decisionNotice(offer, outcome, props.shell.keys);
  const decide = (decision: Decision): void => {
    const offer = atCursor();
    if (offer === undefined) {
      setNotice(nothingToDecide);
      return;
    }
    cursor.move(1);
    void props.setup
      .decide(offer, decision, session())
      .then((outcome) => setNotice(said(offer, outcome)));
  };
  const acceptRest = (): void => {
    if (props.setup.shown().length === 0) {
      setNotice(nothingToDecide);
      return;
    }
    void props.setup
      .acceptRest(session())
      .then((outcomes) => setNotice(restNotice(props.setup, outcomes)));
  };

  props.onAction((action) => {
    switch (action) {
      case "posture.down":
        return cursor.move(1);
      case "posture.up":
        return cursor.move(-1);
      case "posture.accept":
        return decide("accepted");
      case "posture.decline":
        return decide("declined");
      case "posture.accept-rest":
        return acceptRest();
    }
  });

  return (
    <section class="kw-ov kw-setup" aria-label="trust setup" tabIndex={-1} ref={root}>
      <div class="kw-ov-head">
        <span class="kw-ov-head-lead">
          {reviewLead(props.setup, versionOf(props.setup.reading()))}
        </span>
        <span class="kw-ov-head-detail">{setupKeys}</span>
      </div>
      <Switch>
        <Match when={props.setup.reading().phase === "reading"}>
          <p class="kw-setup-quiet">reading what keywork knows about this workspace</p>
        </Match>
        <Match when={failureOf(props.setup.reading())}>
          {(reason) => <NoticeLine text={reason()} tone="error" />}
        </Match>
        <Match when={proposalOf(props.setup.reading())}>
          {(proposal) => (
            <>
              <p class="kw-setup-reads">{proposal().reads}</p>
              <h3 class="kw-setup-heading">proposed</h3>
              <Show
                when={props.setup.shown().length > 0}
                fallback={
                  <p class="kw-setup-quiet">
                    nothing to propose · no manifest or mcp server here names a command
                  </p>
                }
              >
                <ol class="kw-ov-list kw-setup-offers" aria-label="proposed rules">
                  <For each={props.setup.shown()}>
                    {(offer, index) => (
                      <OfferRow
                        offer={offer}
                        decision={props.setup.decisionOf(offer)}
                        refusal={props.setup.refusalOf(offer)}
                        cursor={index() === cursor.index()}
                        onClick={() => cursor.set(index())}
                      />
                    )}
                  </For>
                </ol>
              </Show>
              <Show when={proposal().granted.length > 0}>
                <h3 class="kw-setup-heading">granted</h3>
                <RuleList rules={proposal().granted} label="granted" />
              </Show>
              <h3 class="kw-setup-heading">still asks</h3>
              <ul class="kw-setup-asks" aria-label="still asks">
                <For each={proposal().stillAsks}>
                  {(line) => <li class="kw-setup-ask">{line}</li>}
                </For>
              </ul>
              <For each={unreadOf(props.setup.reading())}>
                {(line) => <NoticeLine text={line} tone="error" />}
              </For>
            </>
          )}
        </Match>
      </Switch>
      <NoticeLine text={notice()} />
    </section>
  );
}

const decisionMarks: Record<Decision, string> = { accepted: "█", declined: "·" };

interface OfferRowProps {
  offer: Offer;
  decision: Decision | undefined;
  refusal: string | undefined;
  cursor: boolean;
  onClick(): void;
}

function OfferRow(props: OfferRowProps) {
  return (
    <>
      <OverviewRow
        cursor={props.cursor}
        muted={props.decision === "declined"}
        mark={props.decision === undefined ? undefined : decisionMarks[props.decision]}
        density={props.decision === "accepted" ? "full" : "light"}
        aside={props.decision ?? scopeWord(props.offer)}
        onClick={() => props.onClick()}
      >
        {ruleText(props.offer.rule)}
      </OverviewRow>
      <SubLine text={props.offer.reason} />
      <Show when={props.refusal}>{(refusal) => <SubLine text={refusal()} tone="error" />}</Show>
    </>
  );
}

function RuleList(props: { rules: readonly PermissionRule[]; label: string }) {
  return (
    <ul class="kw-setup-asks" aria-label={props.label}>
      <For each={props.rules}>
        {(rule) => <li class="kw-setup-rule">{ruleText(rule)} · every session</li>}
      </For>
    </ul>
  );
}

function changesThePosture(envelope: BusEnvelope): boolean {
  if (changesPermissions(envelope)) return true;
  return (
    envelope.type === "surface.changed" &&
    (envelope.payload.kind === "mcp" || envelope.payload.kind === "workspaces")
  );
}

function versionOf(reading: SetupReading): string | undefined {
  return reading.phase === "read" ? reading.facts.version : undefined;
}

function failureOf(reading: SetupReading): string | undefined {
  return reading.phase === "failed" ? reading.reason : undefined;
}

function proposalOf(reading: SetupReading): Proposal | undefined {
  return reading.phase === "read" ? reading.proposal : undefined;
}

function unreadOf(reading: SetupReading): readonly string[] {
  return reading.phase === "read" ? reading.facts.unread : [];
}
