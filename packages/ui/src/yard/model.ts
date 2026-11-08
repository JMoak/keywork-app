import {
  digestOf,
  moveByHand,
  ownerOf,
  type PowerTier,
  stillShown,
  withYardStep,
  type YardContext,
  type YardRule,
  type YardSetting,
  yardOf,
} from "@keywork-app/habitat";
import type { KeeperShowOutcome } from "@keywork-app/protocol";
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
import { createHabitatWorld, houseOffsetMinutes } from "../panes/stead/habitat.ts";
import { answerSetting } from "./answers.ts";
import { createKeeperVoice } from "./context.ts";

export interface YardModelSeams {
  readonly shell: ShellSeams;
  readonly focusedThread: Accessor<string | undefined>;
  readonly windowFocused: Accessor<boolean>;
  readonly reducedMotion: Accessor<boolean>;
  readonly now: () => number;
}

export interface YardModel {
  readonly settings: Accessor<readonly YardSetting[]>;
  readonly rules: Accessor<readonly YardRule[]>;
  readonly heldBack: Accessor<number>;
  ownerOf(setting: YardSetting): string;
  raiseByHand(setting: YardSetting): void;
  answer(setting: YardSetting, outcome: KeeperShowOutcome): Promise<string | undefined>;
}

export const depthRefreshMs = 30_000;

type KeeperContext = Omit<YardContext, "keeperSpokeAt">;

export function createYardModel(seams: YardModelSeams): YardModel {
  const [rules, setRules] = createSignal<readonly YardRule[]>([]);
  const [visible, setVisible] = createSignal(!documentHidden());
  const keeperContext = (): KeeperContext => ({
    visible: visible(),
    focused: seams.windowFocused(),
    fullscreen: false,
    doNotDisturb: false,
    tier: tierOf(visible(), seams.windowFocused()),
    reducedMotion: seams.reducedMotion(),
    quietHours: false,
    focusedThread: seams.focusedThread(),
    rules: rules(),
  });
  const world = createYardWorld(seams, keeperContext);
  const onVisibility = (): void => void setVisible(!documentHidden());
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
    onCleanup(() => document.removeEventListener("visibilitychange", onVisibility));
  }

  return {
    settings: () => Object.values(yardOf(world.state()).settings).filter(stillShown),
    rules,
    heldBack: () => digestOf(yardOf(world.state())).length,
    ownerOf: (setting) => {
      const owner = ownerOf(setting);
      if (owner.kind === "creature") return world.state().creatures[owner.slug]?.name ?? owner.slug;
      return sessionName(
        seams.shell.store.summary(owner.sessionId),
        seams.shell.store.projection(owner.sessionId),
      );
    },
    raiseByHand: (setting) => {
      world.update((held) => ({
        ...held,
        yard: moveByHand(yardOf(held), setting.id, "unfold", seams.now()),
      }));
      setRules((held) => withRule(held, handRuleOf(setting)));
    },
    answer: (setting, outcome) => answerSetting(seams.shell.client, setting.id, outcome),
  };
}

export function withRule(rules: readonly YardRule[], rule: YardRule): readonly YardRule[] {
  return [
    ...rules.filter(
      (held) =>
        held.creature !== rule.creature || held.kind !== rule.kind || held.lasts !== rule.lasts,
    ),
    rule,
  ];
}

export function handRuleOf(setting: YardSetting): YardRule {
  return {
    creature: setting.creature,
    kind: setting.what.kind,
    rung: "unfold",
    lasts: "while-present",
  };
}

export function tierOf(visible: boolean, focused: boolean): PowerTier {
  if (!visible) return "hidden";
  return focused ? "interact" : "rest";
}

function createYardWorld(seams: YardModelSeams, keeperContext: Accessor<KeeperContext>) {
  const { shell } = seams;
  const world = createHabitatWorld({
    rows: () => shell.store.state.summaries,
    bots: () => shell.store.surfaces.state.bots,
    currentSession: seams.focusedThread,
    creatures: () => shell.client.creatures(),
    settings: () => shell.client.settings(),
    feed: shell.feed,
    now: seams.now,
    offsetMinutes: houseOffsetMinutes(),
  });
  const voice = createKeeperVoice(shell.feed);
  const context = (): YardContext => ({ ...keeperContext(), keeperSpokeAt: voice() });
  const step = (): void =>
    world.update((held) => withYardStep(held, untrack(context), seams.now()));
  const awaiting = createMemo(() =>
    Object.values(yardOf(world.state()).settings)
      .filter((setting) => setting.shown === "glyph")
      .map((setting) => setting.id)
      .join(" "),
  );
  createEffect(on([awaiting, context], step));
  const refresh = setInterval(step, depthRefreshMs);
  onCleanup(() => clearInterval(refresh));
  return world;
}

function documentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}
