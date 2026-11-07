import { parcelsPaletteHeading } from "./copy.ts";
import "../overview/overview.css";
import "./parcels.css";
import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { z } from "zod";
import { createTileFillStep, tileFill } from "../../chrome/stamp.ts";
import { hostFetch } from "../../host/transport.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { ChoiceLine, ConfirmLine, createCursor, DraftLine, NoticeLine } from "../overview/rows.tsx";
import {
  definePane,
  type KeyHints,
  type PaneLocalAction,
  type PaneProps,
  type ShellSeams,
} from "../registry.ts";
import {
  chainWord,
  emptyStateLine,
  expiryWord,
  type GateContext,
  gateChoice,
  gateFormLabels,
  headLine,
  hintLine,
  listenerWord,
  notices,
  type ParcelClock,
  parcelsName,
  policyWord,
  undeliveredLine,
} from "./copy.ts";
import { type DraftFields, grantDraftOf } from "./draft.ts";
import { GateForm } from "./gate-form.tsx";
import { ParcelEntry } from "./parcel-entry.tsx";
import {
  censusWithLanes,
  isOpen,
  type ListenerState,
  lanesHeardWhileReading,
  listenerAfter,
  machineNames,
  meshNewsOf,
  type OutboundAttempt,
  type ParcelRow,
  parcelRows,
  quietListener,
  type Reading,
  selfIdOf,
  tallyOf,
} from "./parcels.ts";
import {
  type AuditTrail,
  emptyTrail,
  followAudit,
  isUnserved,
  type MeshReply,
  type MeshRoutes,
  meshRoutesOver,
} from "./routes.ts";
import type { Census, Grant, GrantList, PairRecord, PairsReading } from "./wire.ts";

const parcelsSpec = z.object({ kind: z.literal("parcels") });

export type ParcelsSpec = z.output<typeof parcelsSpec>;

export const parcelsPane = definePane<ParcelsSpec>({
  kind: "parcels",
  heading: parcelsPaletteHeading,
  spec: parcelsSpec,
  home: "main",
  attire: "house",
  title: () => parcelsName,
  emptyState: (keys) => emptyStateLine(keys.chord("parcels.refresh")),
  component: Parcels,
  summon: {
    action: "parcels.summon",
    chords: "none",
    help: "parcels pane: every machine on the tailnet",
    command: {
      name: "parcels",
      description: "every machine on the tailnet with its lane, pairing, gates and audit",
      aliases: ["machines"],
    },
    spec: () => ({ kind: "parcels" }),
  },
  localActions: {
    "parcels.down": parcelAction(["j", "down"], "next parcel", "parcels-next"),
    "parcels.up": parcelAction(["k", "up"], "previous parcel", "parcels-previous"),
    "parcels.pair": parcelAction("p", "begin pairing with this parcel", "parcels-pair"),
    "parcels.confirm": parcelAction(
      "c",
      "confirm the six-digit code shown on both machines",
      "parcels-confirm",
    ),
    "parcels.unpair": parcelAction("u", "unpair, or cancel a pairing", "parcels-unpair"),
    "parcels.gate": parcelAction(
      "g",
      "open a gate onto this parcel for a creature",
      "parcels-gate",
    ),
    "parcels.revoke": parcelAction("x", "latch a gate onto this parcel", "parcels-revoke"),
    "parcels.refresh": parcelAction("r", "look at the tailnet again", "parcels-refresh"),
  },
});

export interface ParcelsSeams {
  readonly routes: MeshRoutes;
  readonly clock: ParcelClock;
}

export const systemClock: ParcelClock = {
  now: () => Date.now(),
  offsetMinutes: () => -new Date().getTimezoneOffset(),
};

export function liveSeams(shell: Pick<ShellSeams, "host" | "workspace">): ParcelsSeams {
  return { routes: meshRoutesOver(hostFetch(shell.host, shell.workspace)), clock: systemClock };
}

export function parcelChords(keys: KeyHints) {
  return {
    pair: keys.chord("parcels.pair"),
    confirm: keys.chord("parcels.confirm"),
    gate: keys.chord("parcels.gate"),
    revoke: keys.chord("parcels.revoke"),
    unpair: keys.chord("parcels.unpair"),
  };
}

export interface ParcelsBoardProps {
  pane: PaneProps<ParcelsSpec>;
  seams: ParcelsSeams;
}

type Prompt =
  | { kind: "unpair"; row: ParcelRow; pair: PairRecord }
  | { kind: "claim-code"; row: ParcelRow; attempt: OutboundAttempt }
  | { kind: "gate"; row: ParcelRow; problem: string | undefined }
  | { kind: "revoke"; row: ParcelRow; gates: readonly Grant[] };

type Busy = { id: string; waiting: boolean };

type Notice = { text: string; tone: "error" | undefined };

type Problems = Partial<Record<Reading, string | undefined>>;

const everyReading: readonly Reading[] = ["census", "pairs", "grants", "audit"];

export function ParcelsBoard(props: ParcelsBoardProps) {
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.pane.focused,
  );
  const routes = (): MeshRoutes => props.seams.routes;
  const clock = (): ParcelClock => props.seams.clock;
  const keys = (): KeyHints => props.pane.shell.keys;

  const [census, setCensus] = createSignal<Census>();
  const [unlisted, setUnlisted] = createSignal(false);
  const [pairs, setPairs] = createSignal<PairsReading>();
  const [grants, setGrants] = createSignal<GrantList>();
  const [trail, setTrail] = createSignal<AuditTrail>(emptyTrail);
  const [attempts, setAttempts] = createSignal<readonly OutboundAttempt[]>([]);
  const [listener, setListener] = createSignal(quietListener);
  const [problems, setProblems] = createSignal<Problems>({});
  const [loaded, setLoaded] = createSignal(false);
  const [busy, setBusy] = createSignal<Busy>();
  const [prompt, setPrompt] = createSignal<Prompt>();
  const [notice, setNotice] = createSignal<Notice>();
  const step = createTileFillStep(() => busy() !== undefined);

  const rows = createMemo(() =>
    parcelRows({
      census: census(),
      pairs: pairs(),
      grants: grants(),
      audit: trail().rows,
      attempts: attempts(),
      now: clock().now(),
    }),
  );
  const cursor = createCursor(() => rows().length);
  const atCursor = (): ParcelRow | undefined => rows()[cursor.index()];
  const context = createMemo(
    (): GateContext => ({
      names: machineNames(rows()),
      selfId: selfIdOf(rows()),
      clock: clock(),
    }),
  );
  const nameOf = (id: string): string => context().names.get(id) ?? id;
  const others = () => rows().filter((row) => !row.here);
  const health = () =>
    healthParts({ census: census(), trail: trail(), listener: listener(), clock: clock() });
  const troubles = () =>
    troubleLines({ census: census(), trail: trail(), problems: problems(), clock: clock() });

  const say = (text: string, tone?: "error"): void => {
    setNotice({ text, tone });
  };
  const sayReply = (reply: MeshReply<unknown>, success: string): void =>
    reply.ok ? say(success) : say(reply.detail, "error");
  const settle = (reading: Reading, problem?: string): void => {
    setProblems((held) => ({ ...held, [reading]: problem }));
  };

  const lanesHeard = lanesHeardWhileReading();
  const loaders: Readonly<Record<Reading, () => Promise<void>>> = {
    census: async () => {
      const tap = lanesHeard.open();
      const reply = await routes().census();
      const heard = tap.close();
      if (reply.ok) setCensus(censusWithLanes(reply.value, heard));
      if (!reply.ok && isUnserved(reply)) setCensus(undefined);
      setUnlisted(!reply.ok && reply.status === 404);
      settle("census", reply.ok || isUnserved(reply) ? undefined : reply.detail);
    },
    pairs: async () => {
      const reply = await routes().pairs();
      if (reply.ok) setPairs(reply.value);
      settle("pairs", reply.ok ? undefined : reply.detail);
    },
    grants: async () => {
      const reply = await routes().grants();
      if (reply.ok) setGrants(reply.value);
      settle("grants", reply.ok ? undefined : reply.detail);
    },
    audit: async () => {
      const reply = await followAudit(routes(), trail());
      if (reply.ok) setTrail(reply.value);
      settle("audit", reply.ok ? undefined : reply.detail);
    },
  };
  const reload = async (readings: Iterable<Reading>): Promise<void> => {
    await Promise.all([...readings].map((reading) => loaders[reading]()));
    setLoaded(true);
  };

  onMount(() => void reload(everyReading));
  onCleanup(
    props.pane.shell.feed.subscribe((batch) => {
      const news = meshNewsOf(batch);
      if (news.listener.length > 0)
        setListener((held) => news.listener.reduce(listenerAfter, held));
      lanesHeard.hear(news.lanes);
      if (news.lanes.length > 0) setCensus((held) => censusWithLanes(held, news.lanes));
      for (const missed of news.undelivered) {
        say(undeliveredLine(missed, nameOf(missed.revocation.target)), "error");
      }
      if (news.stale.size > 0) void reload(news.stale);
    }),
  );

  const withBusy = async <T,>(
    row: ParcelRow,
    waiting: boolean,
    work: () => Promise<T>,
  ): Promise<T> => {
    setBusy({ id: row.id, waiting });
    try {
      return await work();
    } finally {
      setBusy(undefined);
    }
  };
  const dropAttempt = (peer: string): void => {
    setAttempts((held) => held.filter((attempt) => attempt.peer !== peer));
  };

  const pair = async (row: ParcelRow): Promise<void> => {
    if (row.here) return say(notices.thisMachine);
    if (row.pairing.kind === "paired") {
      return say(notices.alreadyPaired(row.machine, keys().chord("parcels.unpair")));
    }
    if (row.pairing.kind === "pairing-out" || row.pairing.kind === "pairing-in") {
      return say(notices.pairingBegun(row.machine));
    }
    const target = row.target;
    if (target === undefined) return say(notices.notPairable(row.machine));
    const reply = await withBusy(row, false, () => routes().beginPairing(target));
    if (!reply.ok) return say(reply.detail, "error");
    setAttempts((held) => [
      ...held.filter((attempt) => attempt.peer !== row.id),
      { ...reply.value, peer: row.id },
    ]);
    say(notices.pairingBegun(row.machine));
  };

  const complete = async (row: ParcelRow, attempt: OutboundAttempt, claimCode?: string) => {
    setPrompt(undefined);
    const reply = await withBusy(row, true, () =>
      routes().completePairing(attempt.attemptId, { matches: true, claimCode }),
    );
    dropAttempt(row.id);
    sayReply(reply, notices.paired(row.machine));
    await reload(["census", "pairs", "audit"]);
  };

  const confirm = (row: ParcelRow) => {
    const pairing = row.pairing;
    if (pairing.kind === "pairing-out") {
      if (pairing.attempt.confirmation === "claim-code") {
        setPrompt({ kind: "claim-code", row, attempt: pairing.attempt });
        return;
      }
      void complete(row, pairing.attempt);
      return;
    }
    if (pairing.kind !== "pairing-in") return say(notices.nothingToConfirm(row.machine));
    if (pairing.pending.sas === null) return say(notices.noCodeYet(row.machine));
    void confirmHere(row, pairing.pending.pairingId, pairing.pending.sas);
  };

  const confirmHere = async (row: ParcelRow, pairingId: string, sas: string): Promise<void> => {
    const reply = await withBusy(row, false, () => routes().confirmHere(pairingId, sas));
    sayReply(reply, notices.confirmedHere(row.machine, reply.ok ? reply.value.state : ""));
    await reload(["pairs", "audit"]);
  };

  const unpair = (row: ParcelRow) => {
    const pairing = row.pairing;
    if (pairing.kind === "pairing-out") {
      dropAttempt(row.id);
      void routes().completePairing(pairing.attempt.attemptId, { matches: false });
      return say(notices.cancelled(row.machine));
    }
    if (pairing.kind !== "paired") return say(notices.notPaired(row.machine));
    setPrompt({ kind: "unpair", row, pair: pairing.pair });
  };

  const forget = async (row: ParcelRow, record: PairRecord): Promise<void> => {
    setPrompt(undefined);
    const reply = await withBusy(row, false, () => routes().unpair(record.id));
    sayReply(reply, notices.unpaired(row.machine));
    await reload(everyReading);
  };

  const openGate = (row: ParcelRow) => {
    if (row.here) return say(notices.gateHere);
    if (row.pairing.kind !== "paired") return say(notices.notPaired(row.machine));
    holdGate(row, undefined);
  };

  const holdGate = (row: ParcelRow, problem: string | undefined): void => {
    setPrompt({ kind: "gate", row, problem });
  };

  const issue = async (row: ParcelRow, fields: DraftFields): Promise<void> => {
    const draft = grantDraftOf(fields, {
      target: row.id,
      selfId: context().selfId,
      parcels: new Map(rows().map((parcel) => [parcel.machine, parcel.id])),
      now: clock().now(),
      offsetMinutes: clock().offsetMinutes(),
    });
    if (!draft.ok) return holdGate(row, draft.problem);
    const reply = await withBusy(row, false, () => routes().issueGrant(draft.value));
    if (!reply.ok) return holdGate(row, reply.detail);
    setPrompt(undefined);
    say(
      notices.gateOpened(
        reply.value.subject.creature,
        row.machine,
        expiryWord(reply.value.expiresAt, clock()),
      ),
    );
    await reload(["grants", "audit"]);
  };

  const askRevoke = (row: ParcelRow) => {
    const gates = row.gates.filter((gate) => isOpen(gate, clock().now()));
    if (gates.length === 0) return say(notices.noGates(row.machine));
    setPrompt({ kind: "revoke", row, gates: gates.slice(0, revokeChoiceLimit) });
  };

  const revoke = async (row: ParcelRow, gate: Grant): Promise<void> => {
    setPrompt(undefined);
    const reply = await withBusy(row, false, () => routes().revokeGrant(gate.id));
    sayReply(reply, notices.revoked(gate.subject.creature, row.machine));
    await reload(["grants", "audit"]);
  };

  props.pane.onAction((action) => {
    if (prompt() !== undefined) {
      setPrompt(undefined);
      return;
    }
    const row = atCursor();
    if (action === "parcels.down") return cursor.move(1);
    if (action === "parcels.up") return cursor.move(-1);
    if (action === "parcels.refresh") return void reload(everyReading);
    if (row === undefined) return;
    switch (action) {
      case "parcels.pair":
        return void pair(row);
      case "parcels.confirm":
        return confirm(row);
      case "parcels.unpair":
        return unpair(row);
      case "parcels.gate":
        return openGate(row);
      case "parcels.revoke":
        return askRevoke(row);
    }
  });

  const promptOf = <K extends Prompt["kind"]>(
    kind: K,
  ): Extract<Prompt, { kind: K }> | undefined => {
    const pending = prompt();
    return pending?.kind === kind ? (pending as Extract<Prompt, { kind: K }>) : undefined;
  };

  return (
    <section class="kw-ov kw-parcels" aria-label={parcelsName} tabIndex={-1} ref={root}>
      <div class="kw-ov-head">
        <span class="kw-ov-head-lead">{headLine(tallyOf(rows(), clock().now()))}</span>
        <span class="kw-ov-head-detail">{hintLine(parcelChords(keys()))}</span>
      </div>
      <Show when={health()}>{(text) => <p class="kw-parcels-health">{text()}</p>}</Show>
      <ol class="kw-ov-list">
        <For each={rows()}>
          {(row, index) => (
            <ParcelEntry
              row={row}
              cursor={index() === cursor.index()}
              busyMark={busy()?.id === row.id ? tileFill[step() % tileFill.length] : undefined}
              waiting={busy()?.id === row.id && busy()?.waiting === true}
              context={context()}
              confirmChord={keys().chord("parcels.confirm")}
              onPick={() => cursor.set(index())}
            />
          )}
        </For>
      </ol>
      <Show when={loaded() && others().length === 0}>
        <EmptyState line={parcelsPane.emptyState(keys())} />
      </Show>
      <Switch>
        <Match when={promptOf("unpair")}>
          {(ask) => (
            <ConfirmLine
              question={notices.unpairAsk(ask().row.machine)}
              onConfirm={() => void forget(ask().row, ask().pair)}
              onCancel={() => setPrompt(undefined)}
            />
          )}
        </Match>
        <Match when={promptOf("claim-code")}>
          {(ask) => (
            <DraftLine
              label={notices.claimCodeLabel(ask().row.machine)}
              onSubmit={(code) => void complete(ask().row, ask().attempt, code)}
              onCancel={() => setPrompt(undefined)}
            />
          )}
        </Match>
        <Match when={promptOf("gate")}>
          {(ask) => (
            <GateForm
              title={gateFormLabels.title(ask().row.machine)}
              problem={ask().problem}
              onSubmit={(fields) => void issue(ask().row, fields)}
              onCancel={() => setPrompt(undefined)}
            />
          )}
        </Match>
        <Match when={promptOf("revoke")}>
          {(ask) => (
            <Show
              when={ask().gates.length > 1}
              fallback={
                <ConfirmLine
                  question={notices.revokeAsk(
                    ask().gates[0]?.subject.creature ?? "",
                    ask().row.machine,
                  )}
                  onConfirm={() => {
                    const gate = ask().gates[0];
                    if (gate !== undefined) void revoke(ask().row, gate);
                  }}
                  onCancel={() => setPrompt(undefined)}
                />
              }
            >
              <ChoiceLine
                question={notices.revokeWhich(ask().row.machine)}
                choices={revokeChoices(ask().gates)}
                onChoose={(key) => {
                  const gate = ask().gates[Number(key) - 1];
                  if (gate !== undefined) void revoke(ask().row, gate);
                }}
                onCancel={() => setPrompt(undefined)}
              />
            </Show>
          )}
        </Match>
      </Switch>
      <Show when={unlisted()}>
        <NoticeLine text={notices.unlisted} />
      </Show>
      <For each={troubles()}>{(text) => <NoticeLine text={text} tone="error" />}</For>
      <Show when={notice()}>{(said) => <NoticeLine text={said().text} tone={said().tone} />}</Show>
    </section>
  );
}

function Parcels(props: PaneProps<ParcelsSpec>) {
  return <ParcelsBoard pane={props} seams={liveSeams(props.shell)} />;
}

const revokeChoiceLimit = 9;

function revokeChoices(gates: readonly Grant[]): Record<string, string> {
  return Object.fromEntries(gates.map((gate, index) => [String(index + 1), gateChoice(gate)]));
}

interface HealthSources {
  census: Census | undefined;
  trail: AuditTrail;
  listener: ListenerState;
  clock: ParcelClock;
}

function healthParts(sources: HealthSources): string | undefined {
  const policy = sources.census?.policy ?? undefined;
  const chain = sources.trail.chain;
  const parts = [
    listenerWord(sources.listener),
    policy !== undefined && policy.findings.length === 0
      ? policyWord(policy, sources.clock)
      : undefined,
    chain?.intact === true ? chainWord(chain) : undefined,
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : parts.join(" · ");
}

interface TroubleSources {
  census: Census | undefined;
  trail: AuditTrail;
  problems: Problems;
  clock: ParcelClock;
}

function troubleLines(sources: TroubleSources): string[] {
  const policy = sources.census?.policy ?? undefined;
  const chain = sources.trail.chain;
  return [
    ...new Set([
      ...Object.values(sources.problems).filter((problem) => problem !== undefined),
      ...(policy !== undefined && policy.findings.length > 0
        ? [policyWord(policy, sources.clock)]
        : []),
      ...(chain?.intact === false ? [chainWord(chain)] : []),
    ]),
  ];
}

function parcelAction(
  chords: PaneLocalAction["chords"],
  help: string,
  command: string,
): PaneLocalAction {
  return { chords, help, command: { name: command, description: help } };
}
