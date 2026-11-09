import {
  chainOf,
  digestOf,
  type HabitatState,
  moveByHand,
  nextChangeAt,
  ownerOf,
  type PlotCard,
  type PowerTier,
  plotCardsOf,
  plotsFoldedWhileAway,
  projectAll,
  proposeSetting,
  restorePlot,
  ruleFromHand,
  stillShown,
  withYardStep,
  type YardCard,
  type YardContext,
  type YardSetting,
  yardCard,
  yardOf,
} from "@keywork-app/habitat";
import type { BusEnvelope, KeeperShowOutcome, Setting } from "@keywork-app/protocol";
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  untrack,
} from "solid-js";
import { sessionName } from "../chrome/session-name.ts";
import type { ShellSeams } from "../panes/index.ts";
import {
  type AttentionSource,
  createHabitatWorld,
  type HabitatWorld,
  houseOffsetMinutes,
  seatCreatures,
} from "../panes/stead/habitat.ts";
import { answerSetting } from "./answers.ts";
import { type AttendNotice, createAttentionFeed } from "./attention.ts";
import { createKeeperVoice } from "./context.ts";
import type { YardRuleBook } from "./rules.ts";
import type { KeeperSignals } from "./signals.ts";
import { type YardLineage, yardLineageOf } from "./trail.ts";
import { wakeWhenTheYardChanges } from "./wake.ts";

export interface YardModelSeams {
  readonly shell: ShellSeams;
  readonly home: Accessor<ShellSeams | undefined>;
  readonly focusedThread: Accessor<string | undefined>;
  readonly windowFocused: Accessor<boolean>;
  readonly reducedMotion: Accessor<boolean>;
  readonly signals: Accessor<KeeperSignals>;
  readonly rules: YardRuleBook;
  now(): number;
}

export interface YardModel {
  readonly settings: Accessor<readonly YardSetting[]>;
  readonly heldBack: Accessor<number>;
  readonly foldedAway: Accessor<readonly string[]>;
  readonly inside: Accessor<string | undefined>;
  readonly card: Accessor<YardCard>;
  readonly plots: Accessor<readonly PlotCard[]>;
  readonly lineage: YardLineage;
  attend(notice: AttendNotice): void;
  withdrawn(id: string): boolean;
  shellOf(setting: YardSetting): ShellSeams;
  ownerOf(setting: YardSetting): string;
  raiseByHand(setting: YardSetting): void;
  restorePlot(plot: PlotCard): void;
  answer(setting: YardSetting, outcome: KeeperShowOutcome): Promise<string | undefined>;
}

export const withdrawalsKept = 32;

type KeeperContext = Omit<YardContext, "keeperSpokeAt">;

export function createYardModel(seams: YardModelSeams): YardModel {
  const keeperContext = (): KeeperContext => {
    const signals = seams.signals();
    return {
      visible: signals.visible,
      focused: seams.windowFocused(),
      fullscreen: signals.fullscreen,
      doNotDisturb: signals.doNotDisturb,
      tier: tierOf(signals.visible, seams.windowFocused()),
      reducedMotion: seams.reducedMotion(),
      quietHours: signals.quietHours,
      focusedThread: seams.focusedThread(),
      rules: seams.rules.rules(),
      draftOpen: signals.draftOpen,
      streaming: signals.streaming,
      displayShared: signals.displayShared,
      fullscreenElsewhere: signals.fullscreenElsewhere,
      railFocused: signals.railFocused,
      returnedAt: signals.returnedAt,
    };
  };
  const withdrawals = createWithdrawals();
  onCleanup(seams.shell.feed.subscribe(withdrawals.note));
  const attention = createAttentionFeed();
  const { world, clock } = createYardWorld(seams, keeperContext, attention);
  const yard = createMemo(() => yardOf(world.state()));
  const home = followHome(seams.home, world, withdrawals.note);
  const shellOf = (setting: YardSetting): ShellSeams =>
    home.owns(setting.id) ? (seams.home() ?? seams.shell) : seams.shell;

  return {
    settings: () => Object.values(yard().settings).filter(stillShown),
    heldBack: () => digestOf(yard(), seams.signals().returnedAt).length,
    foldedAway: () =>
      plotsFoldedWhileAway(yard(), seams.signals().returnedAt).map((plot) => chainOf(yard(), plot)),
    inside: () => yard().visit?.id,
    card: () => yardCard(yard(), clock()),
    plots: () => plotCardsOf(Object.values(yard().settings)),
    lineage: yardLineageOf(yard),
    attend: attention.attend,
    withdrawn: withdrawals.has,
    shellOf,
    ownerOf: (setting) => {
      const owner = ownerOf(setting);
      if (owner.kind === "creature") return world.state().creatures[owner.slug]?.name ?? owner.slug;
      const store = shellOf(setting).store;
      return sessionName(store.summary(owner.sessionId), store.projection(owner.sessionId));
    },
    restorePlot: (plot) =>
      world.update((held) => ({ ...held, yard: restorePlot(yardOf(held), plot.id, seams.now()) })),
    raiseByHand: (setting) => {
      world.update((held) => ({
        ...held,
        yard: moveByHand(yardOf(held), setting.id, "unfold", seams.now()),
      }));
      seams.rules.record(ruleFromHand(setting, "unfold"));
    },
    answer: (setting, outcome) => answerSetting(shellOf(setting).client, setting.id, outcome),
  };
}

export function tierOf(visible: boolean, focused: boolean): PowerTier {
  if (!visible) return "hidden";
  return focused ? "interact" : "rest";
}

export function showEventsIn(batch: readonly BusEnvelope[]): BusEnvelope[] {
  return batch.filter(
    (envelope) => envelope.type === "show.proposed" || envelope.type === "show.settled",
  );
}

export function withdrawnIn(batch: readonly BusEnvelope[]): string[] {
  return batch.flatMap((envelope) =>
    envelope.type === "show.settled" && envelope.payload.outcome === "withdrawn"
      ? [envelope.payload.id]
      : [],
  );
}

function createYardWorld(
  seams: YardModelSeams,
  keeperContext: Accessor<KeeperContext>,
  attention: AttentionSource,
) {
  const { shell } = seams;
  const world = createHabitatWorld({
    rows: () => shell.store.state.summaries,
    bots: () => shell.store.surfaces.state.bots,
    currentSession: seams.focusedThread,
    creatures: () => shell.client.creatures(),
    settings: () => shell.client.settings(),
    attention,
    feed: shell.feed,
    now: seams.now,
    offsetMinutes: houseOffsetMinutes(),
  });
  const voice = createKeeperVoice(shell.feed);
  const [clock, setClock] = createSignal(seams.now());
  const context = (): YardContext => ({ ...keeperContext(), keeperSpokeAt: voice() });
  const step = (): void => {
    const at = seams.now();
    setClock(at);
    world.update((held) => withYardStep(held, untrack(context), at));
  };
  const awaiting = createMemo(() =>
    Object.values(yardOf(world.state()).settings)
      .filter((setting) => setting.shown === "glyph")
      .map((setting) => setting.id)
      .join(" "),
  );
  createEffect(on([awaiting, context], step));
  wakeWhenTheYardChanges({
    yard: createMemo(() => yardOf(world.state())),
    changesAt: nextChangeAt,
    now: seams.now,
    step,
  });
  return { world, clock };
}

interface HomeSource {
  owns(id: string): boolean;
}

function followHome(
  home: Accessor<ShellSeams | undefined>,
  world: HabitatWorld,
  noteWithdrawals: (batch: readonly BusEnvelope[]) => void,
): HomeSource {
  const [owned, setOwned] = createSignal<ReadonlySet<string>>(new Set());
  const own = (ids: readonly string[]): void => {
    if (ids.length > 0) setOwned((held) => new Set([...held, ...ids]));
  };
  const adopt = (batch: readonly BusEnvelope[]): void => {
    const shows = showEventsIn(batch);
    if (shows.length === 0) return;
    own(proposedIn(shows));
    noteWithdrawals(shows);
    world.update((held) => projectAll(held, shows));
  };
  const homeFeed = createMemo(() => home()?.feed);
  createEffect(
    on(homeFeed, (feed) => {
      const shell = untrack(home);
      if (feed === undefined || shell === undefined) return;
      onCleanup(feed.subscribe(adopt));
      void seatHome(shell, world, own);
    }),
  );
  return { owns: (id) => owned().has(id) };
}

async function seatHome(
  shell: ShellSeams,
  world: HabitatWorld,
  own: (ids: readonly string[]) => void,
): Promise<void> {
  const [listed, creatures] = await Promise.all([
    askQuietly(() => shell.client.settings()),
    askQuietly(() => shell.client.creatures()),
  ]);
  if (Array.isArray(creatures)) world.update((held) => seatCreatures(held, creatures));
  if (!Array.isArray(listed)) return;
  const live = listed.filter(stillShown);
  own(live.map((setting) => setting.id));
  world.update((held) => withProposals(held, live));
}

function askQuietly<Answer>(ask: () => Promise<Answer>): Promise<Answer | undefined> {
  return Promise.resolve()
    .then(ask)
    .catch(() => undefined);
}

function withProposals(state: HabitatState, settings: readonly Setting[]): HabitatState {
  return { ...state, yard: settings.reduce(proposeSetting, yardOf(state)) };
}

function proposedIn(batch: readonly BusEnvelope[]): string[] {
  return batch.flatMap((envelope) =>
    envelope.type === "show.proposed" ? [envelope.payload.setting.id] : [],
  );
}

function createWithdrawals() {
  const [withdrawn, setWithdrawn] = createSignal<readonly string[]>([]);
  return {
    note: (batch: readonly BusEnvelope[]): void => {
      const ids = withdrawnIn(batch);
      if (ids.length > 0) setWithdrawn((held) => [...held, ...ids].slice(-withdrawalsKept));
    },
    has: (id: string): boolean => withdrawn().includes(id),
  };
}
