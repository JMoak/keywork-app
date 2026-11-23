import type { CreatureSummary, SessionSummary } from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js";
import type { AppAction } from "../keys/actions.ts";
import type { ShellSeams } from "../panes/registry.ts";
import { creaturesListed } from "../shell/first-frame.ts";
import { createOnboardingController, type OnboardingController } from "./controller.ts";
import { introducingClient } from "./introduction.ts";
import type { CloudStanding } from "./models.ts";
import {
  firstRunWanted,
  type OnboardingSeams,
  type OnboardingStorage,
  onboardingStorageKey,
  type Phase,
  rememberedOnboarding,
  startOnboarding,
} from "./onboarding.ts";
import { onboardingClientFor } from "./requests.ts";
import { HatchStage } from "./stage.tsx";

export const onboardingActionId = "onboarding.start";

export const onboardingAction: AppAction = {
  chords: "leader 1",
  help: "make a creature",
  command: {
    name: "creature.new",
    label: "new creature",
    aliases: ["new-creature", "onboard", "hatch"],
    description:
      "make a creature on the stead: it hatches, you name it, and its first conversation opens",
  },
  invoke: (target) => {
    target.requestOnboarding();
    target.summon("stead");
  },
};

export function cloudStandingOf(rows: readonly SessionSummary[]): CloudStanding {
  const answered = [...rows]
    .filter((row) => row.model !== undefined)
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0];
  return answered?.model === undefined
    ? { kind: "unknown" }
    : { kind: "answering", model: answered.model };
}

export function onboardingSeamsOf(
  shell: ShellSeams,
  storage: OnboardingStorage | undefined,
): OnboardingSeams {
  return {
    client: onboardingClientFor(shell.host, shell.workspace),
    workspace: shell.workspace,
    cloud: () => cloudStandingOf(shell.store.state.summaries),
    seat: () => shell.store.surfaces.refetch("bots"),
    inject: (sessionId, text, creature) =>
      shell.client.inject(sessionId, { text, client: introducingClient, frame: { creature } }),
    openThread: (sessionId) => shell.sessions.openSession(sessionId),
    openConnect: () => shell.openPane({ kind: "terminal", mode: "bridge", verb: "connect" }),
    storage,
  };
}

export interface OnboardingOnTheSteadProps {
  readonly shell: ShellSeams;
  readonly automatic?: boolean;
  readonly controller?: OnboardingController;
  readonly storage?: OnboardingStorage | undefined;
  readonly seams?: Partial<OnboardingSeams> | undefined;
}

export function OnboardingOnTheStead(props: OnboardingOnTheSteadProps) {
  const controller = props.controller ?? props.shell.onboarding ?? createOnboardingController();
  const storage = props.storage ?? localStorageOrNone();
  const onboarding = startOnboarding({
    ...onboardingSeamsOf(props.shell, storage),
    ...props.seams,
  });
  const listed = props.automatic ? createCreatureListing(props.shell) : () => undefined;
  const wanted = (): boolean =>
    props.automatic === true &&
    firstRunWanted({
      trusted: props.shell.trust.state().kind === "trusted",
      creatures: listed(),
      remembered: rememberedOnboarding(storage, onboardingStorageKey(props.shell.workspace)),
    });
  const stagedElsewhere = (): boolean => {
    const staged = controller.active();
    return staged !== undefined && staged !== onboarding;
  };
  const showing = createMemo((): boolean => {
    const kind = onboarding.phase().kind;
    if (stagedElsewhere()) return false;
    return controller.requested() || (kind !== "closed" && (hatched(kind) || wanted()));
  });
  createEffect(
    on(
      () => onboarding.phase().kind,
      (kind) => {
        if (kind === "making" || kind === "closed") controller.clearRequest();
      },
    ),
  );
  createEffect(() => {
    if (showing()) onCleanup(controller.bind(onboarding));
  });
  return (
    <Show when={showing()}>
      <HatchStage onboarding={onboarding} controller={controller} random={props.seams?.random} />
    </Show>
  );
}

function hatched(kind: Phase["kind"]): boolean {
  return kind !== "egg" && kind !== "closed";
}

function createCreatureListing(
  shell: Pick<ShellSeams, "client" | "feed" | "trust">,
): () => readonly CreatureSummary[] | undefined {
  const [listed, setListed] = createSignal<readonly CreatureSummary[]>();
  const read = (): void => {
    void creaturesListed(shell.client).then((listing) => {
      if (listing !== undefined) setListed(listing);
    });
  };
  createEffect(
    on(
      () => shell.trust.state().kind,
      (kind) => {
        if (kind === "trusted") read();
      },
    ),
  );
  onCleanup(
    shell.feed.subscribe((batch) => {
      if (batch.some((envelope) => envelope.type === "creature.changed")) read();
    }),
  );
  return listed;
}

function localStorageOrNone(): OnboardingStorage | undefined {
  try {
    return typeof localStorage === "object" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}
